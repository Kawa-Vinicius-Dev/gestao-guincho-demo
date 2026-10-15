-- OS sem OP fica na quinzena dela: "Nao paga" e "Sem OP no sistema".
--
-- Kawa, 28/09/2026 (grill-me). A OS sem OP era projetada na primeira quinzena
-- SEM OP depois da dela. Como toda quinzena passada tem OP, isso sempre caia na
-- quinzena em andamento: em 28/09, 133 OS de 29/01 a 16/09 apareciam como
-- "Aguardando proxima OP" em 17 a 30/09 e contavam como servico dessa quinzena
-- e de setembro — inclusive a de 28/08, que ja era contestacao.
--
-- Regra nova:
--  * A OS sem OP espera so a OP seguinte. Chegou OP de quinzena posterior e ela
--    nao veio:
--      - se a quinzena dela tem OP, vira NAO_PAGA (e contestacao, nos ultimos
--        120 dias — a regra de porto_detectar_contestacoes e a mesma);
--      - se a quinzena dela nao tem OP nenhuma no sistema, vira
--        SEM_OP_NO_SISTEMA: nao da para saber se a Porto pagou ou se so a OP nao
--        foi importada, entao nunca vira contestacao.
--  * As duas contam como servico na quinzena da data delas (servico e servico),
--    saem do valor previsto e da comissao prevista, e so aparecem em Pendencias
--    se faltar valor, socorrista ou viatura.
--  * "Aguardando OP" (filtro da lista, A receber, card da viatura, Graficos e a
--    Visao geral) passa a ser so a OS que ainda pode vir numa OP.
--  * Trecho de mais de 10 dias sem OP entre duas quinzenas com OP (fevereiro e
--    marco de 2026) ganha quinzenas provisorias no dia 15 e no fim do mes, como
--    o futuro ja tinha; a ultima fecha na vespera da quinzena seguinte. O
--    seletor de periodo continua so com as quinzenas com OP e a em andamento.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

-- ------------------------------------------------------------------ "aguarda OP"
-- A OS que ainda pode vir numa OP. Um lugar so para o filtro, os cards e a
-- comissao prevista dizerem a mesma coisa.
create or replace function public.porto_os_aguarda_op(p_situacao text)
returns boolean
language sql immutable set search_path = ''
as $$
    select coalesce(p_situacao in ('AGUARDANDO_ANALISE', 'VALOR_MANUAL', 'AGUARDANDO_PROXIMA_OP'), false)
$$;
revoke execute on function public.porto_os_aguarda_op(text) from public, anon;
grant execute on function public.porto_os_aguarda_op(text) to authenticated;

