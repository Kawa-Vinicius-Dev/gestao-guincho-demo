-- Gasto acumulado diz a origem.
--
-- O grafico "ao longo do periodo" mostrava o degrau de R$ 14.166,27 em 29/04 sem
-- dizer o que era. Kawa pediu a origem — no caso, as comissoes que nascem no fim
-- da OP. Cada dia da serie passa a levar quanto veio de cada categoria, da maior
-- para a menor. O valor do dia e o acumulado nao mudam.
create or replace function public.dashboard_resumo(p_inicio date, p_fim date)
returns jsonb
language sql
stable
set search_path = ''
as $$
    with por_categoria as (
        select d.data_lancamento as data, c.nome as categoria, sum(d.valor) as valor
        from public.despesas d
        join public.categorias c on c.id = d.categoria_id
        where d.data_lancamento between p_inicio and p_fim
          and d.aprovada
          and d.status = 'PAGO'
        group by d.data_lancamento, c.nome
    ),
    valor_por_dia as (
        select data, sum(valor) as valor_dia,
               jsonb_agg(jsonb_build_object('categoria', categoria, 'valor', valor)
                         order by valor desc, categoria) as origens
        from por_categoria
        group by data
    ),
    acumulado as (
        select data, valor_dia, origens,
               sum(valor_dia) over (order by data rows unbounded preceding) as total
        from valor_por_dia
    ),
    serie as (
        select coalesce(jsonb_agg(jsonb_build_object(
            'data', data,
            'valorDia', valor_dia,
            'acumulado', total,
            'origens', origens
        ) order by data), '[]'::jsonb) as dados
        from acumulado
    )
    select jsonb_build_object(
        'financeiro', public.dashboard_financeiro(p_inicio, p_fim)
            || jsonb_build_object('despesasAcumuladasPorDia', serie.dados),
        'porto', public.resumo_porto_dashboard(p_inicio, p_fim)
    )
    from serie
$$;

revoke execute on function public.dashboard_resumo(date, date) from public;
grant execute on function public.dashboard_resumo(date, date) to authenticated;
