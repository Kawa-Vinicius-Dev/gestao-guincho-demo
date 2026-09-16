-- Comissao e ficha do socorrista por periodo, somando todas as OPs dele.
--
-- A Porto paga a mesma quinzena em mais de uma OP (Taxi na 06438808, Guincho na
-- 06438807). A ficha do Djalma, filtrada por uma OP, mostrava so metade da
-- quinzena. Kawa: "tudo que envolve esse periodo precisa ter as duas". As
-- funcoes passam a receber a lista de OPs do periodo e somam tudo; cada OP
-- continua existindo por dentro (conciliacao e despesa de comissao por OP).
--
-- As versoes de uma OP so continuam, para o frontend que ainda esta no ar.

create or replace function public.comissao_das_ops(p_op_ids bigint[], p_motorista_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_motorista bigint;
    v_resultado jsonb;
    v_pct numeric := public.percentual_comissao();
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
               os.valor_total, round(os.valor_total * v_pct, 2) as comissao_servico
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
        'percentualComissao', v_pct,
        'comissaoBruta', round(s.producao * v_pct, 2),
        'descontos', s.descontos,
        'descontosPendentes', s.descontos_pendentes,
        'liquido', round(s.producao * v_pct, 2) - s.descontos,
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
revoke execute on function public.comissao_das_ops(bigint[], bigint) from public, anon;
grant execute on function public.comissao_das_ops(bigint[], bigint) to authenticated;

create or replace function public.resumo_comissoes_ops(p_op_ids bigint[], p_motorista_id bigint default null)
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
        'comissaoBruta', round(coalesce(s.producao, 0) * v_pct, 2),
        'descontos', coalesce(a.aprovado, 0),
        'liquido', round(coalesce(s.producao, 0) * v_pct, 2) - coalesce(a.aprovado, 0),
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
revoke execute on function public.resumo_comissoes_ops(bigint[], bigint) from public, anon;
grant execute on function public.resumo_comissoes_ops(bigint[], bigint) to authenticated;

create or replace function public.detalhe_socorrista_ops(p_motorista_id bigint, p_op_ids bigint[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v jsonb;
    v_pct numeric := public.percentual_comissao();
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
            left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
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
                'comissaoGerada', case when os.status_financeiro = 'RECEBIDO'
                    then round(os.valor_total * v_pct, 2) end)
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
revoke execute on function public.detalhe_socorrista_ops(bigint, bigint[]) from public, anon;
grant execute on function public.detalhe_socorrista_ops(bigint, bigint[]) to authenticated;
