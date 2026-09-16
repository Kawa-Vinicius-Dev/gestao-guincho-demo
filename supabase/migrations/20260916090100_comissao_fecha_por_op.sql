-- A comissao fecha por OP.
--
-- Antes fechava por ciclo do calendario: para saber quanto o socorrista tinha a
-- receber era preciso que alguem tivesse cadastrado o ciclo certo, com a
-- competencia certa, antes. Agora a pergunta e direta — chegou a OP, quem
-- trabalhou nela recebe a parte dele —, e a janela da alimentacao que abate da
-- comissao e o proprio periodo da OP.

alter table public.pagamentos_comissao
    add column if not exists ordem_pagamento_id bigint
        references public.ordens_pagamento_porto (id) on delete restrict;

alter table public.pagamentos_comissao
    alter column calendario_pagamento_id drop not null;

-- Pagar duas vezes o mesmo socorrista na mesma OP e o erro que este indice
-- existe para impedir.
create unique index if not exists pagamentos_comissao_por_op_unico
    on public.pagamentos_comissao (motorista_id, ordem_pagamento_id)
    where ordem_pagamento_id is not null;

create index if not exists pagamentos_comissao_op_idx
    on public.pagamentos_comissao (ordem_pagamento_id);

-- SECURITY DEFINER pelo mesmo motivo de sempre: o calculo cruza as OS com a OP
-- que as pagou, e OP e tabela de administrador. A funcao le por quem chama e
-- devolve so o recorte permitido — e o guarda logo abaixo e o que torna isso
-- seguro.
create or replace function public.comissao_da_op(
    p_op_id bigint,
    p_motorista_id bigint default null
)
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
    -- Alimentacao do periodo da OP. Sem periodo definido nao ha janela, e
    -- descontar "tudo" seria pior do que nao descontar nada.
    alimentacoes as (
        select d.id, d.data_lancamento, d.valor, d.aprovada, d.status, d.observacoes
        from public.despesas d
        where d.motorista_id = v_motorista
          and d.natureza = 'ALIMENTACAO_FUNCIONARIO'
          and d.status <> 'REJEITADO'
          and v_ini is not null and v_fim is not null
          and d.data_lancamento between v_ini and v_fim
    ),
    pagamento as (
        select pc.id, pc.valor_pago, pc.data_pagamento, pc.forma_pagamento,
               pc.observacoes, pc.despesa_id, p.nome as pago_por, pc.criado_em
        from public.pagamentos_comissao pc
        join public.perfis p on p.id = pc.pago_por
        where pc.motorista_id = v_motorista and pc.ordem_pagamento_id = p_op_id
    ),
    somas as (
        select coalesce((select sum(valor_total) from servicos), 0) as producao,
               coalesce((select count(*) from servicos), 0) as quantidade,
               coalesce((select sum(valor) from alimentacoes where aprovada), 0) as alim_aprovada,
               coalesce((select sum(valor) from alimentacoes where not aprovada), 0) as alim_pendente
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
        'alimentacaoAprovada', s.alim_aprovada,
        'alimentacaoPendente', s.alim_pendente,
        'liquido', round(s.producao * v_pct, 2) - s.alim_aprovada,
        'aguardandoOp', s.quantidade = 0,
        'servicos', coalesce((select jsonb_agg(jsonb_build_object(
            'id', id, 'numeroOs', numero, 'especialidade', especialidade,
            'dataAtendimento', data_atendimento, 'numeroOp', v_op.numero,
            'valorServico', valor_total, 'comissaoServico', comissao_servico))
            from servicos), '[]'::jsonb),
        'alimentacoes', coalesce((select jsonb_agg(jsonb_build_object(
            'id', id, 'motoristaId', v_motorista, 'data', data_lancamento,
            'valor', valor, 'aprovada', aprovada, 'situacao', status::text,
            'observacoes', observacoes))
            from alimentacoes), '[]'::jsonb),
        'pagamento', (select to_jsonb(p) from pagamento p)
    ) into v_resultado
    from somas s;

    return v_resultado;
end;
$$;

-- Quadro da OP inteira: uma linha por socorrista que trabalhou nela.
create or replace function public.resumo_comissoes_op(
    p_op_id bigint, p_motorista_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb; v_pct numeric := public.percentual_comissao();
        v_ini date; v_fim date;
begin
    perform public.exigir_administrador();

    select coalesce(periodo_inicio, data_pagamento_programada),
           coalesce(periodo_fim, data_pagamento_programada)
      into v_ini, v_fim
      from public.ordens_pagamento_porto where id = p_op_id;

    with servicos as (
        select os.motorista_id, count(*) as qtd, sum(os.valor_total) as producao
        from public.ordens_servico_porto os
        where os.ordem_pagamento_id = p_op_id
          and os.motorista_id is not null
          and os.status_operacional <> 'CANCELADO'
          and (p_motorista_id is null or os.motorista_id = p_motorista_id)
        group by os.motorista_id
    ),
    alimentacao as (
        select d.motorista_id, sum(d.valor) as aprovada
        from public.despesas d
        where d.natureza = 'ALIMENTACAO_FUNCIONARIO' and d.aprovada
          and d.status <> 'REJEITADO'
          and v_ini is not null and v_fim is not null
          and d.data_lancamento between v_ini and v_fim
          and d.motorista_id is not null
        group by d.motorista_id
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
        'alimentacaoAprovada', coalesce(a.aprovada, 0),
        'liquido', round(coalesce(s.producao, 0) * v_pct, 2) - coalesce(a.aprovada, 0),
        'pagamento', case when p.id is null then null else jsonb_build_object(
            'id', p.id, 'motoristaId', m.id, 'ordemPagamentoId', p_op_id,
            'despesaId', p.despesa_id, 'valorPago', p.valor_pago,
            'dataPagamento', p.data_pagamento, 'formaPagamento', p.forma_pagamento,
            'observacoes', p.observacoes, 'pagoPor', '', 'criadoEm', p.criado_em) end
    ) order by m.nome), '[]'::jsonb) into v
    from public.motoristas m
    left join servicos s on s.motorista_id = m.id
    left join alimentacao a on a.motorista_id = m.id
    left join pagamento p on p.motorista_id = m.id
    where (p_motorista_id is null or m.id = p_motorista_id)
      and (coalesce(s.qtd, 0) > 0 or p.id is not null);

    return v;
