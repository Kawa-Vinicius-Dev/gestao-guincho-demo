-- "OS paga" num lugar so, e a receita das OS canceladas a parte.
--
-- 1. A OS guardava dois campos para o mesmo fato: `status_financeiro` e a
--    ligacao com a OP (`ordem_pagamento_id`). As contas ja usam so a ligacao
--    (20260923160000); este gatilho garante que o status acompanhe sempre, em
--    qualquer gravacao, para uma funcao antiga nunca contar diferente. Nos dados
--    de 23/09/2026 os dois ja batiam (2.727 = 2.727): nada muda.
--
-- 2. Receita de OS cancelada (Kawa, 23/09/2026): tirar a comissao cancela a OS,
--    mas a Porto ja pagou e o dinheiro fica no caixa. A Visao geral passa a dizer
--    esse valor, em vez de ele sobrar sem explicacao entre a receita e as barras.

create or replace function public.os_status_financeiro_pela_op()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.status_financeiro := case when new.ordem_pagamento_id is not null
        then 'RECEBIDO'::public.status_financeiro_porto
        else 'AGUARDANDO_OP'::public.status_financeiro_porto end;
    return new;
end;
$$;

drop trigger if exists oss_porto_status_pela_op on public.ordens_servico_porto;
create trigger oss_porto_status_pela_op
    before insert or update of ordem_pagamento_id, status_financeiro on public.ordens_servico_porto
    for each row execute function public.os_status_financeiro_pela_op();

-- Acerta o que ja estiver fora (nos dados de hoje, nada).
update public.ordens_servico_porto set status_financeiro = status_financeiro
 where status_financeiro is distinct from
       (case when ordem_pagamento_id is not null then 'RECEBIDO' else 'AGUARDANDO_OP' end)::public.status_financeiro_porto;

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
               public.comissao_da_os(os.valor_total, os.motorista_id, os.ordem_pagamento_id, os.sem_comissao) as comissao
        from public.ordens_servico_porto os
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
            coalesce(sum(valor_total) filter (where not paga), 0) as producao_pendente,
            count(*) as servicos_do_periodo,
            count(*) filter (where not paga) as servicos_pendentes
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
