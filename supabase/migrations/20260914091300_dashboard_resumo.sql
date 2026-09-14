-- Dashboard numa chamada so, e duas correcoes de calculo.
--
-- A tela abria com duas requisicoes — indicadores financeiros e resumo Porto —
-- que sempre acontecem juntas e sempre no mesmo periodo. Viram uma.
--
-- ---------------------------------------------------------------------------
-- Correcao 1: atraso deixa de depender de alguem ter rodado a rotina
-- ---------------------------------------------------------------------------
-- O Java recalculava o atraso a cada leitura do dashboard
-- (`peek(c -> c.atualizarAtraso(hoje))`) e nunca gravava: o valor era sempre
-- derivado de `vencimento < hoje`. A primeira versao desta RPC leu o status
-- gravado, o que so estaria certo se `marcar_atrasos()` tivesse rodado hoje —
-- e "o total em atraso depende de um agendamento ter passado" e uma resposta
-- errada esperando acontecer. Volta a ser derivado, como era.
--
-- ---------------------------------------------------------------------------
-- Correcao 2: "Programado" passa a significar o que o rotulo diz
-- ---------------------------------------------------------------------------
-- No backend, `valorProgramado` somava as OPs com data de pagamento programada
-- preenchida. Como o proprio filtro do periodo ja exige essa data, o conjunto
-- era o mesmo do total previsto — os dois cartoes mostravam o mesmo numero,
-- embora um diga "Previsto" e o outro "Programado · Ainda nao recebido".
-- Aqui "programado" e o que ainda nao foi recebido, que e o que o rotulo promete
-- e o que `situacao_financeira` ja registra.

create or replace function public.dashboard_financeiro(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_resultado jsonb;
    v_pct numeric := public.percentual_comissao();
begin
    perform public.exigir_administrador();

    with
    receitas_periodo as (
        select r.id, r.valor, r.status, r.veiculo_id
        from public.receitas r
        where r.data_competencia between p_inicio and p_fim
    ),
    -- `em_atraso` e derivado do vencimento, nao do status gravado.
    contas_periodo as (
        select c.valor_previsto, c.status,
               (c.status = 'PENDENTE' and c.vencimento < current_date)
                 or c.status = 'ATRASADO' as em_atraso
        from public.contas_receber c
        where c.data_competencia between p_inicio and p_fim
    ),
    despesas_periodo as (
        select d.id, d.valor, d.status, d.aprovada, d.natureza,
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
        select os.id, os.valor_total, os.status_financeiro, os.status_operacional,
               os.motorista_id, os.ordem_pagamento_id
        from public.ordens_servico_porto os
        where os.data_atendimento between p_inicio and p_fim
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
            coalesce(sum(valor_total) filter (where status_financeiro = 'RECEBIDO'), 0) as producao_paga,
            coalesce(sum(valor_total) filter (
                where status_financeiro <> 'RECEBIDO' and status_operacional <> 'CANCELADO'
            ), 0) as producao_pendente,
            count(*) as servicos_do_periodo,
            count(*) filter (
                where status_financeiro <> 'RECEBIDO' and status_operacional <> 'CANCELADO'
            ) as servicos_pendentes
        from oss_periodo
    ),
    comissao_devida as (
        select coalesce(round(sum(os.valor_total) * v_pct, 2), 0) as valor
        from oss_periodo os
        join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
        where os.status_financeiro = 'RECEBIDO'
          and os.motorista_id is not null
          and op.calendario_pagamento_id is not null
          and not exists (
              select 1 from public.pagamentos_comissao pc
              where pc.motorista_id = os.motorista_id
                and pc.calendario_pagamento_id = op.calendario_pagamento_id
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
            select veiculo_id, sum(valor) as receitas
            from receitas_periodo where status = 'RECEBIDA' and veiculo_id is not null
            group by veiculo_id
        ) r on r.veiculo_id = v.id
        left join (
            select veiculo_id, sum(valor) as despesas
            from despesas_periodo
            where aprovada and status = 'PAGO' and veiculo_id is not null
              and natureza <> 'ALIMENTACAO_FUNCIONARIO'
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
               round(coalesce(s.producao, 0) * v_pct, 2) as comissao,
               coalesce(g.despesas, 0) as despesas,
               round(coalesce(s.producao, 0) * v_pct, 2) + coalesce(g.despesas, 0) as custo_total
        from public.motoristas m
        left join (
            select motorista_id, count(*) as servicos, sum(valor_total) as producao
            from oss_periodo
            where status_financeiro = 'RECEBIDO' and motorista_id is not null
            group by motorista_id
        ) s on s.motorista_id = m.id
        left join (
            select motorista_id, sum(valor) as despesas
            from despesas_periodo
            where aprovada and motorista_id is not null
              and (veiculo_id is null or natureza = 'ALIMENTACAO_FUNCIONARIO')
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
        'comissaoSobreProducao', round(pr.producao_paga * v_pct, 2),
        'producaoPendente', pr.producao_pendente,
        'servicosDoPeriodo', pr.servicos_do_periodo,
        'servicosPendentes', pr.servicos_pendentes,
        'comissaoAPagar', (select valor from comissao_devida),
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

-- ---------------------------------------------------------------------------
-- Resumo Porto para o dashboard
-- ---------------------------------------------------------------------------
-- Tres numeros, nao os vinte e dois do resumo completo.
--
-- O endpoint antigo devolvia o resumo inteiro da conciliacao — sem composicao,
-- conciliadas, valor acima, valor abaixo, vencidas, media por OP — e a tela lia
-- quatro campos. Replicar isso aqui seria trafegar dezoito numeros por
-- carregamento para descartar dezoito. A tela de conciliacao, que usa o resto,
-- tem a consulta dela.

create or replace function public.resumo_porto_dashboard(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v jsonb;
begin
    perform public.exigir_administrador();

    select jsonb_build_object(
        'quantidadeTotalOps', count(*),
        'valorTotalPrevisto', coalesce(sum(valor_total), 0),
        -- Programado e o que ainda nao entrou no banco.
        'valorProgramado', coalesce(sum(valor_total)
            filter (where situacao_financeira <> 'RECEBIDO'), 0),
        -- Recebido usa o valor confirmado, nao o previsto: e a diferenca entre
        -- os dois que a conciliacao existe para explicar.
        'valorRecebido', coalesce(sum(valor_recebido)
            filter (where situacao_financeira = 'RECEBIDO'), 0)
    ) into v
    from public.ordens_pagamento_porto
    where data_pagamento_programada between p_inicio and p_fim;

    return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- A chamada unica da tela
-- ---------------------------------------------------------------------------
-- Os dois blocos sempre sao pedidos juntos e sempre no mesmo periodo. Uma ida.

create or replace function public.dashboard_resumo(p_inicio date, p_fim date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select jsonb_build_object(
        'financeiro', public.dashboard_financeiro(p_inicio, p_fim),
        'porto', public.resumo_porto_dashboard(p_inicio, p_fim)
    )
$$;

revoke execute on function public.resumo_porto_dashboard(date, date) from public;
revoke execute on function public.dashboard_resumo(date, date) from public;
grant execute on function public.resumo_porto_dashboard(date, date) to authenticated;
grant execute on function public.dashboard_resumo(date, date) to authenticated;
