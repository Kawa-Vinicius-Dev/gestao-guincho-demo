-- Consultas agregadas.
--
-- O dashboard antigo carregava contas, receitas, despesas, quilometragens e OSs do
-- periodo inteiro para a memoria do Java e somava com streams — inclusive um laco
-- por veiculo que percorria todas as colecoes de novo. Aqui e uma chamada, uma
-- passada por tabela, e o que trafega e o resultado, nao as linhas.
--
-- Todas sao STABLE e SECURITY INVOKER: o RLS de quem chama continua valendo, e o
-- guarda explicito no inicio existe para a tela receber um erro claro em vez de
-- uma soma silenciosamente zerada.

-- Percentual da comissao do socorrista.
--
-- Estava escrito em dois lugares no Java (ComissaoService e DashboardService) com
-- um comentario pedindo que nao divergissem. Se divergissem, o dashboard e a tela
-- de comissao passariam a discordar sobre dinheiro. Agora e um so.
create or replace function public.percentual_comissao()
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
    select 0.20::numeric
$$;

create or replace function public.exigir_administrador()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
    if not public.e_administrador() then
        raise exception 'Acesso restrito ao administrador.'
            using errcode = 'insufficient_privilege';
    end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard financeiro
-- ---------------------------------------------------------------------------
-- Devolve exatamente o formato que a tela ja consome (Dashboard em
-- types/modelos.ts), em camelCase, para a migracao do frontend nao mexer na tela.

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
    -- Uma passada por tabela; tudo o que vem depois le destes recortes.
    receitas_periodo as (
        select r.id, r.valor, r.status, r.veiculo_id
        from public.receitas r
        where r.data_competencia between p_inicio and p_fim
    ),
    contas_periodo as (
        select c.valor_previsto, c.status
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
    -- Totais de caixa
    totais as (
        select
            coalesce((select sum(valor) from receitas_periodo where status = 'RECEBIDA'), 0) as receita_recebida,
            coalesce((select sum(valor_previsto) from contas_periodo
                      where status in ('PENDENTE', 'ATRASADO')), 0)
              + coalesce((select sum(valor) from receitas_periodo where status = 'PREVISTA'), 0) as receita_prevista,
            coalesce((select sum(valor_previsto) from contas_periodo where status = 'ATRASADO'), 0) as total_atrasado,
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
    -- Producao Porto. Nao entra no saldo: a receita do servico ja esta em
    -- receita_recebida (o pipeline cria a Receita) e a comissao vira despesa
    -- quando paga. Somar de novo contaria duas vezes.
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
    -- Comissao ainda devida. Nao da para subtrair "pago no periodo" da "produzida
    -- no periodo": producao conta pela data do atendimento e repasse pela data do
    -- pagamento, entao comissao de agosto paga em setembro nao bate em recorte
    -- nenhum. A pergunta e feita servico a servico: o ciclo que pagou esta OS ja
    -- teve repasse para este socorrista?
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
        from public.importacoes_porto
        where status = 'CONFIRMADA'
    ),
    -- Resultado por viatura. Alimentacao do socorrista fica de fora: e custo da
    -- pessoa, nao da viatura, mesmo quando a viatura foi anotada no lancamento.
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
        -- Viatura sem movimento no periodo nao ocupa linha na tela.
        where coalesce(r.receitas, 0) <> 0 or coalesce(d.despesas, 0) <> 0
           or coalesce(k.km_morto, 0) <> 0
        order by v.identificacao
    ),
    -- Custo por socorrista: a comissao dele mais as despesas que sao DELE.
    -- Combustivel do L168 abastecido pelo socorrista e custo do L168, nao da
    -- pessoa — senao o mesmo gasto apareceria nos dois lugares. Fica com a pessoa
    -- so o que nao tem viatura, mais a alimentacao, que e dela mesmo com viatura.
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
              -- O repasse da comissao ja e a comissao; conta-lo como despesa da
              -- pessoa somaria o mesmo valor duas vezes no custo dela.
              and (protocolo is null or protocolo not like 'COMISSAO-%')
            group by motorista_id
        ) g on g.motorista_id = m.id
        where coalesce(s.servicos, 0) > 0 or coalesce(g.despesas, 0) <> 0
        order by m.nome
    ),
    -- Para onde o dinheiro foi: mesma base de "despesas pagas", quebrada por
    -- categoria e ja ordenada, porque a tela destaca a maior.
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

