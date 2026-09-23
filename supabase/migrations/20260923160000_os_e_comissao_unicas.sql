-- Uma definicao so para "comissao da OS", "OS paga" e "OS sem valor".
--
-- A auditoria de 23/09/2026 achou a comissao calculada em sete lugares, com
-- dois arredondamentos diferentes: a despesa lancada fazia round(soma x %) e as
-- telas somavam round(cada OS x %). Na quinzena 01/09-16/09 o cartao
-- "Comissoes" mostrava R$ 16.755,27 e a despesa, R$ 16.755,13.
--
-- A regra de negocio nao muda (a % da OP sobre o servico pago, zero na OS sem
-- comissao). Muda a implementacao: `comissao_da_os` e a unica conta, arredondada
-- por OS, e todo total e a soma dela. Efeito nas despesas ja lancadas, medido
-- nos dados de 23/09: 10 de 87 comissoes (OP x socorrista) mudam, R$ 0,15 no
-- total, no maximo R$ 0,06 numa delas.
--
-- Junto:
--  - OS paga = OS com OP (`ordem_pagamento_id`), tambem na ficha do socorrista,
--    que ainda olhava `status_financeiro`.
--  - OS sem valor = `porto_os_situacao.sem_valor` (sem OP e sem valor
--    informado). A lista de OS passa a entregar isso por linha, e as Pendencias
--    deixam de ter a propria conta.
--  - Pendencias seguem o modo do seletor, como as outras telas.

-- ------------------------------------------------------------------ comissao
create or replace function public.comissao_da_os(
    p_valor numeric, p_motorista_id bigint, p_op_id bigint, p_sem_comissao boolean)
returns numeric
language sql stable security definer set search_path = ''
as $$
    select case when coalesce(p_sem_comissao, false) or p_motorista_id is null then 0
                else round(coalesce(p_valor, 0) * public.percentual_da_comissao(p_motorista_id, p_op_id), 2) end
$$;
comment on function public.comissao_da_os(numeric, bigint, bigint, boolean) is
    'A comissao de uma OS: valor x % da OP (ou a atual, sem OP), arredondada por OS. Zero sem comissao ou sem socorrista.';
revoke execute on function public.comissao_da_os(numeric, bigint, bigint, boolean) from public, anon;
grant execute on function public.comissao_da_os(numeric, bigint, bigint, boolean) to authenticated;

-- A despesa de comissao: a soma das comissoes das OS, e nao a % da soma.
create or replace function public.porto_sincronizar_comissoes()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
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
            select op.id as op_id, op.numero, op.periodo_fim, os.motorista_id,
                   sum(public.comissao_da_os(os.valor_total, os.motorista_id, op.id, os.sem_comissao)) as bruta
            from public.ordens_pagamento_porto op
            join public.ordens_servico_porto os on os.ordem_pagamento_id = op.id
            where os.motorista_id is not null
              and os.status_operacional <> 'CANCELADO'
              and not os.sem_comissao
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
                public.descricao_da_comissao(r.numero, r.motorista_id), v_categoria, r.liquido,
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
                   descricao = public.descricao_da_comissao(r.numero, r.motorista_id)
             where id = r.despesa_id
               and (valor is distinct from r.liquido or data_lancamento is distinct from r.periodo_fim or descricao is distinct from public.descricao_da_comissao(r.numero, r.motorista_id));
            update public.pagamentos_comissao
               set valor_pago = r.liquido, data_pagamento = r.periodo_fim
             where despesa_id = r.despesa_id
               and (valor_pago is distinct from r.liquido or data_pagamento is distinct from r.periodo_fim);
        end if;
    end loop;

    perform set_config('fluxo.sincronizando_comissoes', 'off', true);
end;
$$;