-- ------------------------------------------------------------------ quinzenas
-- Igual a 20260923140000, mais as quinzenas provisorias nos trechos sem OP do
-- passado (`lacunas`).
create or replace function public.porto_competencias()
returns table(inicio date, fim date, tem_op boolean, op_ids bigint[])
language sql stable security definer set search_path = ''
as $$
    with ops as (
        select id, periodo_inicio, periodo_fim
          from public.ordens_pagamento_porto where periodo_fim is not null
    ), marcadas as (
        select id, periodo_inicio, periodo_fim,
               case when lag(periodo_fim) over w is null or periodo_fim - lag(periodo_fim) over w > 7
                    then 1 else 0 end as novo
          from ops window w as (order by periodo_fim, id)
    ), grupos as (
        select id, periodo_inicio, periodo_fim, sum(novo) over (order by periodo_fim, id) as g from marcadas
    ), reais as (
        select g, max(periodo_fim) as fim, array_agg(id order by id) as op_ids,
               array_agg(periodo_inicio) filter (where periodo_inicio is not null) as inicios
          from grupos group by g
    ), com_anterior as (
        select r.*, lag(r.fim) over (order by r.fim) as fim_anterior from reais r
    ), declaradas as (
        -- Inicio que a Porto declara para a quinzena, contado da anterior com OP.
        select a.fim_anterior,
               (select min(i) from unnest(a.inicios) i where a.fim_anterior is null or i > a.fim_anterior) as inicio
          from com_anterior a
    ), lacunas as (
        select v.d::date as fim
          from declaradas q,
               generate_series(date_trunc('month', q.fim_anterior + 1), date_trunc('month', q.inicio), interval '1 month') m,
               lateral (values (m + interval '14 days'), (m + interval '1 month' - interval '1 day')) v(d)
         where q.inicio - q.fim_anterior > 10
           and v.d::date > q.fim_anterior + 3 and v.d::date < q.inicio - 3
        union
        select q.inicio - 1 from declaradas q where q.inicio - q.fim_anterior > 10
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
        select fim, true as tem_op, op_ids, inicios from reais
        union all
        select fim, false, '{}'::bigint[], null::date[] from futuras
        union all
        select fim, false, '{}'::bigint[], null::date[] from lacunas
    ), com_piso as (
        select t.*, lag(fim) over (order by fim) + 1 as piso from todas t
    )
    select coalesce(
               -- Quinzena declarada: o menor inicio que nao recua para a anterior.
               (select min(i) from unnest(c.inicios) i where c.piso is null or i >= c.piso),
               c.piso,
               least((select min(periodo_inicio) from public.ordens_pagamento_porto),
                     (select min(data_atendimento) from public.ordens_servico_porto),
                     c.fim)) as inicio,
           c.fim, c.tem_op, c.op_ids
      from com_piso c
     order by c.fim
$$;
revoke execute on function public.porto_competencias() from public, anon;
grant execute on function public.porto_competencias() to authenticated;

-- ------------------------------------------------------------------ situacao
-- A OS vai para a primeira quinzena que fecha no dia dela ou depois (a da OP,
-- se tem OP). Sem OP: aguarda a analise (ou tem valor informado) enquanto a
-- quinzena dela nao tem OP; aguarda a proxima OP, projetada na quinzena
-- seguinte, quando a OP dela chegou sem ela; e para de esperar quando chega
-- OP de uma quinzena posterior.
create or replace function public.porto_os_situacao()
returns table(os_id bigint, competencia_inicio date, competencia_fim date, situacao text,
              sem_valor boolean, valor_previsto numeric, divergencia numeric)
language sql stable security definer set search_path = ''
as $$
    with comp as (
        select row_number() over (order by c.fim) as n, c.* from public.porto_competencias() c
    ), ultima_com_op as (
        select max(n) as n from comp where tem_op
    ), base as (
        select os.id, os.valor_total, os.valor_manual, os.ordem_pagamento_id, os.data_atendimento, op.periodo_fim
          from public.ordens_servico_porto os
          left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
         where os.status_operacional::text <> 'CANCELADO'
    ), com_competencia as (
        select b.*, c.n as c_n, c.inicio as c_inicio, c.fim as c_fim, c.tem_op as c_tem_op
          from base b
          left join lateral (
              select c.n, c.inicio, c.fim, c.tem_op from comp c
               where c.fim >= coalesce(b.periodo_fim, b.data_atendimento)
               order by c.fim limit 1
          ) c on true
    ), classificadas as (
        select x.*,
               case when x.ordem_pagamento_id is not null then
                         case when x.valor_manual is not null and abs(x.valor_total - x.valor_manual) >= 0.01
                              then 'DIVERGENTE' else 'CONCILIADA' end
                    -- Ja chegou OP de quinzena posterior e ela nao veio.
                    when x.c_n < u.n then
                         case when x.c_tem_op then 'NAO_PAGA' else 'SEM_OP_NO_SISTEMA' end
                    when x.c_tem_op then 'AGUARDANDO_PROXIMA_OP'
                    when x.valor_manual is not null then 'VALOR_MANUAL'
                    else 'AGUARDANDO_ANALISE' end as situacao
          from com_competencia x
          cross join ultima_com_op u
    )
    select x.id,
           coalesce(p.inicio, x.c_inicio),
           coalesce(p.fim, x.c_fim),
           x.situacao,
           x.ordem_pagamento_id is null and x.valor_manual is null,
           -- Nao paga e sem OP no sistema nao sao dinheiro previsto.
           case when x.ordem_pagamento_id is not null then x.valor_total
                when x.situacao in ('NAO_PAGA', 'SEM_OP_NO_SISTEMA') then null
                else x.valor_manual end,
           case when x.ordem_pagamento_id is not null and x.valor_manual is not null
                then x.valor_total - x.valor_manual end
      from classificadas x
      left join comp p on x.situacao = 'AGUARDANDO_PROXIMA_OP' and p.n = x.c_n + 1
