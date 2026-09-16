-- Periodo da OP da primeira a ultima OS, e cada desconto em uma OP so.
--
-- O teste com as OPs reais 06438808 (Taxi) e 06438807 (Guincho) quebrou a regra
-- "o periodo comeca no dia seguinte ao fim da OP anterior": a Porto paga a mesma
-- quinzena em mais de uma OP, entao uma virou a "anterior" da outra (06438807
-- ficou de 15/09 a 15/09), e o historico com buracos jogou o inicio da 06438808
-- para 30/04. Kawa escolheu: cada OP vai da primeira a ultima OS dela.
--
-- Com periodos que se sobrepoem, o mesmo gasto marcado cairia na janela de duas
-- OPs. Cada gasto passa a descontar numa OP so: a primeira que fecha (pela data
-- de fim, depois pelo id) em que o socorrista tem servico e cujo periodo cobre a
-- data do gasto.

create or replace function public.porto_recalcular_periodos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    with datas as (
        select os.ordem_pagamento_id as id,
               min(os.data_atendimento) as primeira,
               max(os.data_atendimento) as ultima
        from public.ordens_servico_porto os
        where os.ordem_pagamento_id is not null and os.data_atendimento is not null
        group by os.ordem_pagamento_id
    )
    update public.ordens_pagamento_porto op
       set periodo_inicio = d.primeira, periodo_fim = d.ultima
      from datas d
     where d.id = op.id
       and (op.periodo_inicio is distinct from d.primeira or op.periodo_fim is distinct from d.ultima);
end;
$$;
revoke execute on function public.porto_recalcular_periodos() from public, anon, authenticated;

-- Em qual OP cada gasto marcado desconta. Uma linha por gasto, uma OP por linha.
create or replace function public.descontos_atribuidos()
returns table (despesa_id bigint, ordem_pagamento_id bigint, motorista_id bigint, valor numeric, aprovada boolean)
language sql
stable
security definer
set search_path = ''
as $$
    select d.id, a.op_id, d.motorista_id, d.valor, d.aprovada
    from public.despesas d
    cross join lateral (
        select op.id as op_id
        from public.ordens_pagamento_porto op
        where op.periodo_fim is not null
          and d.data_lancamento between coalesce(op.periodo_inicio, op.periodo_fim) and op.periodo_fim
          and exists (
              select 1 from public.ordens_servico_porto os
              where os.ordem_pagamento_id = op.id
                and os.motorista_id = d.motorista_id
                and os.status_operacional <> 'CANCELADO')
        order by op.periodo_fim, op.id
        limit 1
    ) a
    where d.desconta_comissao
      and d.motorista_id is not null
      and d.status <> 'REJEITADO'
      and (d.protocolo is null or d.protocolo not like 'COMISSAO-%')
$$;
revoke execute on function public.descontos_atribuidos() from public, anon, authenticated;

create or replace function public.porto_sincronizar_comissoes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_pct numeric := public.percentual_comissao();
    v_categoria bigint;
    v_quem uuid;
    v_despesa bigint;
    r record;
begin
    perform set_config('fluxo.sincronizando_comissoes', 'on', true);

    select id into v_categoria from public.categorias
     where tipo = 'DESPESA'
       and lower(btrim(nome)) in ('comissão de socorrista', 'comissao de socorrista')
     order by id limit 1;
    if v_categoria is null then
        insert into public.categorias (nome, tipo) values ('Comissão de socorrista', 'DESPESA')
        returning id into v_categoria;
    end if;

    v_quem := coalesce((select auth.uid()),
        (select p.id from public.perfis p where p.perfil = 'ADMINISTRADOR' order by p.criado_em limit 1));

    for r in
        with devidas as (
            select op.id as op_id, op.numero, op.periodo_fim,
                   os.motorista_id, round(sum(os.valor_total) * v_pct, 2) as bruta
            from public.ordens_pagamento_porto op
            join public.ordens_servico_porto os on os.ordem_pagamento_id = op.id
            where os.motorista_id is not null
              and os.status_operacional <> 'CANCELADO'
              and op.periodo_fim is not null
            group by op.id, op.numero, op.periodo_fim, os.motorista_id
        ),
        descontos as (
            select da.ordem_pagamento_id as op_id, da.motorista_id, sum(da.valor) as valor
            from public.descontos_atribuidos() da
            where da.aprovada
            group by da.ordem_pagamento_id, da.motorista_id
        ),
        liquidas as (
            select dv.*, dv.bruta - coalesce(ds.valor, 0) as liquido
            from devidas dv
            left join descontos ds on ds.op_id = dv.op_id and ds.motorista_id = dv.motorista_id
        ),
        existentes as (
            select pc.ordem_pagamento_id as op_id, pc.motorista_id, pc.despesa_id
            from public.pagamentos_comissao pc
            where pc.ordem_pagamento_id is not null
        )
        select coalesce(l.op_id, e.op_id) as op_id,
               coalesce(l.motorista_id, e.motorista_id) as motorista_id,
               l.numero, l.periodo_fim, l.liquido, e.despesa_id
        from liquidas l
        full join existentes e on e.op_id = l.op_id and e.motorista_id = l.motorista_id
    loop
        if r.liquido is null or r.liquido <= 0 then
            if r.despesa_id is not null then
                delete from public.pagamentos_comissao
                 where ordem_pagamento_id = r.op_id and motorista_id = r.motorista_id;
                delete from public.despesas where id = r.despesa_id;
            end if;
        elsif r.despesa_id is null then
            insert into public.despesas (
                descricao, categoria_id, valor, data_lancamento, data_pagamento,
                motorista_id, protocolo, status, aprovada, aprovado_por, aprovado_em,
                criado_por, natureza)
            values (
                'Comissão de socorrista — OP ' || r.numero, v_categoria, r.liquido,
                r.periodo_fim, r.periodo_fim, r.motorista_id,
                'COMISSAO-OP-' || r.op_id::text || '-' || r.motorista_id::text,
                'PAGO', true, v_quem, now(), v_quem, 'GERAL')
            returning id into v_despesa;

            insert into public.pagamentos_comissao (
                motorista_id, ordem_pagamento_id, despesa_id, valor_pago, data_pagamento, pago_por)
            values (r.motorista_id, r.op_id, v_despesa, r.liquido, r.periodo_fim, v_quem);
        else
            update public.despesas
               set valor = r.liquido, data_lancamento = r.periodo_fim,
                   data_pagamento = r.periodo_fim,
                   descricao = 'Comissão de socorrista — OP ' || r.numero
             where id = r.despesa_id
               and (valor is distinct from r.liquido or data_lancamento is distinct from r.periodo_fim);
            update public.pagamentos_comissao
               set valor_pago = r.liquido, data_pagamento = r.periodo_fim
             where despesa_id = r.despesa_id
               and (valor_pago is distinct from r.liquido or data_pagamento is distinct from r.periodo_fim);
        end if;
    end loop;

    perform set_config('fluxo.sincronizando_comissoes', 'off', true);
