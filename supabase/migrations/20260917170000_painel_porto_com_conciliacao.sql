-- Diario Operacional x OP — etapa 5: o painel mostra o que ainda nao fechou.
--
-- Muda duas coisas no `porto_dashboard_alto_nivel`:
--
-- 1. O recorte dos agrupamentos passa a ser a competencia de `porto_os_situacao`,
--    e nao mais `coalesce(op.periodo_fim, data_atendimento)`. Para a OS que ja
--    entrou numa OP da no mesmo; a diferenca aparece na OS que o Diario tem e a
--    OP daquele periodo nao trouxe: ela e acompanhada na competencia seguinte,
--    em vez de ficar parada num periodo que ja fechou.
-- 2. Entra o bloco `conciliacao`: quantas OS estao sem valor, quantas tem valor
--    informado a mao, quantas esperam a proxima OP e quantas a OP pagou diferente.
--    Servico sem valor conta na quantidade — ele foi feito.

create or replace function public.porto_dashboard_alto_nivel(p_inicio date, p_fim date, p_grao text default 'DIA')
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
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
        select date_trunc(v_unidade, coalesce(op.periodo_fim, op.data_recebimento)::timestamp)::date as balde,
               sum(op.valor_recebido) as valor
        from public.ordens_pagamento_porto op
        where op.valor_recebido is not null
          and coalesce(op.periodo_fim, op.data_recebimento) between p_inicio and p_fim
        group by 1
    ),
    programado as (
        select date_trunc(v_unidade, coalesce(op.periodo_fim, op.data_pagamento_programada)::timestamp)::date as balde,
               sum(op.valor_total) as valor
        from public.ordens_pagamento_porto op
        where coalesce(op.periodo_fim, op.data_pagamento_programada) between p_inicio and p_fim
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
        'opsDestaque', v_ops,
        'faturamentoPorSocorrista', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'chave', g.chave, 'rotulo', g.rotulo, 'valor', g.valor,
                'quantidade', g.quantidade, 'semVinculo', g.sem_vinculo,
                'valorPrevisto', g.valor_previsto, 'semValor', g.sem_valor
            ) order by g.sem_vinculo, g.valor_previsto desc, g.rotulo), '[]'::jsonb)
            from (
                select coalesce(os.motorista_id::text, 'sem') as chave,
                       coalesce(min(m.nome), 'Sem socorrista') as rotulo,
                       sum(os.valor_total) as valor,
                       sum(coalesce(s.valor_previsto, 0)) as valor_previsto,
                       count(*) filter (where s.sem_valor) as sem_valor,
                       count(*) as quantidade,
                       os.motorista_id is null as sem_vinculo
                from public.ordens_servico_porto os
                join public.porto_os_situacao() s on s.os_id = os.id
                left join public.motoristas m on m.id = os.motorista_id
                where s.competencia_fim between p_inicio and p_fim
                group by os.motorista_id
            ) g),
        'faturamentoPorViatura', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'chave', g.chave, 'rotulo', g.rotulo, 'valor', g.valor,
                'quantidade', g.quantidade, 'semVinculo', g.sem_vinculo,
                'valorPrevisto', g.valor_previsto, 'semValor', g.sem_valor
            ) order by g.sem_vinculo, g.valor_previsto desc, g.rotulo), '[]'::jsonb)
            from (
                select coalesce(s.sigla, 'sem') as chave,
                       coalesce(min(v.identificacao), s.sigla, 'Sem viatura') as rotulo,
                       sum(s.valor_total) as valor,
                       sum(coalesce(s.valor_previsto, 0)) as valor_previsto,
                       count(*) filter (where s.sem_valor) as sem_valor,
                       count(*) as quantidade,
                       s.sigla is null as sem_vinculo
                from (
                    select nullif(upper(btrim(os.sigla_viatura)), '') as sigla, os.valor_total,
                           si.valor_previsto, si.sem_valor
                    from public.ordens_servico_porto os
                    join public.porto_os_situacao() si on si.os_id = os.id
                    where si.competencia_fim between p_inicio and p_fim
                ) s
                left join public.veiculos v on upper(btrim(v.sigla_porto)) = s.sigla
                group by s.sigla
            ) g),
        'pendenciasVinculo', (
            select jsonb_build_object(
                'quantidade', count(*) filter (
                    where os.motorista_id is null or coalesce(btrim(os.sigla_viatura), '') = ''),
                'semSocorrista', count(*) filter (where os.motorista_id is null),
                'semViatura', count(*) filter (where coalesce(btrim(os.sigla_viatura), '') = ''))
            from public.ordens_servico_porto os
            join public.porto_os_situacao() s on s.os_id = os.id
            where s.competencia_fim between p_inicio and p_fim),
        -- Em que pe esta a conciliacao desta competencia.
        'conciliacao', (
            select jsonb_build_object(
                'semValor', count(*) filter (where s.situacao = 'AGUARDANDO_ANALISE'),
                'comValorManual', count(*) filter (where s.situacao = 'VALOR_MANUAL'),
                'valorManual', coalesce(sum(s.valor_previsto) filter (where s.situacao = 'VALOR_MANUAL'), 0),
                'aguardandoProximaOp', count(*) filter (where s.situacao = 'AGUARDANDO_PROXIMA_OP'),
                'valorAguardandoProximaOp', coalesce(sum(s.valor_previsto) filter (where s.situacao = 'AGUARDANDO_PROXIMA_OP'), 0),
                'divergentes', count(*) filter (where s.situacao = 'DIVERGENTE'),
                'valorDivergencia', coalesce(sum(s.divergencia) filter (where s.situacao = 'DIVERGENTE'), 0),
                'valorPrevisto', coalesce(sum(s.valor_previsto), 0))
            from public.porto_os_situacao() s
            where s.competencia_fim between p_inicio and p_fim)
    );
end;
$function$;
