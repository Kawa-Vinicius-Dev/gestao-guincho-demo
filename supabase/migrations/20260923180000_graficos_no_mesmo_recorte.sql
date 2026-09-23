-- Aba Graficos (o que era o Painel Porto) no mesmo recorte das outras telas.
--
-- Kawa, 23/09/2026: "se deixar os dois [Visao geral e Painel Porto], duvide
-- muito o valor". O Painel Porto contava com quatro regras de data dentro da
-- mesma chamada: cartoes por `coalesce(fim da OP, atendimento)`, grafico pela
-- data do servico, faturamento pela competencia e OPs pelo fim ou pela data
-- programada. Agora ha um recorte so, o de `porto_os_filtradas`, no modo do
-- seletor (OP e mes pela competencia; De-ate pela data do servico).
--
-- O faturamento por socorrista e por viatura sai daqui: foi para a Visao
-- geral, calculado sobre a mesma lista de OS que ela ja mostra.
--
-- As OPs do periodo: pela competencia, as que fecham nele; pela data, as que
-- pagaram algum servico do recorte.

drop function if exists public.porto_dashboard_alto_nivel(date, date, text);

create or replace function public.porto_dashboard_alto_nivel(
    p_inicio date, p_fim date, p_grao text default 'DIA', p_por_competencia boolean default true)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
    v_unidade text;
    v jsonb;
