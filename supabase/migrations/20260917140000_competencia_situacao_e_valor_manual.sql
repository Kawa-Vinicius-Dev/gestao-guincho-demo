-- Diario Operacional x OP — etapa 1: competencia, situacao da OS e valor manual.
-- Plano completo: docs/plano-diario-operacional-x-op.md
--
-- Operacional (OS do Diario) e financeiro (valor manual ou oficial da OP) ficam
-- separados. A data do servico nunca muda; a competencia financeira e a da OP em
-- que a OS entrou, ou, sem OP, a da data do servico — a menos que essa
-- competencia ja tenha tido OP importada e a OS nao estava nela: ai ela fica
-- "aguardando proxima OP" e e acompanhada na primeira competencia seguinte que
-- ainda nao teve OP.

-- 1. Valor manual: informado antes da OP, guardado mesmo depois que a OP chega
--    (para comparar e mostrar divergencia). O valor oficial continua em valor_total.
alter table public.ordens_servico_porto
    add column if not exists valor_manual numeric(12, 2),
    add column if not exists valor_manual_em timestamptz,
    add column if not exists valor_manual_por uuid references public.perfis(id) on delete set null;

do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'oss_porto_valor_manual_nao_negativo') then
        alter table public.ordens_servico_porto
            add constraint oss_porto_valor_manual_nao_negativo check (valor_manual is null or valor_manual >= 0);
    end if;
end $$;

-- 2. Competencias. Kawa nao tem o cronograma da Porto, so as OPs: no passado, as
--    OPs que fecham com ate 7 dias de diferenca formam uma competencia (e a mesma
--    regra de agruparPorPeriodo na tela). Para frente, padrao provisorio fechando
--    no dia 15 e no ultimo dia do mes, ate a OP real chegar.
create or replace function public.porto_competencias()
returns table (inicio date, fim date, tem_op boolean, op_ids bigint[])
language sql
stable
security definer
set search_path to ''
as $$
    with ops as (
        select id, periodo_fim from public.ordens_pagamento_porto where periodo_fim is not null
    ), marcadas as (
        select id, periodo_fim,
               case when lag(periodo_fim) over w is null or periodo_fim - lag(periodo_fim) over w > 7
                    then 1 else 0 end as novo
          from ops window w as (order by periodo_fim, id)
    ), grupos as (
        select id, periodo_fim, sum(novo) over (order by periodo_fim, id) as g from marcadas
    ), reais as (
        select max(periodo_fim) as fim, array_agg(id order by id) as op_ids from grupos group by g
    ), ultimo as (
        select coalesce(max(fim), (select min(data_atendimento) - 1 from public.ordens_servico_porto), current_date) as fim
          from reais
    ), futuras as (
        select distinct v.d::date as fim
          from ultimo u,
               generate_series(date_trunc('month', u.fim), (greatest(current_date, u.fim) + 45)::timestamp, interval '1 month') m,
               lateral (values (m + interval '14 days'), (m + interval '1 month' - interval '1 day')) v(d)
         where v.d::date > u.fim + 3 and v.d::date <= greatest(current_date, u.fim) + 45
    ), todas as (
        select fim, true as tem_op, op_ids from reais
        union all
        select fim, false, '{}'::bigint[] from futuras
    )
    select coalesce(lag(fim) over (order by fim) + 1,
                    least((select min(periodo_inicio) from public.ordens_pagamento_porto),
                          (select min(data_atendimento) from public.ordens_servico_porto),
                          fim)) as inicio,
           fim, tem_op, op_ids
      from todas
     order by fim
$$;
revoke execute on function public.porto_competencias() from public, anon;
grant execute on function public.porto_competencias() to authenticated;

-- 3. Situacao de cada OS (nao cancelada).
--    AGUARDANDO_ANALISE    sem OP e sem valor
--    VALOR_MANUAL          sem OP, com valor manual (previsto)
--    AGUARDANDO_PROXIMA_OP a competencia da data ja teve OP e a OS nao estava
--    CONCILIADA            dentro de uma OP
--    DIVERGENTE            dentro de uma OP, com valor diferente do manual
create or replace function public.porto_os_situacao()
returns table (
    os_id bigint, competencia_inicio date, competencia_fim date, situacao text,
    sem_valor boolean, valor_previsto numeric, divergencia numeric
)
language sql
stable
security definer
set search_path to ''
as $$
    with comp as (
        select * from public.porto_competencias()
    ), base as (
        select os.id, os.valor_total, os.valor_manual, os.ordem_pagamento_id, os.data_atendimento, op.periodo_fim
          from public.ordens_servico_porto os
          left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
         where os.status_operacional::text <> 'CANCELADO'
    ), com_competencia as (
        select b.*, c.inicio as c_inicio, c.fim as c_fim, c.tem_op as c_tem_op
          from base b
          left join comp c on coalesce(b.periodo_fim, b.data_atendimento) between c.inicio and c.fim
    )
    select x.id,
           coalesce(p.inicio, x.c_inicio),
           coalesce(p.fim, x.c_fim),
           case when x.ordem_pagamento_id is not null then
                     case when x.valor_manual is not null and abs(x.valor_total - x.valor_manual) >= 0.01
                          then 'DIVERGENTE' else 'CONCILIADA' end
                when x.c_tem_op then 'AGUARDANDO_PROXIMA_OP'
                when x.valor_manual is not null then 'VALOR_MANUAL'
                else 'AGUARDANDO_ANALISE' end,
           x.ordem_pagamento_id is null and x.valor_manual is null,
           case when x.ordem_pagamento_id is not null then x.valor_total else x.valor_manual end,
           case when x.ordem_pagamento_id is not null and x.valor_manual is not null
                then x.valor_total - x.valor_manual end
      from com_competencia x
      left join lateral (
          -- Pendente segue para a primeira competencia seguinte que ainda nao teve OP.
          select c.inicio, c.fim
            from comp c
           where x.ordem_pagamento_id is null and x.c_tem_op
             and c.inicio > x.c_fim and not c.tem_op
           order by c.inicio
           limit 1
      ) p on true