$$;
revoke execute on function public.porto_os_situacao() from public, anon, authenticated;

-- ------------------------------------------------------------------ contestacoes
-- Igual a 20260924120000, com o passo 4 na mesma regra da situacao NAO_PAGA: a
-- quinzena dela tem OP e ja chegou OP de uma quinzena posterior. Antes era "a
-- quinzena seguinte tem OP", que com as quinzenas provisorias do passado deixaria
-- de enxergar a OS da ultima quinzena antes de um trecho sem OP.
create or replace function public.porto_detectar_contestacoes(p_hoje date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_novos integer := 0;
    v_n integer;
    -- So o que ainda da para cobrar: atendimentos dos ultimos 120 dias.
    v_desde date := p_hoje - 120;
    v_prazo date := p_hoje + 30;
begin
    perform public.exigir_administrador();

    -- 1. A Porto acabou pagando: o caso fecha sozinho como aceito.
    update public.porto_contestacoes c
       set situacao = 'ACEITA',
           valor_pago = os.valor_total,
           valor_recuperado = greatest(os.valor_total - c.valor_pago, 0),
           observacao = concat_ws(' · ', nullif(c.observacao, ''), 'Paga na OP ' || op.numero)
      from public.ordens_servico_porto os
      join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
     where c.os_id = os.id and c.tipo = 'NAO_PAGA'
       and c.situacao in ('A_CONTESTAR', 'CONTESTADA');

    -- 2. Pagamento a menos que deixou de ser (tabela corrigida): some se ninguem mexeu.
    delete from public.porto_contestacoes c
     using public.ordens_servico_porto os
     where c.os_id = os.id and c.tipo = 'PAGA_A_MENOS' and c.situacao = 'A_CONTESTAR'
       and (os.ordem_pagamento_id is null
            or coalesce(public.porto_valor_esperado(os.especialidade, os.valor_manual), 0) - os.valor_total < 0.01);

    -- 3. Casos que ninguem mexeu acompanham a tabela de precos.
    update public.porto_contestacoes c
       set valor_esperado = public.porto_valor_esperado(os.especialidade, os.valor_manual)
      from public.ordens_servico_porto os
     where c.os_id = os.id and c.situacao = 'A_CONTESTAR'
       and c.valor_esperado is distinct from public.porto_valor_esperado(os.especialidade, os.valor_manual);

    -- 4. OS nao paga: a quinzena dela teve OP, ja chegou OP de quinzena posterior,
    --    e ela nao veio em nenhuma.
    with comp as (
        select row_number() over (order by fim) as n, inicio, fim, tem_op
          from public.porto_competencias()
    ), candidatas as (
        select os.id, os.especialidade, os.valor_manual,
               (select c.n from comp c where c.fim >= os.data_atendimento order by c.fim limit 1) as n
          from public.ordens_servico_porto os
         where os.ordem_pagamento_id is null
           and os.status_operacional::text <> 'CANCELADO'
           and os.data_atendimento >= v_desde
    )
    insert into public.porto_contestacoes (os_id, tipo, valor_esperado, valor_pago, prazo)
    select k.id, 'NAO_PAGA', public.porto_valor_esperado(k.especialidade, k.valor_manual), 0, v_prazo
      from candidatas k
      join comp propria on propria.n = k.n and propria.tem_op
     where exists (select 1 from comp depois where depois.n > k.n and depois.tem_op)
    on conflict (os_id, tipo) do nothing;
    get diagnostics v_n = row_count;
    v_novos := v_novos + v_n;

    -- 5. OS paga a menos que o esperado.
    insert into public.porto_contestacoes (os_id, tipo, valor_esperado, valor_pago, prazo)
    select os.id, 'PAGA_A_MENOS', e.esperado, os.valor_total, v_prazo
      from public.ordens_servico_porto os
      cross join lateral (select public.porto_valor_esperado(os.especialidade, os.valor_manual) as esperado) e
     where os.ordem_pagamento_id is not null
       and os.status_operacional::text <> 'CANCELADO'
       and os.data_atendimento >= v_desde
       and e.esperado is not null
       and e.esperado - os.valor_total >= 0.01
    on conflict (os_id, tipo) do nothing;
    get diagnostics v_n = row_count;
    v_novos := v_novos + v_n;

    return v_novos;
end;
$$;
revoke execute on function public.porto_detectar_contestacoes(date) from public, anon;
grant execute on function public.porto_detectar_contestacoes(date) to authenticated;

-- ------------------------------------------------------------------ filtro da lista
-- Igual a 20260917160000; "AGUARDANDO" passa a ser so o que ainda pode vir numa OP.
create or replace function public.porto_os_filtradas(
    p_inicio date, p_fim date,
    p_numero_os text default null, p_numero_op text default null,
    p_motorista_id bigint default null, p_sigla text default null,
    p_especialidade text default null, p_situacao text default null,
    p_sem_viatura boolean default false,
    -- Falso: o periodo recorta pela data do servico. Verdadeiro: pela competencia
    -- financeira, que e a da OP em que a OS entrou (ou a projetada, sem OP).
    p_por_competencia boolean default false
)
returns setof bigint
language sql
stable
security definer
set search_path to ''
as $$
    select os.id
      from public.ordens_servico_porto os
      left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
      join public.porto_os_situacao() s on s.os_id = os.id
     where (case when coalesce(p_por_competencia, false)
                 then s.competencia_fim between p_inicio and p_fim
                 else os.data_atendimento between p_inicio and p_fim end)
       and os.status_operacional::text <> 'CANCELADO'
       and (nullif(btrim(p_numero_os), '') is null or os.numero ilike '%' || btrim(p_numero_os) || '%')
       and (nullif(btrim(p_numero_op), '') is null or op.numero ilike '%' || btrim(p_numero_op) || '%')
       and (p_motorista_id is null or os.motorista_id = p_motorista_id)
       and (nullif(btrim(p_sigla), '') is null or upper(btrim(os.sigla_viatura)) = upper(btrim(p_sigla)))
       and (nullif(btrim(p_especialidade), '') is null or os.especialidade ilike '%' || btrim(p_especialidade) || '%')
       and (nullif(btrim(p_situacao), '') is null
            -- Os dois antigos continuam valendo: filtro salvo na tela nao quebra.
            or (p_situacao = 'PAGA' and os.ordem_pagamento_id is not null)
            or (p_situacao = 'AGUARDANDO' and public.porto_os_aguarda_op(s.situacao))
            or p_situacao = s.situacao)
       and (not coalesce(p_sem_viatura, false) or coalesce(btrim(os.sigla_viatura), '') = '')
$$;
revoke execute on function public.porto_os_filtradas(
    date, date, text, text, bigint, text, text, text, boolean, boolean
) from public, anon, authenticated;

-- ------------------------------------------------------------------ comissao prevista
-- Igual a 20260923160000; so a OS que ainda pode vir numa OP tem comissao prevista.
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
       and public.porto_os_aguarda_op(s.situacao)
       and not os.sem_comissao
       and (v_motorista is null or os.motorista_id = v_motorista)
     group by os.motorista_id, m.nome
     order by 5 desc, m.nome;
end;
$$;

-- ------------------------------------------------------------------ pendencias
-- Igual a 20260923160000. A Nao paga e a Sem OP no sistema entram so se faltar
-- dado (nao estao na lista de situacoes), e a linha mostra o valor informado a
-- mao, que para elas nao e mais valor previsto.
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
        'valorTotal', coalesce(t.valor_previsto, t.valor_manual, 0), 'numeroOp', t.numero_op,
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

-- ------------------------------------------------------------------ seletor
-- Igual a 20260923140000: as quinzenas com OP e a em andamento. As provisorias
-- do passado (trecho sem OP) ficam de fora; o Mes e o De-ate alcancam elas.
create or replace function public.porto_periodos()
returns table(inicio date, fim date, tem_op boolean, op_ids bigint[], op_numeros text[])
language plpgsql stable security definer set search_path = ''
as $$
begin
    perform public.exigir_administrador();
    return query
    with comp as (
        select * from public.porto_competencias()
    )
    select c.inicio, c.fim, c.tem_op, c.op_ids,
           coalesce((select array_agg(op.numero order by op.numero)
                       from public.ordens_pagamento_porto op where op.id = any(c.op_ids)), '{}'::text[])
      from comp c
     where c.tem_op
        or (c.inicio <= current_date
            and c.fim > coalesce((select max(x.fim) from comp x where x.tem_op), '-infinity'::date))
     order by c.fim desc;
end;
$$;
revoke execute on function public.porto_periodos() from public, anon;
grant execute on function public.porto_periodos() to authenticated;

-- ------------------------------------------------------------------ Graficos
-- Igual a 20260923180000; "Aguardando OP" e so o que ainda pode vir numa OP,
-- o mesmo do filtro que o card abre.
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
        'quantidadeAguardandoOp', (select count(*) from oss where public.porto_os_aguarda_op(situacao)),
        'valorAguardandoOp', (select coalesce(sum(coalesce(valor_previsto, 0)), 0) from oss
                               where public.porto_os_aguarda_op(situacao)),
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

-- ------------------------------------------------------------------ Visao geral
-- Igual a 20260923220000; "N aguardam OP" (servicosPendentes) e a producao
-- pendente sao so o que ainda pode vir numa OP. A Nao paga continua contando
-- em servicosDoPeriodo, na quinzena dela.
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
               public.porto_os_aguarda_op(s.situacao) as aguarda,
               public.comissao_da_os(os.valor_total, os.motorista_id, os.ordem_pagamento_id, os.sem_comissao) as comissao
        from public.ordens_servico_porto os
        join public.porto_os_situacao() s on s.os_id = os.id
        where os.id in (select public.porto_os_filtradas(p_inicio, p_fim, null, null, null, null, null, null,
                                                         false, p_por_competencia))
    ),
    -- Receita de OS cancelada (tirar comissao cancela a OS): a Porto ja pagou e
    -- o dinheiro continua no caixa, mas a OS saiu dos servicos. A tela mostra
    -- esse valor a parte, para a receita fechar com o faturamento das barras.
    canceladas as (
        select coalesce(sum(r.valor), 0) as valor, count(distinct r.ordem_servico_porto_id) as quantidade
        from receitas_periodo r
        join public.ordens_servico_porto os on os.id = r.ordem_servico_porto_id
        where r.status = 'RECEBIDA' and os.status_operacional = 'CANCELADO'
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
            coalesce(sum(valor_total) filter (where aguarda), 0) as producao_pendente,
            count(*) as servicos_do_periodo,
            count(*) filter (where aguarda) as servicos_pendentes
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
        'receitaOsCanceladas', (select valor from canceladas),
        'osCanceladasComReceita', (select quantidade from canceladas),
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
