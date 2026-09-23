-- Limpeza: funcoes que ninguem chama mais.
--
-- Levantado em 23/09/2026 no banco de producao (nenhuma outra funcao, gatilho,
-- politica ou view as usa) e no codigo (frontend, backend e Edge Function nao
-- as chamam). Sao do fluxo antigo de comissao por ciclo do calendario, do
-- recebimento manual de OP (a OP ja chega paga) e do Painel Porto, que virou a
-- aba Graficos. Manter so confundia: eram segundas e terceiras implementacoes
-- de regras que hoje tem uma so (comissao_da_os, comissao_das_ops,
-- resumo_comissoes_ops, porto_dashboard_alto_nivel).

-- Comissao por ciclo e repasse manual (antes de a comissao fechar por OP).
drop function if exists public.pagar_comissao(bigint, bigint, date, text, text);
drop function if exists public.detalhe_socorrista(bigint, bigint);
drop function if exists public.resumo_comissoes(bigint, bigint);
drop function if exists public.comissao_do_ciclo(bigint, bigint);

-- Comissao de uma OP so (antes do periodo com varias OPs).
drop function if exists public.pagar_comissao_op(bigint, bigint, date, text, text);
drop function if exists public.detalhe_socorrista_op(bigint, bigint);
drop function if exists public.resumo_comissoes_op(bigint, bigint);
drop function if exists public.comissao_da_op(bigint, bigint);

-- Recebimento manual de OP e rotina de atraso: a OP chega paga.
drop function if exists public.porto_receber_op(bigint, numeric, date, bigint);
drop function if exists public.marcar_atrasos();

-- Rejeitar despesa: a tela de Aprovacoes exclui; ninguem rejeita por RPC.
drop function if exists public.rejeitar_despesa(bigint);

-- Painel Porto antigo: o que ele contava esta em porto_dashboard_alto_nivel.
drop function if exists public.porto_dashboard(date, date);

-- O bloco "porto" do resumo da Visao geral: a tela nunca o leu.
create or replace function public.dashboard_resumo(p_inicio date, p_fim date, p_por_competencia boolean default true)
returns jsonb
language sql stable set search_path = ''
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
        'financeiro', public.dashboard_financeiro(p_inicio, p_fim, p_por_competencia)
            || jsonb_build_object('despesasAcumuladasPorDia', serie.dados)
    )
    from serie
$$;
drop function if exists public.resumo_porto_dashboard(date, date);