-- Comissao do periodo de um socorrista (ficha e Minha comissao).
create or replace function public.comissao_das_ops(p_op_ids bigint[], p_motorista_id bigint default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
    v_motorista bigint;
    v_resultado jsonb;
    v_ini date; v_fim date; v_numeros text; v_qtd_ops int;
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

    select min(coalesce(op.periodo_inicio, op.data_pagamento_programada)),
           max(coalesce(op.periodo_fim, op.data_pagamento_programada)),
           string_agg(op.numero, ' e ' order by op.numero), count(*)
      into v_ini, v_fim, v_numeros, v_qtd_ops
      from public.ordens_pagamento_porto op where op.id = any(p_op_ids);
    if coalesce(v_qtd_ops, 0) = 0 then
        raise exception 'Ordem de pagamento nao encontrada.' using errcode = 'no_data_found';
    end if;

    with servicos as (
        select os.id, os.numero, os.especialidade, os.data_atendimento, op.numero as numero_op,
               os.valor_total, os.sem_comissao,
               public.comissao_da_os(os.valor_total, os.motorista_id, os.ordem_pagamento_id, os.sem_comissao) as comissao_servico
        from public.ordens_servico_porto os
        join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
        where os.ordem_pagamento_id = any(p_op_ids)
          and os.motorista_id = v_motorista
          and os.status_operacional <> 'CANCELADO'
    ),
    atribuidos as (
        select da.despesa_id, da.ordem_pagamento_id from public.descontos_atribuidos() da
        where da.motorista_id = v_motorista
    ),
    gastos as (
        select d.id, d.descricao, d.data_lancamento, d.valor, d.aprovada, d.status,
               d.observacoes, c.nome as categoria, v.identificacao as veiculo,
               coalesce(a.ordem_pagamento_id = any(p_op_ids), false) as desconta_aqui,
               d.desconta_comissao and a.ordem_pagamento_id is not null
                   and not (a.ordem_pagamento_id = any(p_op_ids)) as em_outra_op
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
    somas as (
        select coalesce((select sum(valor_total) from servicos), 0) as producao,
               coalesce((select sum(comissao_servico) from servicos), 0) as comissao_bruta,
               coalesce((select count(*) from servicos), 0) as quantidade,
               coalesce((select sum(valor) from gastos where desconta_aqui and aprovada), 0) as descontos,
               coalesce((select sum(valor) from gastos where desconta_aqui and not aprovada), 0) as descontos_pendentes
    )
    select jsonb_build_object(
        'ordemPagamentoId', p_op_ids[1],
        'numeroOp', v_numeros,
        'periodo', case when v_qtd_ops > 1 then 'OPs ' else 'OP ' end || v_numeros
            || coalesce(' · ' || to_char(v_ini, 'DD/MM') || ' a ' || to_char(v_fim, 'DD/MM'), ''),
        'periodoInicio', v_ini,
        'periodoFim', v_fim,
        'motoristaId', v_motorista,
        'socorrista', (select nome from public.motoristas where id = v_motorista),
        'quantidadeServicosPagos', s.quantidade,
        'producaoPaga', s.producao,
        'percentualComissao', public.percentual_da_comissao(v_motorista, p_op_ids[1]),
        'comissaoBruta', s.comissao_bruta,
        'descontos', s.descontos,
        'descontosPendentes', s.descontos_pendentes,
        'liquido', s.comissao_bruta - s.descontos,
        'aguardandoOp', s.quantidade = 0,
        'servicos', coalesce((select jsonb_agg(jsonb_build_object(
            'id', id, 'numeroOs', numero, 'especialidade', especialidade,
            'dataAtendimento', data_atendimento, 'numeroOp', numero_op,
            'valorServico', valor_total, 'comissaoServico', comissao_servico)
            order by data_atendimento, numero) from servicos), '[]'::jsonb),
        'gastos', coalesce((select jsonb_agg(jsonb_build_object(
            'id', id, 'descricao', descricao, 'data', data_lancamento, 'valor', valor,
            'categoria', categoria, 'veiculo', veiculo, 'situacao', status::text,
            'aprovada', aprovada, 'descontaDaComissao', desconta_aqui,
            'descontaEmOutraOp', em_outra_op,
            'observacoes', observacoes) order by data_lancamento desc, id desc)
            from gastos), '[]'::jsonb),
        'pagamento', (
            select jsonb_build_object('id', min(pc.id), 'despesaId', min(pc.despesa_id),
                       'valorPago', sum(pc.valor_pago), 'dataPagamento', max(pc.data_pagamento))
            from public.pagamentos_comissao pc
            where pc.motorista_id = v_motorista and pc.ordem_pagamento_id = any(p_op_ids)
            having count(*) > 0)
    ) into v_resultado
    from somas s;

    return v_resultado;
end;
$$;

-- Tela de Comissoes: um socorrista por linha.
create or replace function public.resumo_comissoes_ops(p_op_ids bigint[], p_motorista_id bigint default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
    perform public.exigir_administrador();

    with servicos as (
        select os.motorista_id, count(*) as qtd, sum(os.valor_total) as producao,
               sum(public.comissao_da_os(os.valor_total, os.motorista_id, os.ordem_pagamento_id, os.sem_comissao)) as comissao
        from public.ordens_servico_porto os
        where os.ordem_pagamento_id = any(p_op_ids)
          and os.motorista_id is not null
          and os.status_operacional <> 'CANCELADO'
          and (p_motorista_id is null or os.motorista_id = p_motorista_id)
        group by os.motorista_id
    ),
    descontos as (
        select da.motorista_id, sum(da.valor) as aprovado
        from public.descontos_atribuidos() da
        where da.ordem_pagamento_id = any(p_op_ids) and da.aprovada
        group by da.motorista_id
    ),
    pagamento as (
        select pc.motorista_id, min(pc.id) as id, sum(pc.valor_pago) as valor_pago,
               max(pc.data_pagamento) as data_pagamento, min(pc.despesa_id) as despesa_id
        from public.pagamentos_comissao pc
        where pc.ordem_pagamento_id = any(p_op_ids)
        group by pc.motorista_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'motoristaId', m.id,
        'socorrista', m.nome,
        'quantidadeServicosPagos', coalesce(s.qtd, 0),
        'producaoPaga', coalesce(s.producao, 0),
        'comissaoBruta', coalesce(s.comissao, 0),
        'descontos', coalesce(a.aprovado, 0),
        'liquido', coalesce(s.comissao, 0) - coalesce(a.aprovado, 0),
        'pagamento', case when p.id is null then null else jsonb_build_object(
            'id', p.id, 'motoristaId', m.id, 'despesaId', p.despesa_id,
            'valorPago', p.valor_pago, 'dataPagamento', p.data_pagamento) end
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

-- Ficha do socorrista. Comissao gerada so na OS paga (com OP), pela mesma conta.
create or replace function public.detalhe_socorrista_ops(p_motorista_id bigint, p_op_ids bigint[])
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
    v jsonb;
    v_ini date;
    v_fim date;
begin
    perform public.exigir_administrador();

    select min(coalesce(periodo_inicio, data_pagamento_programada)),
           max(coalesce(periodo_fim, data_pagamento_programada))
      into v_ini, v_fim
      from public.ordens_pagamento_porto where id = any(p_op_ids);

    select jsonb_build_object(
        'id', m.id, 'nome', m.nome, 'ativo', m.ativo,
        'telefone', m.telefone, 'qra', m.qra,
        'email', (select p.email from public.perfis p where p.id = m.perfil_id),
        'veiculosUtilizados', coalesce((
            select jsonb_agg(distinct os.sigla_viatura)
            from public.ordens_servico_porto os
            where os.motorista_id = m.id and os.sigla_viatura is not null
              and os.ordem_pagamento_id = any(p_op_ids)), '[]'::jsonb),
        'totalServicosPrestados', (
            select count(*) from public.ordens_servico_porto os
            where os.motorista_id = m.id
              and os.status_operacional <> 'CANCELADO'
              and (os.ordem_pagamento_id = any(p_op_ids)
                   or (os.ordem_pagamento_id is null and os.data_atendimento between v_ini and v_fim))),
        'comissao', public.comissao_das_ops(p_op_ids, m.id),
        'despesas', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', d.id, 'descricao', d.descricao, 'data', d.data_lancamento,
                'valor', d.valor, 'categoria', c.nome, 'veiculo', v2.identificacao,
                'situacao', d.status, 'aprovada', d.aprovada,
                'descontaDaComissao', d.desconta_comissao,
                'observacoes', d.observacoes)
                order by d.data_lancamento desc, d.id desc)
            from public.despesas d
            join public.categorias c on c.id = d.categoria_id
            left join public.veiculos v2 on v2.id = d.veiculo_id
            where d.motorista_id = m.id
              and d.status <> 'REJEITADO'
              and (d.protocolo is null or d.protocolo not like 'COMISSAO-%')
              and v_ini is not null and v_fim is not null
              and d.data_lancamento between v_ini and v_fim), '[]'::jsonb),
        'servicos', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', os.id, 'numeroOs', os.numero, 'dataAtendimento', os.data_atendimento,
                'especialidade', os.especialidade, 'viatura', os.sigla_viatura,
                'numeroOp', op.numero, 'valorServico', os.valor_total,
                'statusPagamento', case
                    when os.ordem_pagamento_id is null then 'AGUARDANDO_PAGAMENTO'
                    when os.ordem_pagamento_id = any(p_op_ids) then 'PAGO'
                    else 'PAGO_EM_OUTRO_PERIODO' end,
                'pagoNoPeriodo', coalesce(os.ordem_pagamento_id = any(p_op_ids), false),
                'semComissao', os.sem_comissao,
                'comissaoGerada', case when os.sem_comissao then 0
                    when os.ordem_pagamento_id is not null
                    then public.comissao_da_os(os.valor_total, os.motorista_id, os.ordem_pagamento_id, os.sem_comissao) end)
                order by os.data_atendimento desc nulls last, os.numero)
            from public.ordens_servico_porto os
            left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
            where os.motorista_id = m.id
              and (os.ordem_pagamento_id = any(p_op_ids)
                   or (os.ordem_pagamento_id is null and os.data_atendimento between v_ini and v_fim))), '[]'::jsonb)
    ) into v
    from public.motoristas m where m.id = p_motorista_id;

    if v is null then
        raise exception 'Socorrista nao encontrado.' using errcode = 'no_data_found';
    end if;
    return v;
