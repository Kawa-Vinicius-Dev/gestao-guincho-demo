-- Comissoes: resumo do ciclo, detalhe do socorrista e registro de alimentacao.
--
-- SECURITY DEFINER pelo mesmo motivo de `comissao_do_ciclo`: o calculo cruza OSs
-- recebidas com a OP que as pagou, e OP e tabela de administrador. A funcao le
-- por quem chama e devolve so o recorte permitido.

create or replace function public.resumo_comissoes(
    p_calendario_id bigint, p_motorista_id bigint default null
)
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
        join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
        where os.status_financeiro = 'RECEBIDO'
          and op.calendario_pagamento_id = p_calendario_id
          and os.motorista_id is not null
          and (p_motorista_id is null or os.motorista_id = p_motorista_id)
        group by os.motorista_id
    ),
    ciclo as (
        select coalesce(competencia_inicio, data_pagamento) as ini,
               coalesce(competencia_fim, data_pagamento) as fim
        from public.calendario_pagamentos_porto where id = p_calendario_id
    ),
    alimentacao as (
        select d.motorista_id, sum(d.valor) as aprovada
        from public.despesas d, ciclo c
        where d.natureza = 'ALIMENTACAO_FUNCIONARIO' and d.aprovada
          and d.status <> 'REJEITADO'
          and d.data_lancamento between c.ini and c.fim
          and d.motorista_id is not null
        group by d.motorista_id
    ),
    pagamento as (
        select pc.motorista_id, pc.id, pc.valor_pago, pc.data_pagamento,
               pc.forma_pagamento, pc.observacoes, pc.despesa_id, pc.criado_em
        from public.pagamentos_comissao pc
        where pc.calendario_pagamento_id = p_calendario_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'motoristaId', m.id,
        'socorrista', m.nome,
        'quantidadeServicosPagos', coalesce(s.qtd, 0),
        'producaoPaga', coalesce(s.producao, 0),
        'comissaoBruta', round(coalesce(s.producao, 0) * v_pct, 2),
        'alimentacaoAprovada', coalesce(a.aprovada, 0),
        'liquido', round(coalesce(s.producao, 0) * v_pct, 2) - coalesce(a.aprovada, 0),
        'pagamento', case when p.id is null then null else jsonb_build_object(
            'id', p.id, 'motoristaId', m.id, 'calendarioPagamentoId', p_calendario_id,
            'despesaId', p.despesa_id, 'valorPago', p.valor_pago,
            'dataPagamento', p.data_pagamento, 'formaPagamento', p.forma_pagamento,
            'observacoes', p.observacoes, 'pagoPor', '', 'criadoEm', p.criado_em) end
    ) order by m.nome), '[]'::jsonb) into v
    from public.motoristas m
    left join servicos s on s.motorista_id = m.id
    left join alimentacao a on a.motorista_id = m.id
    left join pagamento p on p.motorista_id = m.id
    where (p_motorista_id is null or m.id = p_motorista_id)
      and (coalesce(s.qtd, 0) > 0 or coalesce(a.aprovada, 0) <> 0 or p.id is not null);

    return v;
end;
$$;

-- Detalhe de um socorrista no ciclo: cadastro, comissao e os servicos dele,
-- marcando o que foi pago neste ciclo, em outro, ou ainda nao foi.
create or replace function public.detalhe_socorrista(
    p_motorista_id bigint, p_calendario_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb; v_pct numeric := public.percentual_comissao();
begin
    perform public.exigir_administrador();

    select jsonb_build_object(
        'id', m.id, 'nome', m.nome, 'ativo', m.ativo,
        'telefone', m.telefone, 'qra', m.qra,
        'email', (select p.email from public.perfis p where p.id = m.perfil_id),
        'veiculosUtilizados', coalesce((
            select jsonb_agg(distinct os.sigla_viatura)
            from public.ordens_servico_porto os
            where os.motorista_id = m.id and os.sigla_viatura is not null), '[]'::jsonb),
        'totalServicosPrestados', (
            select count(*) from public.ordens_servico_porto os where os.motorista_id = m.id),
        'comissao', public.comissao_do_ciclo(p_calendario_id, m.id),
        'servicos', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', os.id, 'numeroOs', os.numero, 'dataAtendimento', os.data_atendimento,
                'especialidade', os.especialidade, 'viatura', os.sigla_viatura,
                'numeroOp', op.numero, 'valorServico', os.valor_total,
                'statusPagamento', case
                    when os.status_financeiro <> 'RECEBIDO' then 'AGUARDANDO_PAGAMENTO'
                    when op.calendario_pagamento_id = p_calendario_id then 'PAGO'
                    else 'PAGO_EM_OUTRO_PERIODO' end,
                'pagoNoPeriodo', op.calendario_pagamento_id = p_calendario_id,
                'comissaoGerada', case when os.status_financeiro = 'RECEBIDO'
                    then round(os.valor_total * v_pct, 2) end)
                order by os.data_atendimento desc nulls last, os.numero)
            from public.ordens_servico_porto os
            left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
            where os.motorista_id = m.id), '[]'::jsonb)
    ) into v
    from public.motoristas m where m.id = p_motorista_id;

    if v is null then
        raise exception 'Socorrista nao encontrado.' using errcode = 'no_data_found';
    end if;
    return v;
end;
$$;

-- O socorrista lanca a propria alimentacao. Vira uma despesa com natureza
-- ALIMENTACAO_FUNCIONARIO, que e o que desconta da comissao dele.
create or replace function public.registrar_alimentacao(
    p_data date, p_valor numeric, p_observacoes text default null
)
returns public.despesas
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_motorista bigint := public.motorista_atual();
    v_categoria bigint;
    v_despesa public.despesas;
    v_quem uuid := (select auth.uid());
begin
    if not public.e_operador() then
        raise exception 'Sessao invalida.' using errcode = 'insufficient_privilege';
    end if;
    if v_motorista is null then
        raise exception 'Seu usuario ainda nao esta vinculado a um socorrista.'
            using errcode = 'insufficient_privilege';
    end if;
    if p_valor is null or p_valor <= 0 then
        raise exception 'Informe o valor da alimentacao.' using errcode = 'invalid_parameter_value';
    end if;

    select id into v_categoria from public.categorias
     where lower(btrim(nome)) = 'alimentação' and tipo = 'DESPESA' limit 1;
    if v_categoria is null then
        insert into public.categorias (nome, tipo) values ('Alimentação', 'DESPESA')
        returning id into v_categoria;
    end if;

    insert into public.despesas (descricao, categoria_id, valor, data_lancamento,
        motorista_id, observacoes, natureza, status, aprovada, criado_por)
    values ('Alimentação', v_categoria, p_valor, p_data, v_motorista, p_observacoes,
        'ALIMENTACAO_FUNCIONARIO', 'PENDENTE', false, v_quem)
    returning * into v_despesa;

    return v_despesa;
end;
$$;

revoke execute on function public.resumo_comissoes(bigint, bigint) from public;
revoke execute on function public.detalhe_socorrista(bigint, bigint) from public;
revoke execute on function public.registrar_alimentacao(date, numeric, text) from public;
grant execute on function public.resumo_comissoes(bigint, bigint) to authenticated;
grant execute on function public.detalhe_socorrista(bigint, bigint) to authenticated;
grant execute on function public.registrar_alimentacao(date, numeric, text) to authenticated;