begin
    perform public.exigir_administrador();

    v_unidade := case upper(coalesce(p_grao, 'DIA'))
        when 'MES' then 'month' when 'SEMANA' then 'week' else 'day' end;

    with oss as (
        select os.id, os.valor_total, os.motorista_id, os.sigla_viatura, os.data_atendimento,
               os.ordem_pagamento_id, s.situacao, s.sem_valor, s.valor_previsto, s.divergencia
          from public.ordens_servico_porto os
          join public.porto_os_situacao() s on s.os_id = os.id
         where os.id in (select public.porto_os_filtradas(p_inicio, p_fim, null, null, null, null, null, null,
                                                          false, p_por_competencia))
    ),
    ops as (
        select op.*,
               case when op.status_conciliacao = 'RECEBIDA_COM_DIVERGENCIA' and op.valor_recebido is not null
                    then abs(op.valor_total - op.valor_recebido) else abs(op.divergencia) end as divergencia_abs
          from public.porto_ops_conciliadas op
         where case when p_por_competencia
                    then coalesce(op.periodo_fim, op.data_pagamento_programada) between p_inicio and p_fim
                    else op.id in (select ordem_pagamento_id from oss where ordem_pagamento_id is not null) end
    ),
    baldes as (
        select generate_series(date_trunc(v_unidade, p_inicio::timestamp),
                               date_trunc(v_unidade, p_fim::timestamp),
                               ('1 ' || v_unidade)::interval)::date as balde
    ),
    producao as (
        select date_trunc(v_unidade, data_atendimento::timestamp)::date as balde,
               sum(valor_total) as valor, count(*) as quantidade
          from oss group by 1
    ),
    recebido as (
        select date_trunc(v_unidade, coalesce(periodo_fim, data_recebimento)::timestamp)::date as balde,
               sum(valor_recebido) as valor
          from ops where valor_recebido is not null group by 1
    ),
    programado as (
        select date_trunc(v_unidade, coalesce(periodo_fim, data_pagamento_programada)::timestamp)::date as balde,
               sum(valor_total) as valor
          from ops group by 1
    )
    select jsonb_build_object(
        'periodoInicio', p_inicio, 'periodoFim', p_fim,
        'grao', upper(coalesce(p_grao, 'DIA')),
        'porCompetencia', p_por_competencia,
        -- Vazios so para o Painel Porto antigo nao quebrar entre aplicar esta
        -- migration e publicar o frontend novo, que nao le mais estes campos.
        'faturamentoPorSocorrista', '[]'::jsonb,
        'faturamentoPorViatura', '[]'::jsonb,
        -- Servicos do recorte: os mesmos da lista de OS e da Visao geral.
        'quantidadeTotalServicos', (select count(*) from oss),
        'valorTotalRealizado', (select coalesce(sum(valor_total), 0) from oss),
        'quantidadeAguardandoOp', (select count(*) from oss where ordem_pagamento_id is null),
        'valorAguardandoOp', (select coalesce(sum(coalesce(valor_previsto, 0)), 0) from oss where ordem_pagamento_id is null),
        -- OPs do periodo.
        'quantidadeTotalOps', (select count(*) from ops),
        'valorTotalPrevisto', (select coalesce(sum(valor_total), 0) from ops),
        'valorRecebido', (select coalesce(sum(valor_recebido) filter (where data_recebimento is not null), 0) from ops),
        'quantidadeComDivergencia', (select count(*) from ops
            where status_conciliacao in ('VALOR_ABAIXO', 'VALOR_ACIMA', 'RECEBIDA_COM_DIVERGENCIA')),
        'valorTotalDivergencias', (select coalesce(sum(divergencia_abs), 0) from ops
            where status_conciliacao in ('VALOR_ABAIXO', 'VALOR_ACIMA', 'RECEBIDA_COM_DIVERGENCIA')),
        'serie', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'inicio', b.balde,
                'produzido', coalesce(p.valor, 0), 'servicos', coalesce(p.quantidade, 0),
                'recebido', coalesce(r.valor, 0), 'programado', coalesce(g.valor, 0)
            ) order by b.balde), '[]'::jsonb)
              from baldes b
              left join producao p on p.balde = b.balde
              left join recebido r on r.balde = b.balde
              left join programado g on g.balde = b.balde),
        'opsDestaque', (
            select coalesce(jsonb_agg(x order by x.prioridade, x.referencia desc), '[]'::jsonb)
              from (
                select op.id, op.numero, op.valor_total, op.valor_recebido,
                       op.periodo_inicio, op.periodo_fim, op.data_pagamento_programada,
                       op.data_recebimento, op.situacao_financeira, op.status_conciliacao,
                       op.quantidade_ordens_servico, op.divergencia,
                       (op.data_recebimento is null and op.data_pagamento_programada < current_date) as vencida,
                       case
                           when op.status_conciliacao in ('VALOR_ABAIXO','VALOR_ACIMA','RECEBIDA_COM_DIVERGENCIA') then 1
                           when op.data_recebimento is null and op.data_pagamento_programada < current_date then 2
                           when op.data_recebimento is null then 3
                           else 4
                       end as prioridade,
                       coalesce(op.periodo_fim, op.data_pagamento_programada, op.criado_em::date) as referencia
                  from ops op
                 order by prioridade, referencia desc
                 limit 8
              ) x),
        'pendenciasVinculo', (
            select jsonb_build_object(
                'quantidade', count(*) filter (
                    where motorista_id is null or coalesce(btrim(sigla_viatura), '') = ''),
                'semSocorrista', count(*) filter (where motorista_id is null),
                'semViatura', count(*) filter (where coalesce(btrim(sigla_viatura), '') = ''))
              from oss),
        'conciliacao', (
            select jsonb_build_object(
                'semValor', count(*) filter (where situacao = 'AGUARDANDO_ANALISE'),
                'comValorManual', count(*) filter (where situacao = 'VALOR_MANUAL'),
                'valorManual', coalesce(sum(valor_previsto) filter (where situacao = 'VALOR_MANUAL'), 0),
                'aguardandoProximaOp', count(*) filter (where situacao = 'AGUARDANDO_PROXIMA_OP'),
                'valorAguardandoProximaOp', coalesce(sum(valor_previsto) filter (where situacao = 'AGUARDANDO_PROXIMA_OP'), 0),
                'divergentes', count(*) filter (where situacao = 'DIVERGENTE'),
                'valorDivergencia', coalesce(sum(divergencia) filter (where situacao = 'DIVERGENTE'), 0),
                'valorPrevisto', coalesce(sum(valor_previsto), 0))
              from oss)
    ) into v;

    return v;
end;
$$;
revoke execute on function public.porto_dashboard_alto_nivel(date, date, text, boolean) from public, anon;
grant execute on function public.porto_dashboard_alto_nivel(date, date, text, boolean) to authenticated;