end;
$$;

-- Paga a comissao de um socorrista numa OP: a despesa que representa o repasse
-- e o registro do pagamento nascem no mesmo commit. Separados, um erro deixaria
-- repasse sem despesa (some do resultado) ou despesa sem repasse (a comissao
-- aparece paga duas vezes).
create or replace function public.pagar_comissao_op(
    p_motorista_id bigint,
    p_op_id bigint,
    p_data_pagamento date default current_date,
    p_forma_pagamento text default null,
    p_observacoes text default null
)
returns public.pagamentos_comissao
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_comissao jsonb;
    v_liquido numeric;
    v_despesa_id bigint;
    v_categoria_id bigint;
    v_pagamento public.pagamentos_comissao;
    v_quem uuid := (select auth.uid());
begin
    perform public.exigir_administrador();

    if exists (
        select 1 from public.pagamentos_comissao
        where motorista_id = p_motorista_id and ordem_pagamento_id = p_op_id
    ) then
        raise exception 'A comissao desta OP ja foi paga a este socorrista.'
            using errcode = 'unique_violation';
    end if;

    v_comissao := public.comissao_da_op(p_op_id, p_motorista_id);
    v_liquido := (v_comissao ->> 'liquido')::numeric;

    if v_liquido is null or v_liquido <= 0 then
        raise exception 'Nao ha valor liquido positivo de comissao para pagar nesta OP.'
            using errcode = 'invalid_parameter_value';
    end if;

    select id into v_categoria_id from public.categorias
     where lower(btrim(nome)) = 'comissao de socorrista' and tipo = 'DESPESA';
    if v_categoria_id is null then
        insert into public.categorias (nome, tipo) values ('Comissão de socorrista', 'DESPESA')
        returning id into v_categoria_id;
    end if;

    insert into public.despesas (
        descricao, categoria_id, valor, data_lancamento, data_pagamento,
        motorista_id, protocolo, status, aprovada, aprovado_por, aprovado_em,
        forma_pagamento, observacoes, criado_por
    ) values (
        'Comissão de socorrista — ' || coalesce(v_comissao ->> 'periodo', 'OP'),
        v_categoria_id, v_liquido, p_data_pagamento, p_data_pagamento,
        p_motorista_id, 'COMISSAO-OP-' || p_op_id::text || '-' || p_motorista_id::text,
        'PAGO', true, v_quem, now(),
        p_forma_pagamento, p_observacoes, v_quem
    ) returning id into v_despesa_id;

    insert into public.pagamentos_comissao (
        motorista_id, ordem_pagamento_id, despesa_id, valor_pago,
        data_pagamento, forma_pagamento, observacoes, pago_por
    ) values (
        p_motorista_id, p_op_id, v_despesa_id, v_liquido,
        p_data_pagamento, p_forma_pagamento, p_observacoes, v_quem
    ) returning * into v_pagamento;

    return v_pagamento;
end;
$$;

-- Ficha do socorrista ancorada na OP: cadastro, a comissao dele naquela OP e os
-- servicos, marcando o que foi pago nela, o que foi pago em outra e o que ainda
-- nao foi.
create or replace function public.detalhe_socorrista_op(
    p_motorista_id bigint, p_op_id bigint
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
        'comissao', public.comissao_da_op(p_op_id, m.id),
        'servicos', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', os.id, 'numeroOs', os.numero, 'dataAtendimento', os.data_atendimento,
                'especialidade', os.especialidade, 'viatura', os.sigla_viatura,
                'numeroOp', op.numero, 'valorServico', os.valor_total,
                'statusPagamento', case
                    when os.ordem_pagamento_id is null then 'AGUARDANDO_PAGAMENTO'
                    when os.ordem_pagamento_id = p_op_id then 'PAGO'
                    else 'PAGO_EM_OUTRO_PERIODO' end,
                'pagoNoPeriodo', os.ordem_pagamento_id = p_op_id,
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

revoke execute on function public.comissao_da_op(bigint, bigint) from public, anon;
revoke execute on function public.resumo_comissoes_op(bigint, bigint) from public, anon;
revoke execute on function public.pagar_comissao_op(bigint, bigint, date, text, text) from public, anon;
revoke execute on function public.detalhe_socorrista_op(bigint, bigint) from public, anon;
grant execute on function public.comissao_da_op(bigint, bigint) to authenticated;
grant execute on function public.resumo_comissoes_op(bigint, bigint) to authenticated;
grant execute on function public.pagar_comissao_op(bigint, bigint, date, text, text) to authenticated;
grant execute on function public.detalhe_socorrista_op(bigint, bigint) to authenticated;