end;
$$;
revoke execute on function public.porto_sincronizar_comissoes() from public, anon, authenticated;

create or replace function public.comissao_da_op(p_op_id bigint, p_motorista_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_motorista bigint;
    v_op public.ordens_pagamento_porto;
    v_resultado jsonb;
    v_pct numeric := public.percentual_comissao();
    v_ini date; v_fim date;
begin
    if public.e_administrador() then
        v_motorista := coalesce(p_motorista_id, public.motorista_atual());
    else
        v_motorista := public.motorista_atual();
        if v_motorista is null then
            raise exception 'Seu usuario ainda nao esta vinculado a um socorrista.'
                using errcode = 'insufficient_privilege';
        end if;
        if p_motorista_id is not null and p_motorista_id <> v_motorista then
            raise exception 'Voce so pode consultar a propria comissao.'
                using errcode = 'insufficient_privilege';
        end if;
    end if;

    if v_motorista is null then
        raise exception 'Informe o socorrista.' using errcode = 'invalid_parameter_value';
    end if;

    select * into v_op from public.ordens_pagamento_porto where id = p_op_id;
    if not found then
        raise exception 'Ordem de pagamento nao encontrada.' using errcode = 'no_data_found';
    end if;

    v_ini := coalesce(v_op.periodo_inicio, v_op.data_pagamento_programada);
    v_fim := coalesce(v_op.periodo_fim, v_op.data_pagamento_programada);

    with servicos as (
        select os.id, os.numero, os.especialidade, os.data_atendimento,
               os.valor_total, round(os.valor_total * v_pct, 2) as comissao_servico
        from public.ordens_servico_porto os
        where os.ordem_pagamento_id = p_op_id
          and os.motorista_id = v_motorista
          and os.status_operacional <> 'CANCELADO'
        order by os.data_atendimento, os.numero
    ),
    atribuidos as (
        select da.despesa_id, da.ordem_pagamento_id from public.descontos_atribuidos() da
        where da.motorista_id = v_motorista
    ),
    -- Todo gasto ligado ao socorrista no periodo da OP. Desconta aqui so o marcado
    -- que caiu nesta OP; o marcado que caiu em outra OP aparece como tal.
    gastos as (
        select d.id, d.descricao, d.data_lancamento, d.valor, d.aprovada, d.status,
               d.observacoes, c.nome as categoria, v.identificacao as veiculo,
               coalesce(a.ordem_pagamento_id = p_op_id, false) as desconta_aqui,
               d.desconta_comissao and coalesce(a.ordem_pagamento_id <> p_op_id, false) as em_outra_op
        from public.despesas d
        join public.categorias c on c.id = d.categoria_id
        left join public.veiculos v on v.id = d.veiculo_id
        left join atribuidos a on a.despesa_id = d.id
        where d.motorista_id = v_motorista
          and d.status <> 'REJEITADO'
          and (d.protocolo is null or d.protocolo not like 'COMISSAO-%')
          and v_ini is not null and v_fim is not null
          and d.data_lancamento between v_ini and v_fim
    ),
    pagamento as (
        select pc.id, pc.valor_pago, pc.data_pagamento, pc.forma_pagamento,
               pc.observacoes, pc.despesa_id, p.nome as pago_por, pc.criado_em
        from public.pagamentos_comissao pc
        left join public.perfis p on p.id = pc.pago_por
        where pc.motorista_id = v_motorista and pc.ordem_pagamento_id = p_op_id
    ),
    somas as (
        select coalesce((select sum(valor_total) from servicos), 0) as producao,
               coalesce((select count(*) from servicos), 0) as quantidade,
               coalesce((select sum(valor) from gastos where desconta_aqui and aprovada), 0) as descontos,
               coalesce((select sum(valor) from gastos where desconta_aqui and not aprovada), 0) as descontos_pendentes
    )
    select jsonb_build_object(
        'ordemPagamentoId', p_op_id,
        'numeroOp', v_op.numero,
        'periodo', 'OP ' || v_op.numero
            || coalesce(' · ' || to_char(v_ini, 'DD/MM') || ' a ' || to_char(v_fim, 'DD/MM'), ''),
        'periodoInicio', v_ini,
        'periodoFim', v_fim,
        'motoristaId', v_motorista,
        'socorrista', (select nome from public.motoristas where id = v_motorista),
        'quantidadeServicosPagos', s.quantidade,
        'producaoPaga', s.producao,
        'percentualComissao', v_pct,
        'comissaoBruta', round(s.producao * v_pct, 2),
        'descontos', s.descontos,
        'descontosPendentes', s.descontos_pendentes,
        'liquido', round(s.producao * v_pct, 2) - s.descontos,
        'aguardandoOp', s.quantidade = 0,
        'servicos', coalesce((select jsonb_agg(jsonb_build_object(
            'id', id, 'numeroOs', numero, 'especialidade', especialidade,
            'dataAtendimento', data_atendimento, 'numeroOp', v_op.numero,
            'valorServico', valor_total, 'comissaoServico', comissao_servico))
            from servicos), '[]'::jsonb),
        'gastos', coalesce((select jsonb_agg(jsonb_build_object(
            'id', id, 'descricao', descricao, 'data', data_lancamento, 'valor', valor,
            'categoria', categoria, 'veiculo', veiculo, 'situacao', status::text,
            'aprovada', aprovada, 'descontaDaComissao', desconta_aqui,
            'descontaEmOutraOp', em_outra_op,
            'observacoes', observacoes) order by data_lancamento desc, id desc)
            from gastos), '[]'::jsonb),
        'pagamento', (select to_jsonb(p) from pagamento p)
    ) into v_resultado
    from somas s;

    return v_resultado;
end;
$$;

create or replace function public.resumo_comissoes_op(p_op_id bigint, p_motorista_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb; v_pct numeric := public.percentual_comissao();
begin
    perform public.exigir_administrador();

    with servicos as (
        select os.motorista_id, count(*) as qtd, sum(os.valor_total) as producao
        from public.ordens_servico_porto os
        where os.ordem_pagamento_id = p_op_id
          and os.motorista_id is not null
          and os.status_operacional <> 'CANCELADO'
          and (p_motorista_id is null or os.motorista_id = p_motorista_id)
        group by os.motorista_id
    ),
    descontos as (
        select da.motorista_id, sum(da.valor) as aprovado
        from public.descontos_atribuidos() da
        where da.ordem_pagamento_id = p_op_id and da.aprovada
        group by da.motorista_id
    ),
    pagamento as (
        select pc.motorista_id, pc.id, pc.valor_pago, pc.data_pagamento,
               pc.forma_pagamento, pc.observacoes, pc.despesa_id, pc.criado_em
        from public.pagamentos_comissao pc
        where pc.ordem_pagamento_id = p_op_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'motoristaId', m.id,
        'socorrista', m.nome,
        'quantidadeServicosPagos', coalesce(s.qtd, 0),
        'producaoPaga', coalesce(s.producao, 0),
        'comissaoBruta', round(coalesce(s.producao, 0) * v_pct, 2),
        'descontos', coalesce(a.aprovado, 0),
        'liquido', round(coalesce(s.producao, 0) * v_pct, 2) - coalesce(a.aprovado, 0),
        'pagamento', case when p.id is null then null else jsonb_build_object(
            'id', p.id, 'motoristaId', m.id, 'ordemPagamentoId', p_op_id,
            'despesaId', p.despesa_id, 'valorPago', p.valor_pago,
            'dataPagamento', p.data_pagamento, 'formaPagamento', p.forma_pagamento,
            'observacoes', p.observacoes, 'pagoPor', '', 'criadoEm', p.criado_em) end
    ) order by m.nome), '[]'::jsonb) into v
    from public.motoristas m
    left join servicos s on s.motorista_id = m.id
    left join descontos a on a.motorista_id = m.id
    left join pagamento p on p.motorista_id = m.id
    where (p_motorista_id is null or m.id = p_motorista_id)
      and (coalesce(s.qtd, 0) > 0 or p.id is not null);

    return v;
end;
$$;

select public.porto_recalcular_periodos();
select public.porto_sincronizar_comissoes();
