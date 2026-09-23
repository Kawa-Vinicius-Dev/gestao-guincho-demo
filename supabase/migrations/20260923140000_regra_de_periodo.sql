-- Regra de periodo: uma so, para o sistema inteiro.
--
-- Kawa, 23/09/2026 (grill-me): o seletor tem tres modos, e os numeros de todas
-- as telas precisam sair do mesmo recorte.
--
--  - Periodo da OP e Mes: pela competencia. O servico conta na OP em que entrou;
--    o mes junta as competencias que fecham nele, inclusive o que ainda aguarda
--    OP (setembro = 543 servicos, como o faturamento do Painel Porto).
--  - De-ate de ate 8 dias: pela data do servico. Acima disso, pela competencia
--    (a tela avisa). Quem decide o modo e o frontend (utils/modoDoPeriodo.ts);
--    o banco recebe `p_por_competencia` ja resolvido.
--
-- A quinzena comeca na data que a Porto declara (01/09 a 16/09 para as OPs
-- 06438807 e 06438808), e nao no dia seguinte ao fechamento anterior. O servico
-- sem OP de um dia que sobra entre duas quinzenas (29 a 31/08) entra na
-- quinzena seguinte, para nenhum dia ficar sem quinzena.
--
-- Antes daqui eram cinco regras de data espalhadas: a Visao geral contava
-- `coalesce(fim da OP, atendimento)` sem olhar o modo, e um dia filtrado (07/09)
-- mostrava zero servicos e zero receita embora a lista de OS tivesse 26.

-- ------------------------------------------------------------------ quinzenas
-- O inicio de cada quinzena com OP e a primeira data de inicio das OPs dela que
-- nao recua para antes do fechamento anterior; sem nenhuma, o dia seguinte ao
-- fechamento anterior. E a mesma regra que o seletor aplicava em TypeScript
-- (agruparPorPeriodo), agora num lugar so.
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
-- Igual a anterior, com uma mudanca: a OS vai para a primeira competencia que
-- fecha no dia dela ou depois, e nao para a que contem o dia. Com a quinzena
-- declarada ha dias entre uma e outra (29 a 31/08), e a OS desses dias cairia
-- em nenhuma. A OS de uma OP continua na competencia da OP: o fim da OP e o fim
-- (ou esta dentro) da competencia dela.
create or replace function public.porto_os_situacao()
returns table(os_id bigint, competencia_inicio date, competencia_fim date, situacao text,
              sem_valor boolean, valor_previsto numeric, divergencia numeric)
language sql stable security definer set search_path = ''
as $$
    with comp as (
        select * from public.porto_competencias()
    ), base as (
        select os.id, os.valor_total, os.valor_manual, os.ordem_pagamento_id, os.data_atendimento, op.periodo_fim
          from public.ordens_servico_porto os
          left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
         where os.status_operacional::text <> 'CANCELADO'
    ), com_competencia as (
        select b.*, c.inicio as c_inicio, c.fim as c_fim, c.tem_op as c_tem_op
          from base b
          left join lateral (
              select c.inicio, c.fim, c.tem_op from comp c
               where c.fim >= coalesce(b.periodo_fim, b.data_atendimento)
               order by c.fim limit 1
          ) c on true
    )
    select x.id,
           coalesce(p.inicio, x.c_inicio),
           coalesce(p.fim, x.c_fim),
           case when x.ordem_pagamento_id is not null then
                     case when x.valor_manual is not null and abs(x.valor_total - x.valor_manual) >= 0.01
                          then 'DIVERGENTE' else 'CONCILIADA' end
                when x.c_tem_op then 'AGUARDANDO_PROXIMA_OP'
                when x.valor_manual is not null then 'VALOR_MANUAL'
                else 'AGUARDANDO_ANALISE' end,
           x.ordem_pagamento_id is null and x.valor_manual is null,
           case when x.ordem_pagamento_id is not null then x.valor_total else x.valor_manual end,
           case when x.ordem_pagamento_id is not null and x.valor_manual is not null
                then x.valor_total - x.valor_manual end
      from com_competencia x
      left join lateral (
          select c.inicio, c.fim
            from comp c
           where x.ordem_pagamento_id is null and x.c_tem_op
             and c.inicio > x.c_fim and not c.tem_op
           order by c.inicio
           limit 1
      ) p on true
