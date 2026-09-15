-- Acrescenta a trajetória diária ao mesmo payload da Visão geral.
--
-- A página continua fazendo uma única RPC. A série usa exatamente o mesmo
-- recorte e a mesma regra do dashboard financeiro atual: despesa lançada no
-- período, aprovada e paga. Dias sem movimento ficam implícitos; o front desenha
-- a linha em degraus entre eles.

create or replace function public.dashboard_resumo(p_inicio date, p_fim date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with valor_por_dia as (
        select d.data_lancamento as data, sum(d.valor) as valor_dia
        from public.despesas d
        where d.data_lancamento between p_inicio and p_fim
          and d.aprovada
          and d.status = 'PAGO'
        group by d.data_lancamento
    ),
    acumulado as (
        select data, valor_dia,
               sum(valor_dia) over (order by data rows unbounded preceding) as total
        from valor_por_dia
    ),
    serie as (
        select coalesce(jsonb_agg(jsonb_build_object(
            'data', data,
            'valorDia', valor_dia,
            'acumulado', total
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
