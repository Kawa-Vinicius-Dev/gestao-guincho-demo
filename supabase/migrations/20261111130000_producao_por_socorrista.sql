-- Producao de cada socorrista no periodo, comparada com a media da equipe.
--
-- O dashboard_financeiro ja entrega servicos, producao e comissao por
-- socorrista, mas nao diz quem esta acima ou abaixo da equipe. Quem quer saber
-- "quem esta produzindo pouco" tinha que montar a comparacao por fora, e cada um
-- montava de um jeito. Aqui a comparacao mora no banco, uma vez so.
--
-- Regras:
--   producao    = valor das OS pagas do socorrista (a mesma do dashboard)
--   media       = producao media de quem fez ao menos 1 servico pago; quem so
--                 tem despesa no periodo nao puxa a media para baixo
--   pct_da_media = producao / media x 100 (sem media, null)
--   posicao     = 1 para quem mais produziu; empate divide a mesma posicao
--
-- So le. Quem pode chamar e decidido pelo dashboard_financeiro (administrador).
create or replace function public.producao_por_socorrista_do_dashboard(
    p_dashboard jsonb
) returns table (
    motorista_id bigint,
    socorrista text,
    servicos bigint,
    producao numeric,
    ticket_medio numeric,
    comissao numeric,
    despesas numeric,
    custo_total numeric,
    media_da_equipe numeric,
    pct_da_media numeric,
    posicao bigint
)
language sql
stable
set search_path = ''
as $$
    with d as (
        select p_dashboard as j
    ),
    linhas as (
        select (e->>'motoristaId')::bigint as motorista_id,
               e->>'socorrista' as socorrista,
               (e->>'servicos')::bigint as servicos,
               (e->>'producao')::numeric as producao,
               (e->>'comissao')::numeric as comissao,
               (e->>'despesas')::numeric as despesas,
               (e->>'custoTotal')::numeric as custo_total
        from d, jsonb_array_elements(d.j->'resultadoPorSocorrista') e
    ),
    media as (
        select avg(producao) filter (where servicos > 0) as m from linhas
    )
    select l.motorista_id, l.socorrista, l.servicos, l.producao,
           case when l.servicos > 0 then round(l.producao / l.servicos, 2) end,
           l.comissao, l.despesas, l.custo_total,
           round(m.m, 2),
           case when m.m > 0 then round(l.producao / m.m * 100, 2) end,
           rank() over (order by l.producao desc)
    from linhas l cross join media m
    order by l.producao desc, l.socorrista;
$$;

comment on function public.producao_por_socorrista_do_dashboard(jsonb) is
    'A comparacao com a media da equipe sobre o JSON de um dashboard_financeiro ja calculado (ver lucro_por_viatura_do_dashboard).';
revoke execute on function public.producao_por_socorrista_do_dashboard(jsonb) from public;
revoke execute on function public.producao_por_socorrista_do_dashboard(jsonb) from anon;
grant execute on function public.producao_por_socorrista_do_dashboard(jsonb) to authenticated;

create or replace function public.producao_por_socorrista(
    p_inicio date,
    p_fim date,
    p_por_competencia boolean default true
) returns table (
    motorista_id bigint,
    socorrista text,
    servicos bigint,
    producao numeric,
    ticket_medio numeric,
    comissao numeric,
    despesas numeric,
    custo_total numeric,
    media_da_equipe numeric,
    pct_da_media numeric,
    posicao bigint
)
language sql
stable
set search_path = ''
as $$
    select * from public.producao_por_socorrista_do_dashboard(
        public.dashboard_financeiro(p_inicio, p_fim, p_por_competencia));
$$;

comment on function public.producao_por_socorrista(date, date, boolean) is
    'Producao de cada socorrista no periodo e quanto ela e da media da equipe.';

revoke execute on function public.producao_por_socorrista(date, date, boolean) from public;
revoke execute on function public.producao_por_socorrista(date, date, boolean) from anon;
grant execute on function public.producao_por_socorrista(date, date, boolean) to authenticated;
