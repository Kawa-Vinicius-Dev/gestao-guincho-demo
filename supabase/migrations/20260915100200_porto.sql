-- Porto: conciliacao, resumo, dashboard e detalhe.
--
-- A conciliacao de uma OP e derivada, nao guardada: compara o valor da OP com a
-- soma das OSs que a compoem. Como toda tela do Porto precisa dela, vira uma
-- view — e nao uma coluna, que teria de ser recalculada a cada importacao.
--
-- Regra copiada do PortoService: sem OS vinculada e SEM_COMPOSICAO; diferenca
-- de ate um centavo e CONCILIADA; sobrando valor na OP e VALOR_ABAIXO (a
-- composicao nao explica tudo) e faltando e VALOR_ACIMA. Recebimento que nao
-- bate com o previsto tem precedencia sobre as tres.

create or replace view public.porto_ops_conciliadas
with (security_invoker = true) as
select
    op.id, op.numero, op.valor_total, op.nome_codigo,
    op.data_pagamento_programada, op.valor_recebido, op.data_recebimento,
    op.situacao_financeira, op.status_porto, op.observacao,
    op.calendario_pagamento_id, op.criado_em, op.atualizado_em,
    coalesce(c.quantidade, 0) as quantidade_ordens_servico,
    coalesce(c.valor, 0) as valor_ordens_servico,
    op.valor_total - coalesce(c.valor, 0) as divergencia,
    case
        when op.valor_recebido is not null
             and abs(op.valor_recebido - op.valor_total) > 0.01 then 'RECEBIDA_COM_DIVERGENCIA'
        when coalesce(c.quantidade, 0) = 0 then 'SEM_COMPOSICAO'
        when abs(op.valor_total - coalesce(c.valor, 0)) <= 0.01 then 'CONCILIADA'
        when op.valor_total - coalesce(c.valor, 0) > 0 then 'VALOR_ABAIXO'
        else 'VALOR_ACIMA'
    end as status_conciliacao,
    cal.descricao as periodo_financeiro
from public.ordens_pagamento_porto op
left join (
    select ordem_pagamento_id, count(*) as quantidade, sum(valor_total) as valor
    from public.ordens_servico_porto where ordem_pagamento_id is not null
    group by ordem_pagamento_id
) c on c.ordem_pagamento_id = op.id
left join public.calendario_pagamentos_porto cal on cal.id = op.calendario_pagamento_id;

grant select on public.porto_ops_conciliadas to authenticated;

