-- Lucro por viatura em SQL, com o rateio das despesas gerais.
--
-- O resultado de cada viatura vinha do dashboard_financeiro, mas o rateio das
-- despesas que nao sao de viatura nenhuma (aluguel, contador, sistema) era feito
-- so no frontend (frontend/src/dados/resultadoViaturas.ts). Quem consultasse o
-- banco por fora da tela (relatorio, automacao, assistente) via um resultado
-- maior do que o da tela. Aqui a mesma regra mora no banco, uma vez so.
--
-- Regra (identica a do frontend):
--   despesas gerais = despesas pagas - despesas proprias das viaturas (nunca < 0)
--   rateio          = despesas gerais x receita da viatura / receita da frota
--                     (receita negativa conta como 0; sem receita, divide igual)
--   resultado       = receita - despesas proprias - rateio
--   margem          = resultado / receita x 100 (sem receita, null)
--
-- So le. Quem decide quem pode chamar e o proprio dashboard_financeiro, que
-- exige administrador; esta funcao nao abre nada alem dele.
create or replace function public.lucro_por_viatura_do_dashboard(
    p_dashboard jsonb
) returns table (
    veiculo_id bigint,
    veiculo text,
    receitas numeric,
    despesas_proprias numeric,
    rateio numeric,
    resultado_direto numeric,
    resultado numeric,
    margem numeric,
    km_morto numeric,
    custo_km_morto numeric
)
language sql
stable
set search_path = ''
as $$
    with d as (
        select p_dashboard as j
    ),
    linhas as (
        select (e->>'veiculoId')::bigint as veiculo_id,
               e->>'veiculo' as veiculo,
               coalesce((e->>'receitas')::numeric, 0) as receitas,
               coalesce((e->>'despesas')::numeric, 0) as despesas,
               coalesce((e->>'kmMorto')::numeric, 0) as km_morto,
               coalesce((e->>'custoKmMorto')::numeric, 0) as custo_km_morto
        from d, jsonb_array_elements(d.j->'resultadoPorVeiculo') e
    ),
    totais as (
        select greatest(
                   coalesce((select (j->>'despesasPagas')::numeric from d), 0)
                   - coalesce(sum(despesas), 0), 0) as gerais,
               coalesce(sum(greatest(receitas, 0)), 0) as receita_total,
               count(*) as n
        from linhas
    ),
    calculo as (
        select l.*,
               round(t.gerais * case
                       when t.receita_total > 0 then greatest(l.receitas, 0) / t.receita_total
                       when t.n > 0 then 1.0 / t.n
                       else 0 end, 2) as rateio
        from linhas l cross join totais t
    )
    select c.veiculo_id, c.veiculo, c.receitas, c.despesas, c.rateio,
           c.receitas - c.despesas,
           c.receitas - c.despesas - c.rateio,
           case when c.receitas > 0
                then (c.receitas - c.despesas - c.rateio) / c.receitas * 100 end,
           c.km_morto, c.custo_km_morto
    from calculo c
    order by 7 desc, c.veiculo, c.veiculo_id;
$$;

comment on function public.lucro_por_viatura_do_dashboard(jsonb) is
    'A regra do rateio sobre o JSON de um dashboard_financeiro ja calculado. Existe para quem precisa de varios meses (base_para_metas) calcular o dashboard uma vez so.';
revoke execute on function public.lucro_por_viatura_do_dashboard(jsonb) from public;
revoke execute on function public.lucro_por_viatura_do_dashboard(jsonb) from anon;
grant execute on function public.lucro_por_viatura_do_dashboard(jsonb) to authenticated;

create or replace function public.lucro_por_viatura(
    p_inicio date,
    p_fim date,
    p_por_competencia boolean default true
) returns table (
    veiculo_id bigint,
    veiculo text,
    receitas numeric,
    despesas_proprias numeric,
    rateio numeric,
    resultado_direto numeric,
    resultado numeric,
    margem numeric,
    km_morto numeric,
    custo_km_morto numeric
)
language sql
stable
set search_path = ''
as $$
    select * from public.lucro_por_viatura_do_dashboard(
        public.dashboard_financeiro(p_inicio, p_fim, p_por_competencia));
$$;

comment on function public.lucro_por_viatura(date, date, boolean) is
    'Resultado de cada viatura no periodo, com as despesas gerais rateadas pela receita. Mesma regra da tela da frota.';

revoke execute on function public.lucro_por_viatura(date, date, boolean) from public;
revoke execute on function public.lucro_por_viatura(date, date, boolean) from anon;
grant execute on function public.lucro_por_viatura(date, date, boolean) to authenticated;
