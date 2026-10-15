-- Regra dos 15 dias (Kawa, 15/10/2026, grill-me).
--
--  * Quinzena de calendario: 01-15 e 16-fim do mes. E ela que desenha o periodo
--    em aberto, ainda sem OP (as quinzenas futuras de porto_competencias).
--  * Periodo da OP: dentro de um mes so. A da 1a quinzena vai do dia 1 ao
--    ultimo servico (15 ou 16); a da 2a, do dia seguinte ao fim da 1a ate o
--    ultimo servico, sem passar do fim do mes. As datas que a Porto escreve na
--    OP nao valem mais.
--  * A OS que entrou numa OP fica nessa OP para sempre (mesmo do dia 16 ou de
--    meses antes). Isso ja era assim e continua: o periodo da OP so muda onde
--    o dinheiro dela e lancado, nunca quais OS sao dela.
--  * Correcao manual do periodo (Ordens de pagamento > editar) tem prioridade.
--
-- Tudo que usa periodo (seletor, filtros por OP e Mes, comissao, DRE,
-- Graficos, Visao geral) le `periodo_inicio`/`periodo_fim` da OP. Por isso basta
-- mudar como eles sao calculados: `porto_recalcular_periodos`.
--
-- Detalhes:
--  * Toda OP fica dentro de um mes: a da 1a quinzena comeca no dia 1; a da 2a,
--    no dia seguinte ao fim da 1a (detalhes em porto_periodos_calculados).
--  * Mes sem OP vira as quinzenas provisorias que porto_competencias ja cria.
--  * OP sem nenhuma OS e sem correcao manual: o periodo fica como esta.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

-- Inicio da quinzena de calendario que contem o fim de uma OP. O fim pode cair
-- um dia depois (OS do dia 16 numa OP de 01-15, ou do dia 1 numa de 16-fim), por
-- isso a conta e feita sobre o dia anterior ao fim.
create or replace function public.inicio_da_quinzena_do_fim(p_fim date)
returns date
language sql
immutable
set search_path = ''
as $$
    select case when extract(day from p_fim - 1) <= 15
                then date_trunc('month', p_fim - 1)::date
                else (date_trunc('month', p_fim - 1) + interval '15 days')::date end
$$;
revoke all on function public.inicio_da_quinzena_do_fim(date) from public, anon;
grant execute on function public.inicio_da_quinzena_do_fim(date) to authenticated;

-- O periodo de cada OP pela regra nova, sem gravar nada. `porto_recalcular_periodos`
-- grava a partir daqui.
--
-- Kawa corrigiu ao ver a previa (15/10/2026): "tem que comecar em um mes e
-- terminar no mesmo mes; comecar no dia 1 e obrigatorio". Entao a OP e
-- classificada pela metade do mes do seu ultimo servico:
--   * 1a quinzena: do dia 1 ate o ultimo servico (15 ou 16, nunca alem do 16);
--   * 2a quinzena: do dia seguinte ao fim da 1a quinzena do mesmo mes (16 ou 17;
--     dia 16 se o mes nao teve OP da 1a) ate o ultimo servico, nunca alem do
--     fim do mes.
-- O ultimo servico pode cair um dia depois (OS do dia 16 numa OP de 01-15, do
-- dia 1 numa de 16-fim): por isso a metade e decidida pelo dia anterior ao fim.
-- OPs da mesma metade de mes dividem o periodo (ex.: 06438807 e 06438808).
-- OS de outro mes que veio na OP continua na OP, mas nao estica o periodo.
create or replace function public.porto_periodos_calculados()
returns table(op_id bigint, inicio date, fim date, manual boolean)
language sql
stable
security definer
set search_path = ''
as $$
    with ops as (
        select o.id,
               (o.quinzena_inicio is not null and o.quinzena_entrega is not null) as eh_manual,
               o.quinzena_inicio, o.quinzena_entrega,
               case when o.quinzena_inicio is not null and o.quinzena_entrega is not null
                    then o.quinzena_entrega
                    else (select max(os.data_atendimento) from public.ordens_servico_porto os
                           where os.ordem_pagamento_id = o.id) end as fim_op
          from public.ordens_pagamento_porto o
    ), classificadas as (
        select x.*,
               date_trunc('month', x.fim_op - 1)::date as mes,
               extract(day from x.fim_op - 1) <= 15 as primeira
          from ops x
         where x.fim_op is not null
    ), grupos as (
        select c.mes, c.primeira, max(c.fim_op) filter (where not c.eh_manual) as fim_auto
          from classificadas c
         group by c.mes, c.primeira
    ), fim_da_primeira as (
        select c.mes,
               max(case when c.eh_manual then c.quinzena_entrega
                        else least(c.fim_op, c.mes + 15) end) as fim
          from classificadas c
         where c.primeira
         group by c.mes
    )
    select c.id,
           case when c.eh_manual then c.quinzena_inicio
                when c.primeira then c.mes
                else coalesce(f.fim + 1, c.mes + 15) end,
           case when c.eh_manual then c.quinzena_entrega
                when c.primeira then least(g.fim_auto, c.mes + 15)
                else least(g.fim_auto, (c.mes + interval '1 month' - interval '1 day')::date) end,
           c.eh_manual
      from classificadas c
      join grupos g on g.mes = c.mes and g.primeira = c.primeira
      left join fim_da_primeira f on f.mes = c.mes