$$;
revoke execute on function public.porto_os_situacao() from public, anon, authenticated;

-- ------------------------------------------------------------------ seletor
-- A lista do seletor de periodo: as quinzenas com OP, com os numeros, e a
-- quinzena em andamento (sem OP ainda). O frontend deixa de agrupar OPs.
create or replace function public.porto_periodos()
returns table(inicio date, fim date, tem_op boolean, op_ids bigint[], op_numeros text[])
language plpgsql stable security definer set search_path = ''
as $$
begin
    perform public.exigir_administrador();
    return query
    select c.inicio, c.fim, c.tem_op, c.op_ids,
           coalesce((select array_agg(op.numero order by op.numero)
                       from public.ordens_pagamento_porto op where op.id = any(c.op_ids)), '{}'::text[])
      from public.porto_competencias() c
     where c.tem_op or c.inicio <= current_date
     order by c.fim desc;
end;
$$;
revoke execute on function public.porto_periodos() from public, anon;
grant execute on function public.porto_periodos() to authenticated;

-- ------------------------------------------------------------------ Visao geral
-- O recorte das OS passa a ser o mesmo da lista de OS (`porto_os_filtradas`), no
-- modo que a tela mandar. A receita de servico segue o mesmo modo: pela data do
-- servico no De-ate curto; pela competencia (a data da receita e o fim da OP)
-- no resto. Receita avulsa (credito da OP, lancamento manual) segue a data dela.
--
-- Duas correcoes que vieram junto, por serem a mesma conta:
--  - OS paga e OS com OP (`ordem_pagamento_id`), e nao `status_financeiro`.
--  - A viatura casa pela sigla da Porto e, sem sigla, pela identificacao.
drop function if exists public.dashboard_resumo(date, date);
drop function if exists public.dashboard_financeiro(date, date);

create or replace function public.dashboard_financeiro(p_inicio date, p_fim date, p_por_competencia boolean default true)
returns jsonb
language plpgsql stable set search_path = ''
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
               case when os.sem_comissao then 0
                    else public.percentual_da_comissao(os.motorista_id, os.ordem_pagamento_id) end as pct
        from public.ordens_servico_porto os
        where os.id in (select public.porto_os_filtradas(p_inicio, p_fim, null, null, null, null, null, null,
                                                         false, p_por_competencia))
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
            coalesce(sum(round(valor_total * pct, 2)) filter (where paga), 0) as comissao_paga,
            coalesce(sum(valor_total) filter (where not paga), 0) as producao_pendente,
            count(*) as servicos_do_periodo,
            count(*) filter (where not paga) as servicos_pendentes
        from oss_periodo
    ),
    comissao_devida as (
        select coalesce(sum(round(os.valor_total * os.pct, 2)), 0) as valor
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
                   sum(round(valor_total * pct, 2)) as comissao
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
revoke execute on function public.dashboard_financeiro(date, date, boolean) from public;
revoke execute on function public.dashboard_financeiro(date, date, boolean) from anon;
grant execute on function public.dashboard_financeiro(date, date, boolean) to authenticated;

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
            || jsonb_build_object('despesasAcumuladasPorDia', serie.dados),
        'porto', public.resumo_porto_dashboard(p_inicio, p_fim)
    )
    from serie
$$;
revoke execute on function public.dashboard_resumo(date, date, boolean) from public;
revoke execute on function public.dashboard_resumo(date, date, boolean) from anon;
grant execute on function public.dashboard_resumo(date, date, boolean) to authenticated;