end;
$$;

-- Comissao prevista: o que ainda nao entrou em OP, pela taxa atual, OS por OS.
create or replace function public.porto_comissao_prevista(p_inicio date, p_fim date, p_motorista_id bigint default null)
returns table(motorista_id bigint, socorrista text, servicos integer, sem_valor integer,
              valor_previsto numeric, comissao_prevista numeric)
language plpgsql stable security definer set search_path = ''
as $$
declare
    v_motorista bigint;
begin
    if public.e_administrador() then
        v_motorista := p_motorista_id;
    else
        v_motorista := public.motorista_atual();
        if v_motorista is null then
            raise exception 'Seu usuário ainda não está vinculado a um socorrista.'
                using errcode = 'insufficient_privilege';
        end if;
        if p_motorista_id is not null and p_motorista_id <> v_motorista then
            raise exception 'Você só pode consultar a própria comissão.'
                using errcode = 'insufficient_privilege';
        end if;
    end if;

    return query
    select os.motorista_id, m.nome,
           count(*)::int,
           count(*) filter (where s.sem_valor)::int,
           coalesce(sum(s.valor_previsto), 0),
           coalesce(sum(public.comissao_da_os(s.valor_previsto, os.motorista_id, null, os.sem_comissao)), 0)
      from public.ordens_servico_porto os
      join public.porto_os_situacao() s on s.os_id = os.id
      join public.motoristas m on m.id = os.motorista_id
     where s.competencia_fim between p_inicio and p_fim
       and os.ordem_pagamento_id is null
       and not os.sem_comissao
       and (v_motorista is null or os.motorista_id = v_motorista)
     group by os.motorista_id, m.nome
     order by 5 desc, m.nome;