$$;
revoke execute on function public.porto_periodos_calculados() from public, anon, authenticated;

create or replace function public.porto_recalcular_periodos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.ordens_pagamento_porto op
       set periodo_inicio = c.inicio, periodo_fim = c.fim
      from public.porto_periodos_calculados() c
     where c.op_id = op.id
       and (op.periodo_inicio is distinct from c.inicio or op.periodo_fim is distinct from c.fim);
end;
$$;
revoke execute on function public.porto_recalcular_periodos() from public, anon, authenticated;

-- ------------------------------------------------------------------ meus servicos
-- O periodo em aberto do socorrista: do dia seguinte a ultima OP ate hoje, com
-- as OS do Diario no nome dele (Kawa, 15/10/2026).
create or replace function public.meus_servicos_em_aberto()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_motorista bigint := public.exigir_socorrista();
    v_inicio date;
    v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
    v jsonb;
begin
    select max(op.periodo_fim) + 1 into v_inicio from public.ordens_pagamento_porto op;
    v_inicio := coalesce(v_inicio, public.inicio_da_quinzena_do_fim(v_hoje + 1));

    select jsonb_build_object(
        'inicio', v_inicio, 'fim', v_hoje,
        'servicos', coalesce(jsonb_agg(jsonb_build_object(
            'id', os.id, 'numeroOs', os.numero, 'especialidade', os.especialidade,
            'dataAtendimento', os.data_atendimento
        ) order by os.data_atendimento desc, os.numero), '[]'::jsonb)) into v
      from public.ordens_servico_porto os
     where os.motorista_id = v_motorista
       and os.status_operacional::text <> 'CANCELADO'
       and os.data_atendimento between v_inicio and v_hoje;
    return v;
end;
$$;
revoke execute on function public.meus_servicos_em_aberto() from public, anon;
grant execute on function public.meus_servicos_em_aberto() to authenticated;

-- ------------------------------------------------------------------ dados atuais
-- As quatro OPs cuja quinzena foi gravada em 17/09/2026 a partir da tela da
-- Porto (migration 20260917260000) nao sao correcao manual: voltam a ser
-- calculadas. So se ainda tiverem exatamente aquelas datas — se o
-- administrador mudou depois, e correcao dele e fica.
update public.ordens_pagamento_porto op
   set quinzena_inicio = null, quinzena_entrega = null
  from (values ('06438807', date '2026-09-01', date '2026-09-16'),
               ('06438808', date '2026-09-01', date '2026-09-16'),
               ('06433185', date '2026-08-15', date '2026-08-28'),
               ('06427803', date '2026-08-01', date '2026-08-14')) q(numero, i, e)
 where op.numero = q.numero and op.quinzena_inicio = q.i and op.quinzena_entrega = q.e;

-- Refaz o fechamento das OPs cujo fim muda (o fim e a data da receita, da
-- conta a receber e da comissao) e ressincroniza as comissoes, como a correcao
-- de quinzena ja faz.
do $refazer$
declare r record;
begin
    for r in
        select op.id from public.ordens_pagamento_porto op
          join public.porto_periodos_calculados() c on c.op_id = op.id
         where op.periodo_inicio is distinct from c.inicio or op.periodo_fim is distinct from c.fim
    loop
        perform public.porto_fechar_op(r.id);
    end loop;
    perform public.porto_recalcular_periodos();
    perform public.porto_sincronizar_comissoes();
end
$refazer$;