-- Resumo completo da conciliacao: os vinte e dois numeros da tela de OPs.
create or replace function public.porto_resumo_ops(
    p_inicio date default null, p_fim date default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare v jsonb;
begin
    perform public.exigir_administrador();
    with lista as (
        select * from public.porto_ops_conciliadas
        where (p_inicio is null or data_pagamento_programada >= p_inicio)
          and (p_fim is null or data_pagamento_programada <= p_fim)
    ),
    -- A divergencia de uma OP recebida fora do previsto e medida contra o
    -- recebimento; nas demais, contra a composicao.
    dv as (
        select *, case
            when status_conciliacao = 'RECEBIDA_COM_DIVERGENCIA' and valor_recebido is not null
                then abs(valor_total - valor_recebido)
            else abs(divergencia) end as divergencia_abs
        from lista
    )
    select jsonb_build_object(
        'quantidadeTotalOps', count(*),
        'valorTotalPrevisto', coalesce(sum(valor_total), 0),
        'quantidadeSemComposicao', count(*) filter (where status_conciliacao = 'SEM_COMPOSICAO'),
        'valorSemComposicao', coalesce(sum(valor_total) filter (where status_conciliacao = 'SEM_COMPOSICAO'), 0),
        'quantidadeConciliadas', count(*) filter (where status_conciliacao = 'CONCILIADA'),
        'valorConciliadas', coalesce(sum(valor_total) filter (where status_conciliacao = 'CONCILIADA'), 0),
        'quantidadeValorAbaixo', count(*) filter (where status_conciliacao = 'VALOR_ABAIXO'),
        'diferencaTotalAbaixo', coalesce(sum(divergencia_abs) filter (where status_conciliacao = 'VALOR_ABAIXO'), 0),
        'quantidadeValorAcima', count(*) filter (where status_conciliacao = 'VALOR_ACIMA'),
        'diferencaTotalAcima', coalesce(sum(divergencia_abs) filter (where status_conciliacao = 'VALOR_ACIMA'), 0),
        'quantidadeComDivergencia', count(*) filter (
            where status_conciliacao in ('VALOR_ABAIXO','VALOR_ACIMA','RECEBIDA_COM_DIVERGENCIA')),
        'valorTotalDivergencias', coalesce(sum(divergencia_abs) filter (
            where status_conciliacao in ('VALOR_ABAIXO','VALOR_ACIMA','RECEBIDA_COM_DIVERGENCIA')), 0),
        'quantidadePagamentoProgramado', count(*) filter (where data_pagamento_programada is not null),
        'valorProgramado', coalesce(sum(valor_total) filter (where data_pagamento_programada is not null), 0),
        'quantidadeRecebidas', count(*) filter (where data_recebimento is not null),
        'valorRecebido', coalesce(sum(valor_recebido) filter (where data_recebimento is not null), 0),
        'quantidadeAguardandoRecebimento', count(*) filter (where data_recebimento is null),
        'valorAguardandoRecebimento', coalesce(sum(valor_total) filter (where data_recebimento is null), 0),
        'quantidadeVencidasNaoRecebidas', count(*) filter (
            where data_recebimento is null and data_pagamento_programada < current_date),
        'valorVencidoNaoRecebido', coalesce(sum(valor_total) filter (
            where data_recebimento is null and data_pagamento_programada < current_date), 0),
        'valorMedioPorOp', case when count(*) = 0 then 0
            else round(coalesce(sum(valor_total), 0) / count(*), 2) end,
        'quantidadeOrdensServico', coalesce(sum(quantidade_ordens_servico), 0)
    ) into v from dv;
    return v;
end;
$$;

-- Dashboard do Porto: o resumo das OPs mais a leitura pelas OSs do periodo.
create or replace function public.porto_dashboard(
    p_inicio date default null, p_fim date default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare v jsonb; v_resumo jsonb;
begin
    perform public.exigir_administrador();
    v_resumo := public.porto_resumo_ops(p_inicio, p_fim);

    with oss as (
        select * from public.ordens_servico_porto
        where (p_inicio is null or data_atendimento >= p_inicio)
          and (p_fim is null or data_atendimento <= p_fim)
    )
    select v_resumo || jsonb_build_object(
        'quantidadeTotalServicos', count(*),
        'valorTotalRealizado', coalesce(sum(valor_total), 0),
        'quantidadeAguardandoOp', count(*) filter (where status_financeiro = 'AGUARDANDO_OP'),
        'valorAguardandoOp', coalesce(sum(valor_total) filter (where status_financeiro = 'AGUARDANDO_OP'), 0),
        'quantidadeServicosPagamentoProgramado', count(*) filter (where status_financeiro = 'PAGAMENTO_PROGRAMADO'),
        'valorServicosPagamentoProgramado', coalesce(sum(valor_total) filter (where status_financeiro = 'PAGAMENTO_PROGRAMADO'), 0),
        'valorPrevistoAReceber', v_resumo -> 'valorProgramado',
        'valorConciliado', v_resumo -> 'valorConciliadas',
        'valorEfetivamenteRecebido', v_resumo -> 'valorRecebido',
        'quantidadeServicosPendentes', count(*) filter (where status_operacional = 'PENDENTE_PORTO'),
        'valorServicosPendentes', coalesce(sum(valor_total) filter (where status_operacional = 'PENDENTE_PORTO'), 0),
        'quantidadeServicosDevolvidos', count(*) filter (where status_operacional = 'DEVOLVIDO_FINALIZADO'),
        'periodoInicio', p_inicio, 'periodoFim', p_fim,
        -- "Nao informado" no lugar do vazio: o agrupamento do Java fazia o mesmo,
        -- e um grupo sem rotulo na tela nao diz nada a quem le.
        'porEspecialidade', coalesce((select jsonb_agg(jsonb_build_object(
                'chave', chave, 'quantidade', q, 'valor', vl) order by chave)
            from (select coalesce(nullif(btrim(especialidade), ''), 'Não informado') as chave,
                         count(*) as q, sum(valor_total) as vl
                  from oss group by 1) g), '[]'::jsonb),
        'porSocorrista', coalesce((select jsonb_agg(jsonb_build_object(
                'chave', chave, 'quantidade', q, 'valor', vl) order by chave)
            from (select coalesce(nullif(btrim(socorrista), ''), 'Não informado') as chave,
                         count(*) as q, sum(valor_total) as vl
                  from oss group by 1) g), '[]'::jsonb)
    ) into v from oss;
    return v;
end;
$$;

-- Detalhe de uma OP: ela, suas OSs, justificativas e historico, numa ida.
create or replace function public.porto_detalhe_op(p_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare v jsonb;
begin
    perform public.exigir_administrador();
    select jsonb_build_object(
        'ordemPagamento', to_jsonb(op),
        'ordensServico', coalesce((select jsonb_agg(to_jsonb(os) order by os.numero)
            from public.ordens_servico_porto os where os.ordem_pagamento_id = p_id), '[]'::jsonb),
        'justificativas', coalesce((select jsonb_agg(jsonb_build_object(
                'id', j.id, 'motivo', j.motivo, 'observacao', j.observacao,
                'valorDiferenca', j.valor_diferenca, 'usuario', p.nome, 'criadoEm', j.criado_em)
                order by j.criado_em desc)
            from public.justificativas_porto j
            left join public.perfis p on p.id = j.criado_por
            where j.ordem_pagamento_id = p_id), '[]'::jsonb),
        'historico', coalesce((select jsonb_agg(jsonb_build_object(
                'id', h.id, 'evento', h.evento, 'descricao', h.descricao,
                'usuario', p.nome, 'criadoEm', h.criado_em) order by h.criado_em desc)
            from public.historico_porto h
            left join public.perfis p on p.id = h.criado_por
            where h.ordem_pagamento_id = p_id), '[]'::jsonb)
    ) into v
    from public.porto_ops_conciliadas op where op.id = p_id;

    if v is null then
        raise exception 'Ordem de pagamento nao encontrada.' using errcode = 'no_data_found';
    end if;
    return v;
end;
$$;

-- Receber uma OP: grava o recebimento e marca as OSs dela como recebidas, no
-- mesmo commit. Separados, um erro deixaria OP paga com OS aguardando.
create or replace function public.porto_receber_op(
    p_id bigint, p_valor_recebido numeric, p_data_recebimento date,
    p_calendario_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_op public.ordens_pagamento_porto;
begin
    perform public.exigir_administrador();
    select * into v_op from public.ordens_pagamento_porto where id = p_id for update;
    if not found then
        raise exception 'Ordem de pagamento nao encontrada.' using errcode = 'no_data_found';
    end if;

    update public.ordens_pagamento_porto
       set valor_recebido = p_valor_recebido,
           data_recebimento = p_data_recebimento,
           situacao_financeira = 'RECEBIDO',
           calendario_pagamento_id = coalesce(p_calendario_id, calendario_pagamento_id)
     where id = p_id;

    update public.ordens_servico_porto
       set status_financeiro = 'RECEBIDO', data_efetiva_pagamento = p_data_recebimento
     where ordem_pagamento_id = p_id and status_financeiro <> 'RECEBIDO';

    insert into public.historico_porto (ordem_pagamento_id, evento, descricao, criado_por)
    values (p_id, 'RECEBIMENTO',
            'Recebimento confirmado de ' || p_valor_recebido::text || ' em ' || p_data_recebimento::text,
            (select auth.uid()));

    return public.porto_detalhe_op(p_id);
end;
$$;

revoke execute on function public.porto_resumo_ops(date, date) from public;
revoke execute on function public.porto_dashboard(date, date) from public;
revoke execute on function public.porto_detalhe_op(bigint) from public;
revoke execute on function public.porto_receber_op(bigint, numeric, date, bigint) from public;
grant execute on function public.porto_resumo_ops(date, date) to authenticated;
grant execute on function public.porto_dashboard(date, date) to authenticated;
grant execute on function public.porto_detalhe_op(bigint) to authenticated;
grant execute on function public.porto_receber_op(bigint, numeric, date, bigint) to authenticated;