end;
$$;

-- ------------------------------------------------------------------ lista de OS
-- Comissao pela conta unica, e `semValor` por linha: a tela deixa de deduzir
-- "sem valor" do valor zerado.
create or replace function public.porto_listar_os(p_inicio date, p_fim date, p_numero_os text default null,
    p_numero_op text default null, p_motorista_id bigint default null, p_sigla text default null,
    p_especialidade text default null, p_situacao text default null, p_limite integer default 100,
    p_deslocamento integer default 0, p_sem_viatura boolean default false, p_por_competencia boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
    v_resultado jsonb;
begin
    perform public.exigir_administrador();

    with filtradas as (
        select os.id, os.numero, os.data_atendimento, os.especialidade, os.sigla_viatura,
               os.valor_total, os.valor_manual, os.motorista_id, os.ordem_pagamento_id, os.socorrista,
               m.nome as motorista, op.numero as numero_op,
               s.situacao, s.competencia_inicio, s.competencia_fim,
               s.valor_previsto, s.divergencia, s.sem_valor,
               case when os.ordem_pagamento_id is not null
                    then public.comissao_da_os(os.valor_total, os.motorista_id, os.ordem_pagamento_id, os.sem_comissao)
               end as comissao
          from public.ordens_servico_porto os
          left join public.motoristas m on m.id = os.motorista_id
          left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
          join public.porto_os_situacao() s on s.os_id = os.id
         where os.id in (select public.porto_os_filtradas(p_inicio, p_fim, p_numero_os, p_numero_op,
                            p_motorista_id, p_sigla, p_especialidade, p_situacao, p_sem_viatura,
                            p_por_competencia))
    )
    select jsonb_build_object(
        'total', (select count(*) from filtradas),
        'semViatura', (select count(*) from filtradas where coalesce(btrim(sigla_viatura), '') = ''),
        'valorTotal', (select coalesce(sum(valor_total), 0) from filtradas),
        'valorPrevisto', (select coalesce(sum(coalesce(valor_previsto, 0)), 0) from filtradas),
        'semValor', (select count(*) from filtradas where sem_valor),
        'divergentes', (select count(*) from filtradas where situacao = 'DIVERGENTE'),
        'comissaoTotal', (select coalesce(sum(comissao), 0) from filtradas),
        'itens', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', f.id, 'numero', f.numero, 'dataAtendimento', f.data_atendimento,
                'especialidade', f.especialidade, 'viatura', f.sigla_viatura,
                'valorTotal', f.valor_total, 'motoristaId', f.motorista_id,
                'motorista', f.motorista, 'socorristaNoArquivo', f.socorrista,
                'ordemPagamentoId', f.ordem_pagamento_id, 'numeroOp', f.numero_op,
                'situacao', f.situacao, 'semValor', f.sem_valor,
                'competenciaInicio', f.competencia_inicio, 'competenciaFim', f.competencia_fim,
                'valorManual', f.valor_manual, 'valorPrevisto', f.valor_previsto,
                'divergencia', f.divergencia,
                'comissao', f.comissao
            ) order by f.data_atendimento desc nulls last, f.numero)
              from (select * from filtradas
                     order by data_atendimento desc nulls last, numero
                     limit greatest(p_limite, 1) offset greatest(p_deslocamento, 0)) f
        ), '[]'::jsonb)
    ) into v_resultado;

    return v_resultado;