$$;
revoke execute on function public.porto_os_situacao() from public, anon, authenticated;

-- 4. Valor manual de uma OS sem OP. Com OP, o valor oficial e o da OP.
create or replace function public.porto_informar_valor_manual(p_os_id bigint, p_valor numeric)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
    perform public.exigir_administrador();
    if p_valor is not null and p_valor < 0 then
        raise exception 'O valor não pode ser negativo.' using errcode = 'invalid_parameter_value';
    end if;

    update public.ordens_servico_porto
       set valor_manual = p_valor,
           valor_manual_em = case when p_valor is null then null else now() end,
           valor_manual_por = case when p_valor is null then null else (select auth.uid()) end
     where id = p_os_id and ordem_pagamento_id is null;

    if not found then
        if exists (select 1 from public.ordens_servico_porto where id = p_os_id) then
            raise exception 'Esta OS já está numa OP: o valor oficial vem da OP.' using errcode = 'invalid_parameter_value';
        end if;
        raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
    end if;
end;
$$;
revoke execute on function public.porto_informar_valor_manual(bigint, numeric) from public, anon;
grant execute on function public.porto_informar_valor_manual(bigint, numeric) to authenticated;

-- 5. Pendencias do periodo: o valor digitado para OS sem OP vira valor manual, e nao
--    mais valor_total (que passa a ser so o oficial da OP).
do $$
declare v_def text; v_antes text;
begin
    select pg_get_functiondef('public.porto_resolver_pendencias'::regproc) into v_def;
    v_antes := 'set valor_total = coalesce(v_valor, os.valor_total),';
    if position(v_antes in v_def) = 0 then raise exception 'resolver_pendencias: trecho do valor nao encontrado'; end if;
    execute replace(v_def, v_antes,
        'set valor_manual = case when os.ordem_pagamento_id is null then coalesce(v_valor, os.valor_manual) else os.valor_manual end,
               valor_manual_em = case when os.ordem_pagamento_id is null and v_valor is not null then now() else os.valor_manual_em end,
               valor_manual_por = case when os.ordem_pagamento_id is null and v_valor is not null then (select auth.uid()) else os.valor_manual_por end,');
end $$;

-- 6. Importacao da OP devolve a conciliacao: OS do Diario da competencia da OP que
--    nao estao em nenhuma OP importada, e OS desta OP com valor diferente do manual.
do $$
declare v_def text; v_antes text;
begin
    select pg_get_functiondef('public.porto_confirmar_importacao'::regproc) into v_def;
    v_antes := '''receitasCriadas'', v_receitas,';
    if position(v_antes in v_def) = 0 then raise exception 'confirmar_importacao: retorno nao encontrado'; end if;
    execute replace(v_def, v_antes, v_antes || '
        ''naoEncontradas'', case when v_op.id is null then ''[]''::jsonb else coalesce((
            select jsonb_agg(jsonb_build_object(
                       ''id'', os.id, ''numero'', os.numero, ''dataAtendimento'', os.data_atendimento,
                       ''socorrista'', m.nome, ''viatura'', os.sigla_viatura, ''valorManual'', os.valor_manual)
                   order by os.data_atendimento, os.numero)
              from public.porto_os_situacao() s
              join public.ordens_servico_porto os on os.id = s.os_id
              left join public.motoristas m on m.id = os.motorista_id
              join public.porto_competencias() c on (select op.periodo_fim from public.ordens_pagamento_porto op where op.id = v_op.id) between c.inicio and c.fim
             where s.situacao = ''AGUARDANDO_PROXIMA_OP''
               and os.data_atendimento between c.inicio and c.fim), ''[]''::jsonb) end,
        ''divergentes'', case when v_op.id is null then ''[]''::jsonb else coalesce((
            select jsonb_agg(jsonb_build_object(
                       ''id'', os.id, ''numero'', os.numero, ''valorManual'', os.valor_manual,
                       ''valorOp'', os.valor_total, ''diferenca'', os.valor_total - os.valor_manual)
                   order by os.numero)
              from public.ordens_servico_porto os
             where os.ordem_pagamento_id = v_op.id and os.valor_manual is not null
               and abs(os.valor_total - os.valor_manual) >= 0.01), ''[]''::jsonb) end,');
end $$;