comment on function public.dashboard_financeiro(date, date) is
    'Indicadores do periodo no formato que a Visao geral, a DRE e a tela de Frotas consomem.';

-- ---------------------------------------------------------------------------
-- Extrato unificado
-- ---------------------------------------------------------------------------
-- Receita e despesa na mesma lista, ordenadas por data. Era um merge em Java sobre
-- duas listas carregadas inteiras.

create or replace function public.extrato_financeiro(p_inicio date, p_fim date)
returns table (
    id text,
    tipo text,
    referencia_id bigint,
    descricao text,
    categoria text,
    valor numeric,
    data date,
    status text,
    realizado boolean,
    veiculo text,
    veiculo_id bigint,
    motorista text,
    origem text,
    protocolo text
)
language sql
stable
security invoker
set search_path = ''
as $$
    select 'R' || r.id::text, 'RECEITA', r.id, r.descricao,
           coalesce(c.nome, 'Sem categoria'), r.valor, r.data_competencia,
           r.status::text, r.status = 'RECEBIDA', v.identificacao, r.veiculo_id,
           m.nome, case when r.manual then 'MANUAL' else 'IMPORTADA' end, null::text
    from public.receitas r
    left join public.categorias c on c.id = r.categoria_id
    left join public.veiculos v on v.id = r.veiculo_id
    left join public.motoristas m on m.id = r.motorista_id
    where r.data_competencia between p_inicio and p_fim
      and public.e_administrador()

    union all

    select 'D' || d.id::text, 'DESPESA', d.id, d.descricao,
           c.nome, d.valor, d.data_lancamento,
           d.status::text, d.status = 'PAGO', v.identificacao, d.veiculo_id,
           m.nome, case when d.despesa_recorrente_id is null then 'MANUAL' else 'RECORRENTE' end,
           d.protocolo
    from public.despesas d
    join public.categorias c on c.id = d.categoria_id
    left join public.veiculos v on v.id = d.veiculo_id
    left join public.motoristas m on m.id = d.motorista_id
    where d.data_lancamento between p_inicio and p_fim
      and public.e_administrador()

    order by 7 desc, 1
$$;

-- ---------------------------------------------------------------------------
-- Comissao do ciclo
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER, ao contrario das anteriores, e de proposito: o socorrista
-- precisa ver o numero da OP que pagou cada servico dele, e OP e tabela de
-- administrador. Em vez de abrir `ordens_pagamento_porto` para todo mundo — o que
-- exporia o caixa inteiro da Porto —, a funcao le por eles e devolve so as linhas
-- do proprio motorista. O guarda logo abaixo e o que torna isso seguro: sem ele,
-- definer viraria um buraco por onde qualquer um leria a comissao de qualquer um.