end;
$$;

-- ------------------------------------------------------------------ pendencias
-- Mesmo recorte das outras telas (porto_os_filtradas no modo do seletor), e as
-- faltas pela situacao unica: sem valor e `sem_valor`, nao "valor zerado".
drop function if exists public.porto_pendencias_os(date, date);
create or replace function public.porto_pendencias_os(p_inicio date, p_fim date, p_por_competencia boolean default true)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
    perform public.exigir_administrador();
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'numeroOs', t.numero, 'dataAtendimento', t.data_atendimento,
        'seguradora', t.seguradora, 'especialidade', t.especialidade,
        'siglaViatura', t.sigla_viatura, 'socorrista', t.socorrista, 'motoristaId', t.motorista_id,
        'valorTotal', coalesce(t.valor_previsto, 0), 'numeroOp', t.numero_op,
        'semValor', t.sem_valor,
        'semSocorrista', t.motorista_id is null,
        'semViatura', coalesce(btrim(t.sigla_viatura), '') = '',
        'situacao', t.situacao, 'competenciaInicio', t.competencia_inicio, 'competenciaFim', t.competencia_fim,
        'valorManual', t.valor_manual, 'divergencia', t.divergencia,
        'apenasConferir', not (t.sem_valor or t.motorista_id is null or coalesce(btrim(t.sigla_viatura), '') = '')
    ) order by t.data_atendimento, t.numero), '[]'::jsonb) into v
    from (
        select os.id, os.numero, os.data_atendimento, os.seguradora, os.especialidade, os.sigla_viatura,
               os.socorrista, os.motorista_id, os.valor_manual, op.numero as numero_op,
               s.situacao, s.competencia_inicio, s.competencia_fim, s.divergencia, s.sem_valor, s.valor_previsto
          from public.ordens_servico_porto os
          join public.porto_os_situacao() s on s.os_id = os.id
          left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
         where os.id in (select public.porto_os_filtradas(p_inicio, p_fim, null, null, null, null, null, null,
                                                          false, p_por_competencia))
           and (s.sem_valor or os.motorista_id is null or coalesce(btrim(os.sigla_viatura), '') = ''
                or s.situacao in ('DIVERGENTE', 'AGUARDANDO_PROXIMA_OP'))
    ) t;
    return v;
