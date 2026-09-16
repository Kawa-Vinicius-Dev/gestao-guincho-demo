-- O painel Porto precisa responder "como evoluiu" e "o que preciso resolver",
-- nao so "quanto deu".
--
-- Duas coisas faltavam: a evolucao no tempo — producao, recebimento e
-- programacao lado a lado — e a lista curta das OPs que merecem o olho do
-- administrador. Ambas saem na mesma chamada do resumo, porque a tela abre com
-- as duas ao mesmo tempo e duas idas ao banco para montar uma tela e uma ida a
-- mais.
--
-- Cada serie tem uma data propria, e e de proposito:
--   producao   -> data do atendimento, que e quando o servico aconteceu
--   recebido   -> data do recebimento da OP, que e quando o dinheiro entrou
--   programado -> data programada da OP, que e quando ele deveria entrar
-- Forcar as tres na mesma data esconderia justamente a distancia entre elas,
-- que e a pergunta que o grafico existe para responder — uma OP de abril paga
-- em junho e exatamente esse intervalo.
create or replace function public.porto_dashboard_alto_nivel(
    p_inicio date, p_fim date, p_grao text default 'DIA'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_resumo jsonb;
    v_serie jsonb;
    v_ops jsonb;
    v_unidade text;
begin
    perform public.exigir_administrador();

    v_resumo := public.porto_dashboard(p_inicio, p_fim);

    v_unidade := case upper(coalesce(p_grao, 'DIA'))
        when 'MES' then 'month' when 'SEMANA' then 'week' else 'day' end;

    with baldes as (
        select generate_series(
            date_trunc(v_unidade, p_inicio::timestamp),
            date_trunc(v_unidade, p_fim::timestamp),
            ('1 ' || v_unidade)::interval)::date as balde
    ),
    producao as (
        select date_trunc(v_unidade, os.data_atendimento::timestamp)::date as balde,
               sum(os.valor_total) as valor, count(*) as quantidade
        from public.ordens_servico_porto os
        where os.data_atendimento between p_inicio and p_fim
          and os.status_operacional <> 'CANCELADO'
        group by 1
    ),
    recebido as (
        select date_trunc(v_unidade, op.data_recebimento::timestamp)::date as balde,
               sum(op.valor_recebido) as valor
        from public.ordens_pagamento_porto op
        where op.data_recebimento between p_inicio and p_fim
        group by 1
    ),
    programado as (
        select date_trunc(v_unidade, op.data_pagamento_programada::timestamp)::date as balde,
               sum(op.valor_total) as valor
        from public.ordens_pagamento_porto op
        where op.data_pagamento_programada between p_inicio and p_fim
        group by 1
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'inicio', b.balde,
        'produzido', coalesce(p.valor, 0),
        'servicos', coalesce(p.quantidade, 0),
        'recebido', coalesce(r.valor, 0),
        'programado', coalesce(g.valor, 0)
    ) order by b.balde), '[]'::jsonb) into v_serie
    from baldes b
    left join producao p on p.balde = b.balde
    left join recebido r on r.balde = b.balde
    left join programado g on g.balde = b.balde;

    -- As OPs que merecem o olho primeiro: as que divergem ou venceram na frente,
    -- e o resto por recencia. Oito cabem na tela sem virar uma segunda tabela.
    select coalesce(jsonb_agg(x order by x.prioridade, x.referencia desc), '[]'::jsonb)
      into v_ops
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
        from public.porto_ops_conciliadas op
        where coalesce(op.periodo_fim, op.data_pagamento_programada) between p_inicio and p_fim
        order by prioridade, referencia desc
        limit 8
    ) x;

    return v_resumo || jsonb_build_object(
        'grao', upper(coalesce(p_grao, 'DIA')),
        'serie', v_serie,
        'opsDestaque', v_ops
    );
end;
$$;

revoke execute on function public.porto_dashboard_alto_nivel(date, date, text) from public, anon;
grant execute on function public.porto_dashboard_alto_nivel(date, date, text) to authenticated;