create or replace function public.comissao_do_ciclo(
    p_calendario_id bigint,
    p_motorista_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_motorista bigint;
    v_resultado jsonb;
    v_pct numeric := public.percentual_comissao();
begin
    -- Administrador escolhe de quem; socorrista so pode ser de si mesmo.
    if public.e_administrador() then
        v_motorista := coalesce(p_motorista_id, public.motorista_atual());
    else
        v_motorista := public.motorista_atual();
        if v_motorista is null then
            raise exception 'Seu usuario ainda nao esta vinculado a um socorrista.'
                using errcode = 'insufficient_privilege';
        end if;
        if p_motorista_id is not null and p_motorista_id <> v_motorista then
            raise exception 'Voce so pode consultar a propria comissao.'
                using errcode = 'insufficient_privilege';
        end if;
    end if;

    if v_motorista is null then
        raise exception 'Informe o socorrista.' using errcode = 'invalid_parameter_value';
    end if;

    with ciclo as (
        select id, descricao, data_pagamento, competencia_inicio, competencia_fim
        from public.calendario_pagamentos_porto where id = p_calendario_id
    ),
    -- Os servicos do ciclo sao os que a OP daquele ciclo pagou — nao os atendidos
    -- no intervalo. Um servico de agosto pago no ciclo de setembro e comissao de
    -- setembro, que e quando o dinheiro entrou.
    servicos as (
        select os.id, os.numero, os.especialidade, os.data_atendimento,
               op.numero as numero_op, os.valor_total,
               round(os.valor_total * v_pct, 2) as comissao_servico
        from public.ordens_servico_porto os
        join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
        where os.motorista_id = v_motorista
          and os.status_financeiro = 'RECEBIDO'
          and op.calendario_pagamento_id = p_calendario_id
        order by os.data_atendimento, os.numero
    ),
    alimentacoes as (
        select d.id, d.data_lancamento, d.valor, d.aprovada, d.status, d.observacoes
        from public.despesas d
        where d.motorista_id = v_motorista
          and d.natureza = 'ALIMENTACAO_FUNCIONARIO'
          and d.status <> 'REJEITADO'
          and d.data_lancamento between
              (select coalesce(competencia_inicio, data_pagamento) from ciclo)
              and (select coalesce(competencia_fim, data_pagamento) from ciclo)
    ),
    pagamento as (
        select pc.id, pc.valor_pago, pc.data_pagamento, pc.forma_pagamento,
               pc.observacoes, pc.despesa_id, p.nome as pago_por, pc.criado_em
        from public.pagamentos_comissao pc
        join public.perfis p on p.id = pc.pago_por
        where pc.motorista_id = v_motorista and pc.calendario_pagamento_id = p_calendario_id
    ),
    somas as (
        select coalesce((select sum(valor_total) from servicos), 0) as producao,
               coalesce((select count(*) from servicos), 0) as quantidade,
               coalesce((select sum(valor) from alimentacoes where aprovada), 0) as alim_aprovada,
               coalesce((select sum(valor) from alimentacoes where not aprovada), 0) as alim_pendente
    )
    select jsonb_build_object(
        'calendarioPagamentoId', p_calendario_id,
        'periodo', (select descricao from ciclo),
        'motoristaId', v_motorista,
        'socorrista', (select nome from public.motoristas where id = v_motorista),
        'quantidadeServicosPagos', s.quantidade,
        'producaoPaga', s.producao,
        'percentualComissao', v_pct,
        'comissaoBruta', round(s.producao * v_pct, 2),
        'alimentacaoAprovada', s.alim_aprovada,
        'alimentacaoPendente', s.alim_pendente,
        'liquido', round(s.producao * v_pct, 2) - s.alim_aprovada,
        'aguardandoOp', s.quantidade = 0,
        'servicos', coalesce((select jsonb_agg(jsonb_build_object(
            'id', id, 'numeroOs', numero, 'especialidade', especialidade,
            'dataAtendimento', data_atendimento, 'numeroOp', numero_op,
            'valorServico', valor_total, 'comissaoServico', comissao_servico))
            from servicos), '[]'::jsonb),
        'alimentacoes', coalesce((select jsonb_agg(jsonb_build_object(
            'id', id, 'motoristaId', v_motorista, 'data', data_lancamento,
            'valor', valor, 'aprovada', aprovada, 'situacao', status::text,
            'observacoes', observacoes))
            from alimentacoes), '[]'::jsonb),
        'pagamento', (select to_jsonb(p) from pagamento p)
    ) into v_resultado
    from somas s;

    return v_resultado;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissoes de execucao
-- ---------------------------------------------------------------------------
-- Por padrao o Postgres concede EXECUTE a PUBLIC. Revogar e conceder nominalmente
-- deixa explicito quem pode chamar o que — e mantem `anon` fora de tudo.

revoke execute on function public.dashboard_financeiro(date, date) from public;
revoke execute on function public.extrato_financeiro(date, date) from public;
revoke execute on function public.comissao_do_ciclo(bigint, bigint) from public;

grant execute on function public.dashboard_financeiro(date, date) to authenticated;
grant execute on function public.extrato_financeiro(date, date) to authenticated;
grant execute on function public.comissao_do_ciclo(bigint, bigint) to authenticated;