end;
$$;
revoke execute on function public.porto_pendencias_os(date, date, boolean) from public, anon;
grant execute on function public.porto_pendencias_os(date, date, boolean) to authenticated;

-- ------------------------------------------------------------------ Visao geral
-- A comissao de cada OS do periodo pela conta unica.
-- security definer, como porto_listar_os: o filtro de OS (porto_os_filtradas)
-- nao e executavel por `authenticated`. A primeira linha barra quem nao e
-- administrador, e so administrador le estas tabelas inteiras de qualquer forma.
create or replace function public.dashboard_financeiro(p_inicio date, p_fim date, p_por_competencia boolean default true)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
    v_resultado jsonb;
begin
    perform public.exigir_administrador();

    with
    receitas_periodo as (
        select r.id, r.valor, r.status, r.veiculo_id, r.ordem_servico_porto_id
        from public.receitas r
        left join public.ordens_servico_porto os on os.id = r.ordem_servico_porto_id
        where case when not p_por_competencia and os.id is not null
                   then os.data_atendimento between p_inicio and p_fim
                   else r.data_competencia between p_inicio and p_fim end
    ),
    contas_periodo as (
        select c.valor_previsto, c.status,
               (c.status = 'PENDENTE' and c.vencimento < current_date)
                 or c.status = 'ATRASADO' as em_atraso
        from public.contas_receber c
        where c.data_competencia between p_inicio and p_fim
    ),
    despesas_periodo as (
        select d.id, d.valor, d.status, d.aprovada, d.natureza, d.desconta_comissao,
               d.veiculo_id, d.motorista_id, d.categoria_id, d.protocolo
        from public.despesas d
        where d.data_lancamento between p_inicio and p_fim
    ),
    km_periodo as (
        select q.veiculo_id, q.km_total, q.km_remunerado, q.km_morto, q.custo_km_morto
        from public.quilometragens q
        where q.data_registro between p_inicio and p_fim
    ),
    oss_periodo as (
        select os.id, os.valor_total, os.motorista_id, os.ordem_pagamento_id, os.sigla_viatura,
               os.ordem_pagamento_id is not null as paga,
               public.comissao_da_os(os.valor_total, os.motorista_id, os.ordem_pagamento_id, os.sem_comissao) as comissao
        from public.ordens_servico_porto os
        where os.id in (select public.porto_os_filtradas(p_inicio, p_fim, null, null, null, null, null, null,
                                                         false, p_por_competencia))
    ),
    totais as (
        select
            coalesce((select sum(valor) from receitas_periodo where status = 'RECEBIDA'), 0) as receita_recebida,
            coalesce((select sum(valor_previsto) from contas_periodo
                      where status in ('PENDENTE', 'ATRASADO')), 0)
              + coalesce((select sum(valor) from receitas_periodo where status = 'PREVISTA'), 0) as receita_prevista,
            coalesce((select sum(valor_previsto) from contas_periodo where em_atraso), 0) as total_atrasado,
            coalesce((select sum(valor) from despesas_periodo
                      where aprovada and status = 'PAGO'), 0) as despesas_pagas,
            coalesce((select sum(valor) from despesas_periodo
                      where aprovada and status in ('PENDENTE', 'ATRASADO')), 0) as despesas_previstas
    ),
    km_totais as (
        select coalesce(sum(km_total), 0) as km_total,
               coalesce(sum(km_remunerado), 0) as km_remunerado,
               coalesce(sum(km_morto), 0) as km_morto,
               coalesce(sum(custo_km_morto), 0) as custo_km_morto
        from km_periodo
    ),
    producao as (
        select
            coalesce(sum(valor_total) filter (where paga), 0) as producao_paga,
            coalesce(sum(comissao) filter (where paga), 0) as comissao_paga,
            coalesce(sum(valor_total) filter (where not paga), 0) as producao_pendente,
            count(*) as servicos_do_periodo,
            count(*) filter (where not paga) as servicos_pendentes
        from oss_periodo
    ),
    comissao_devida as (
        select coalesce(sum(os.comissao), 0) as valor
        from oss_periodo os
        where os.paga
          and os.motorista_id is not null
          and not exists (
              select 1 from public.pagamentos_comissao pc
              where pc.motorista_id = os.motorista_id
                and pc.ordem_pagamento_id = os.ordem_pagamento_id
          )
    ),
    importados as (
        select coalesce(sum(total_registros), 0) as total
        from public.importacoes_porto where status = 'CONFIRMADA'
    ),
    por_veiculo as (
        select v.id as veiculo_id, v.identificacao as veiculo,
               coalesce(r.receitas, 0) as receitas,
               coalesce(d.despesas, 0) as despesas,
               coalesce(r.receitas, 0) - coalesce(d.despesas, 0) as resultado,
               coalesce(k.km_morto, 0) as km_morto,
               coalesce(k.custo_km_morto, 0) as custo_km_morto
        from public.veiculos v
        left join (
            select x.veiculo_id, sum(x.valor) as receitas
            from (
                select ve.id as veiculo_id, os.valor_total as valor
                from oss_periodo os
                join public.veiculos ve
                  on upper(btrim(coalesce(nullif(btrim(ve.sigla_porto), ''), ve.identificacao)))
                   = upper(btrim(os.sigla_viatura))
                where os.paga
                union all
                select rp.veiculo_id, rp.valor
                from receitas_periodo rp
                where rp.status = 'RECEBIDA' and rp.veiculo_id is not null
                  and rp.ordem_servico_porto_id is null
            ) x
            group by x.veiculo_id
        ) r on r.veiculo_id = v.id
        left join (
            select veiculo_id, sum(valor) as despesas
            from despesas_periodo
            where aprovada and status = 'PAGO' and veiculo_id is not null
              and not desconta_comissao
            group by veiculo_id
        ) d on d.veiculo_id = v.id
        left join (
            select veiculo_id, sum(km_morto) as km_morto, sum(custo_km_morto) as custo_km_morto
            from km_periodo group by veiculo_id
        ) k on k.veiculo_id = v.id
        where coalesce(r.receitas, 0) <> 0 or coalesce(d.despesas, 0) <> 0
           or coalesce(k.km_morto, 0) <> 0
        order by v.identificacao
    ),
    por_socorrista as (
        select m.id as motorista_id, m.nome as socorrista,
               coalesce(s.servicos, 0) as servicos,
               coalesce(s.producao, 0) as producao,
               coalesce(s.comissao, 0) as comissao,
               coalesce(g.despesas, 0) as despesas,
               coalesce(s.comissao, 0) + coalesce(g.despesas, 0) as custo_total
        from public.motoristas m
        left join (
            select motorista_id, count(*) as servicos, sum(valor_total) as producao,
                   sum(comissao) as comissao
            from oss_periodo
            where paga and motorista_id is not null
            group by motorista_id
        ) s on s.motorista_id = m.id
        left join (
            select motorista_id, sum(valor) as despesas
            from despesas_periodo
            where aprovada and motorista_id is not null
              and (veiculo_id is null or desconta_comissao)
              and (protocolo is null or protocolo not like 'COMISSAO-%')
            group by motorista_id
        ) g on g.motorista_id = m.id
        where coalesce(s.servicos, 0) > 0 or coalesce(g.despesas, 0) <> 0
        order by m.nome
    ),
    por_categoria as (
        select c.id as categoria_id, c.nome as categoria, sum(d.valor) as valor,
               case when (select despesas_pagas from totais) > 0
                    then round(sum(d.valor) * 100 / (select despesas_pagas from totais), 2)
                    else 0 end as participacao
        from despesas_periodo d
        join public.categorias c on c.id = d.categoria_id
        where d.aprovada and d.status = 'PAGO'
        group by c.id, c.nome
        order by sum(d.valor) desc
    )
    select jsonb_build_object(
        'receitaRecebida', t.receita_recebida,
        'receitaPrevista', t.receita_prevista,
        'totalAtrasado', t.total_atrasado,
        'despesasPagas', t.despesas_pagas,
        'despesasPrevistas', t.despesas_previstas,
        'saldoRealizado', t.receita_recebida - t.despesas_pagas,
        'saldoProjetado', t.receita_recebida + t.receita_prevista
                          - t.despesas_pagas - t.despesas_previstas,
        'registrosImportados', (select total from importados),
        'quilometragemTotal', k.km_total,
        'kmRemunerado', k.km_remunerado,
        'kmMorto', k.km_morto,
        'custoKmMorto', k.custo_km_morto,
        'producaoPaga', pr.producao_paga,
        'comissaoSobreProducao', pr.comissao_paga,
        'producaoPendente', pr.producao_pendente,
        'servicosDoPeriodo', pr.servicos_do_periodo,
        'servicosPendentes', pr.servicos_pendentes,
        'comissaoAPagar', (select valor from comissao_devida),
        'porCompetencia', p_por_competencia,
        'resultadoPorVeiculo', coalesce((
            select jsonb_agg(jsonb_build_object(
                'veiculoId', veiculo_id, 'veiculo', veiculo, 'receitas', receitas,
                'despesas', despesas, 'resultado', resultado,
                'kmMorto', km_morto, 'custoKmMorto', custo_km_morto))
            from por_veiculo), '[]'::jsonb),
        'resultadoPorSocorrista', coalesce((
            select jsonb_agg(jsonb_build_object(
                'motoristaId', motorista_id, 'socorrista', socorrista, 'servicos', servicos,
                'producao', producao, 'comissao', comissao, 'despesas', despesas,
                'custoTotal', custo_total))
            from por_socorrista), '[]'::jsonb),
        'despesasPorCategoria', coalesce((
            select jsonb_agg(jsonb_build_object(
                'categoriaId', categoria_id, 'categoria', categoria,
                'valor', valor, 'participacao', participacao))
            from por_categoria), '[]'::jsonb)
    )
    into v_resultado
    from totais t, km_totais k, producao pr;

    return v_resultado;
end;
$$;

-- As despesas de comissao ja lancadas passam a ser a soma das OS.
select public.porto_sincronizar_comissoes();
