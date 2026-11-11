-- Qual mes parece incompleto. Serve para quem le a base das metas nao confundir
-- "ainda nao entrou" com "caiu".
--
-- A producao da Porto so entra quando a OP e paga/importada. Enquanto isso o mes
-- parece ter caido: a despesa ja saiu inteira e a receita so em parte, e o lucro
-- por viatura despenca sem que nada tenha piorado. O banco nao sabe o que falta
-- importar, entao compara o que viu: um mes com bem menos servicos que os outros
-- da janela e marcado como parcial.
--
-- Regra: parcial = servicos do mes < p_limite x media dos servicos dos OUTROS
-- meses da janela (padrao 0,80). Sem outros meses, nao ha como comparar: false.
-- E um sinal, nao uma prova: um mes realmente fraco tambem aparece como parcial.
create or replace function public.qualidade_dos_meses(
    p_meses integer default 4,
    p_referencia date default (now() at time zone 'America/Sao_Paulo')::date,
    p_limite numeric default 0.80
) returns table (
    mes text,
    servicos integer,
    media_dos_outros numeric,
    pct_dos_outros numeric,
    parcial boolean
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
        select (date_trunc('month', p_referencia) - make_interval(months => g))::date as ini,
               (date_trunc('month', p_referencia) - make_interval(months => g - 1))::date - 1 as fim
        from generate_series(1, p_meses) g
    ),
    contagem as (
        select m.ini,
               (public.dashboard_financeiro(m.ini, m.fim)->>'servicosDoPeriodo')::integer as n
        from meses m
    ),
    comparado as (
        select c.ini, c.n,
               (select avg(o.n) from contagem o where o.ini <> c.ini) as outros
        from contagem c
    )
    select to_char(c.ini, 'YYYY-MM'), c.n,
           round(c.outros, 2),
           case when c.outros > 0 then round(c.n / c.outros * 100, 2) end,
           coalesce(c.outros > 0 and c.n < p_limite * c.outros, false)
    from comparado c
    order by c.ini desc;
end;
$$;

comment on function public.qualidade_dos_meses(integer, date, numeric) is
    'Marca como parcial o mes com bem menos servicos que os outros da janela. Sinal de que falta importar OP, nao prova.';

revoke execute on function public.qualidade_dos_meses(integer, date, numeric) from public;
revoke execute on function public.qualidade_dos_meses(integer, date, numeric) from anon;
grant execute on function public.qualidade_dos_meses(integer, date, numeric) to authenticated;
