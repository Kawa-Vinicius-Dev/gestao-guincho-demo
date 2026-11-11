-- Base para as metas do proximo mes: media mensal dos ultimos meses completos,
-- por viatura (receita e resultado) e por socorrista (producao), com a tendencia.
--
-- E so a base. A meta de verdade e do dono: o sistema propoe a media, ele ajusta.
-- Nada aqui grava meta.
--
-- Regras:
--   meses       = os p_meses meses COMPLETOS antes do mes da referencia (o mes em
--                 andamento fica de fora: ainda nao fechou e puxaria a media para baixo)
--   media       = media dos meses em que a viatura/socorrista teve movimento; quem
--                 entrou ha pouco nao e punido pelos meses em que nao existia
--                 (meses_com_dado mostra em quantos a media se apoia)
--   ultimo_mes  = valor do mes mais recente (0 se nao teve movimento nele)
--   tendencia   = (ultimo mes - media dos anteriores) / |media dos anteriores| x 100;
--                 sem anteriores com movimento, null
--   parcial     = mes marcado por qualidade_dos_meses (parece faltar OP importada).
--                 meses_parciais conta quantos dos meses de cada linha sao assim;
--                 media_sem_parciais e a media sem eles (null se todos forem parciais).
--                 media_mensal continua a media de todos: a escolha de qual usar e do dono.
--
-- Usa lucro_por_viatura e producao_por_socorrista, entao so administrador chama
-- e as contas sao as mesmas das telas.
create or replace function public.base_para_metas(
    p_meses integer default 3,
    p_referencia date default (now() at time zone 'America/Sao_Paulo')::date
) returns table (
    tipo text,
    id bigint,
    nome text,
    metrica text,
    meses_com_dado integer,
    meses_parciais integer,
    media_mensal numeric,
    media_sem_parciais numeric,
    ultimo_mes numeric,
    tendencia_pct numeric
)
language plpgsql
stable
set search_path = ''
as $$
begin
    if p_meses is null or p_meses < 1 or p_meses > 12 then
        raise exception 'p_meses deve estar entre 1 e 12';
    end if;

    return query
    with meses as (
        select g as ordem,
               (date_trunc('month', p_referencia) - make_interval(months => g))::date as ini,
               (date_trunc('month', p_referencia) - make_interval(months => g - 1))::date - 1 as fim
        from generate_series(1, p_meses) g
    ),
    -- Cada funcao roda uma vez por mes (cada uma executa o dashboard inteiro);
    -- receita e resultado da viatura saem da mesma chamada.
    viaturas as materialized (
        select m.ordem, v.veiculo_id, v.veiculo, v.receitas, v.resultado
        from meses m, lateral public.lucro_por_viatura(m.ini, m.fim) v
    ),
    socorristas as materialized (
        select m.ordem, s.motorista_id, s.socorrista, s.producao
        from meses m, lateral public.producao_por_socorrista(m.ini, m.fim) s
        where s.servicos > 0
    ),
    parciais as materialized (
        select m.ordem, q.parcial
        from meses m
        join public.qualidade_dos_meses(p_meses, p_referencia) q
          on q.mes = to_char(m.ini, 'YYYY-MM')
    ),
    serie as (
        select 'VIATURA'::text as tipo, v.veiculo_id as id, v.veiculo as nome,
               'receita'::text as metrica, v.ordem, v.receitas as valor
        from viaturas v
        union all
        select 'VIATURA', v.veiculo_id, v.veiculo, 'resultado', v.ordem, v.resultado
        from viaturas v
        union all
        select 'SOCORRISTA', s.motorista_id, s.socorrista, 'producao', s.ordem, s.producao
        from socorristas s
    ),
    agregado as (
        select s.tipo, s.id, s.nome, s.metrica,
               count(*)::integer as meses_com_dado,
               (count(*) filter (where p.parcial))::integer as meses_parciais,
               avg(s.valor) as media,
               avg(s.valor) filter (where not p.parcial) as media_sem_parciais,
               coalesce(sum(s.valor) filter (where s.ordem = 1), 0) as ultimo,
               avg(s.valor) filter (where s.ordem > 1) as anteriores
        from serie s
        join parciais p on p.ordem = s.ordem
        group by s.tipo, s.id, s.nome, s.metrica
    )
    select a.tipo, a.id, a.nome, a.metrica, a.meses_com_dado, a.meses_parciais,
           round(a.media, 2), round(a.media_sem_parciais, 2), round(a.ultimo, 2),
           case when a.anteriores is not null and a.anteriores <> 0
                then round((a.ultimo - a.anteriores) / abs(a.anteriores) * 100, 2) end
    from agregado a
    order by a.tipo desc, a.metrica, a.media desc;
end;
$$;

comment on function public.base_para_metas(integer, date) is
    'Media mensal dos ultimos meses completos por viatura e por socorrista, com a tendencia. Base para o dono propor as metas; nao grava nada.';

revoke execute on function public.base_para_metas(integer, date) from public;
revoke execute on function public.base_para_metas(integer, date) from anon;
grant execute on function public.base_para_metas(integer, date) to authenticated;
