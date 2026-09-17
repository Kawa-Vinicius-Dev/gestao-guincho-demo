-- Comissao automatica, periodo da OP sem sobreposicao, desconto marcado e valor
-- pago pela Porto. Regras definidas pelo Kawa em 16/09/2026.
--
-- 1. "Eu nao quero clicar para confirmar pagamento para depois aparecer no
--    dashboard." A comissao de cada socorrista vira despesa paga sozinha, com
--    data no fim do periodo da OP, e se recalcula quando uma OS ganha socorrista,
--    muda de valor ou entra um gasto marcado. Nao existe mais "pagar comissao".
--
-- 2. Nenhuma categoria desconta sozinha. O tio paga a alimentacao da equipe; o
--    que desconta e o gasto que o socorrista pediu para tirar do bolso dele (as
--    vezes ele passa algo pessoal no cartao da viatura). Esse gasto e marcado com
--    `desconta_comissao`, seja de qual categoria for.
--
-- 3. A OP da Porto e quinzenal. O periodo ia da primeira a ultima OS, e uma OS
--    atrasada esticava o periodo da OP seguinte para tras: as duas se sobrepunham
--    e o mesmo gasto descontava duas vezes. Agora o periodo comeca no dia seguinte
--    ao fim da OP anterior e termina na ultima OS. Na primeira OP, comeca na
--    primeira OS.
--
-- 4. A Porto informa o valor pago da OP separado das OS. Normalmente e a soma;
--    quando vier diferente, o valor informado vira o valor da OP e a divergencia
--    aparece. A receita continua sendo servico por servico.

-- ---------------------------------------------------------------- colunas
alter table public.despesas
    add column if not exists desconta_comissao boolean not null default false;
comment on column public.despesas.desconta_comissao is
    'Gasto pessoal do socorrista que sai da comissao dele. Nenhuma categoria marca sozinha.';
grant insert (desconta_comissao), update (desconta_comissao) on public.despesas to authenticated;

alter table public.ordens_pagamento_porto
    add column if not exists valor_pago_porto numeric(12, 2)
        check (valor_pago_porto is null or valor_pago_porto > 0);
comment on column public.ordens_pagamento_porto.valor_pago_porto is
    'Valor que a Porto informou ter pago. Vazio: vale a soma das OS.';

-- ---------------------------------------------------------------- periodo da OP
create or replace function public.porto_recalcular_periodos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    with datas as (
        select os.ordem_pagamento_id as id,
               min(os.data_atendimento) as primeira,
               max(os.data_atendimento) as ultima
        from public.ordens_servico_porto os
        where os.ordem_pagamento_id is not null and os.data_atendimento is not null
        group by os.ordem_pagamento_id
    ),
    ordenadas as (
        select id, primeira, ultima,
               lag(ultima) over (order by ultima, id) as fim_anterior
        from datas
    )
    update public.ordens_pagamento_porto op
       set periodo_fim = o.ultima,
           -- OS mais antiga que o fim da OP anterior e atrasada: entra na OP,
           -- mas nao estica o periodo para dentro da quinzena que ja fechou.
           periodo_inicio = case when o.fim_anterior is null then o.primeira
                                 else least(o.fim_anterior + 1, o.ultima) end
      from ordenadas o
     where o.id = op.id
       and (op.periodo_fim is distinct from o.ultima
            or op.periodo_inicio is distinct from
               case when o.fim_anterior is null then o.primeira
                    else least(o.fim_anterior + 1, o.ultima) end);
end;
$$;
revoke execute on function public.porto_recalcular_periodos() from public, anon, authenticated;

create or replace function public.porto_fechar_op(p_op_id bigint)
returns public.ordens_pagamento_porto
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_op public.ordens_pagamento_porto;
    v_soma numeric;
    v_ref date;
begin
    select coalesce(sum(valor_total), 0) into v_soma
      from public.ordens_servico_porto where ordem_pagamento_id = p_op_id;

    perform public.porto_recalcular_periodos();

    update public.ordens_pagamento_porto
       set valor_total = coalesce(valor_pago_porto, v_soma),
           valor_recebido = coalesce(valor_pago_porto, v_soma),
           data_pagamento_programada = coalesce(data_pagamento_programada, periodo_fim, current_date),
           data_recebimento = coalesce(data_recebimento, periodo_fim, current_date),
           situacao_financeira = 'RECEBIDO'
     where id = p_op_id
    returning * into v_op;

    v_ref := coalesce(v_op.periodo_fim, v_op.data_pagamento_programada, current_date);

    update public.ordens_servico_porto
       set status_financeiro = 'RECEBIDO', data_efetiva_pagamento = v_ref
     where ordem_pagamento_id = p_op_id and status_operacional <> 'CANCELADO';

    update public.contas_receber
       set data_competencia = v_ref, vencimento = v_ref, data_recebimento = v_ref
     where ordem_pagamento_porto_id = p_op_id;

    update public.receitas
       set data_competencia = v_ref, data_recebimento = v_ref
     where ordem_pagamento_porto_id = p_op_id;

    return v_op;
end;
$$;
revoke execute on function public.porto_fechar_op(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------- comissao automatica
create or replace function public.porto_sincronizar_comissoes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_pct numeric := public.percentual_comissao();
    v_categoria bigint;
    v_quem uuid;
    v_despesa bigint;
    r record;
begin
    -- A propria sincronizacao escreve em despesas; o gatilho de despesas nao pode
    -- chamar outra sincronizacao no meio desta.
    perform set_config('fluxo.sincronizando_comissoes', 'on', true);

    select id into v_categoria from public.categorias
     where tipo = 'DESPESA'
       and lower(btrim(nome)) in ('comissão de socorrista', 'comissao de socorrista')
     order by id limit 1;
    if v_categoria is null then
        insert into public.categorias (nome, tipo) values ('Comissão de socorrista', 'DESPESA')
        returning id into v_categoria;
    end if;

    -- Quem lancou: o usuario da acao que disparou; sem usuario (migracao), o
    -- primeiro administrador.
    v_quem := coalesce((select auth.uid()),
        (select p.id from public.perfis p where p.perfil = 'ADMINISTRADOR' order by p.criado_em limit 1));

    for r in
        with devidas as (
            select op.id as op_id, op.numero, op.periodo_inicio, op.periodo_fim,
                   os.motorista_id, round(sum(os.valor_total) * v_pct, 2) as bruta
            from public.ordens_pagamento_porto op
            join public.ordens_servico_porto os on os.ordem_pagamento_id = op.id
            where os.motorista_id is not null
              and os.status_operacional <> 'CANCELADO'
              and op.periodo_fim is not null
            group by op.id, op.numero, op.periodo_inicio, op.periodo_fim, os.motorista_id
        ),
        liquidas as (
            select dv.*,
                   dv.bruta - coalesce((
                       select sum(d.valor) from public.despesas d
                       where d.motorista_id = dv.motorista_id
                         and d.desconta_comissao and d.aprovada
                         and d.status <> 'REJEITADO'
                         and (d.protocolo is null or d.protocolo not like 'COMISSAO-%')
                         and d.data_lancamento between coalesce(dv.periodo_inicio, dv.periodo_fim)
                                                   and dv.periodo_fim), 0) as liquido
            from devidas dv
        ),
        existentes as (
            select pc.ordem_pagamento_id as op_id, pc.motorista_id, pc.despesa_id
            from public.pagamentos_comissao pc
            where pc.ordem_pagamento_id is not null
        )
        select coalesce(l.op_id, e.op_id) as op_id,
               coalesce(l.motorista_id, e.motorista_id) as motorista_id,
               l.numero, l.periodo_fim, l.liquido, e.despesa_id
        from liquidas l
        full join existentes e on e.op_id = l.op_id and e.motorista_id = l.motorista_id
    loop
        if r.liquido is null or r.liquido <= 0 then
            -- Sem servico ou com desconto maior que a comissao: nao ha despesa.
            if r.despesa_id is not null then
                delete from public.pagamentos_comissao
                 where ordem_pagamento_id = r.op_id and motorista_id = r.motorista_id;
                delete from public.despesas where id = r.despesa_id;
            end if;
        elsif r.despesa_id is null then
            insert into public.despesas (
                descricao, categoria_id, valor, data_lancamento, data_pagamento,
                motorista_id, protocolo, status, aprovada, aprovado_por, aprovado_em,
                criado_por, natureza)
            values (
                'Comissão de socorrista — OP ' || r.numero, v_categoria, r.liquido,
                r.periodo_fim, r.periodo_fim, r.motorista_id,
                'COMISSAO-OP-' || r.op_id::text || '-' || r.motorista_id::text,
                'PAGO', true, v_quem, now(), v_quem, 'GERAL')
            returning id into v_despesa;

            insert into public.pagamentos_comissao (
                motorista_id, ordem_pagamento_id, despesa_id, valor_pago, data_pagamento, pago_por)
            values (r.motorista_id, r.op_id, v_despesa, r.liquido, r.periodo_fim, v_quem);
        else
            update public.despesas
               set valor = r.liquido, data_lancamento = r.periodo_fim,
                   data_pagamento = r.periodo_fim,
                   descricao = 'Comissão de socorrista — OP ' || r.numero
             where id = r.despesa_id
               and (valor is distinct from r.liquido or data_lancamento is distinct from r.periodo_fim);
            update public.pagamentos_comissao
               set valor_pago = r.liquido, data_pagamento = r.periodo_fim
             where despesa_id = r.despesa_id
               and (valor_pago is distinct from r.liquido or data_pagamento is distinct from r.periodo_fim);
        end if;
    end loop;

    perform set_config('fluxo.sincronizando_comissoes', 'off', true);
end;
$$;
revoke execute on function public.porto_sincronizar_comissoes() from public, anon, authenticated;

-- Todo caminho que mexe em despesa (formulario, aprovacao, pagamento, exclusao,
-- lancamento do socorrista) recalcula a comissao: um gasto marcado muda o
-- liquido na hora, sem ninguem precisar lembrar.
create or replace function public.despesas_sincronizam_comissao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if coalesce(current_setting('fluxo.sincronizando_comissoes', true), 'off') = 'on' then
        return null;
    end if;
    perform public.porto_sincronizar_comissoes();
    return null;
end;
$$;
revoke execute on function public.despesas_sincronizam_comissao() from public, anon, authenticated;

drop trigger if exists despesas_sincronizam_comissao on public.despesas;
create trigger despesas_sincronizam_comissao
    after insert or update or delete on public.despesas
    for each statement execute function public.despesas_sincronizam_comissao();

-- Pagar comissao a mao deixa de existir.
revoke execute on function public.pagar_comissao_op(bigint, bigint, date, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- leitura da comissao
create or replace function public.comissao_da_op(p_op_id bigint, p_motorista_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_motorista bigint;
    v_op public.ordens_pagamento_porto;
    v_resultado jsonb;
    v_pct numeric := public.percentual_comissao();
    v_ini date; v_fim date;
begin
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

    select * into v_op from public.ordens_pagamento_porto where id = p_op_id;
    if not found then
        raise exception 'Ordem de pagamento nao encontrada.' using errcode = 'no_data_found';
    end if;

    v_ini := coalesce(v_op.periodo_inicio, v_op.data_pagamento_programada);
    v_fim := coalesce(v_op.periodo_fim, v_op.data_pagamento_programada);

    with servicos as (
        select os.id, os.numero, os.especialidade, os.data_atendimento,
               os.valor_total, round(os.valor_total * v_pct, 2) as comissao_servico
        from public.ordens_servico_porto os
        where os.ordem_pagamento_id = p_op_id
          and os.motorista_id = v_motorista
          and os.status_operacional <> 'CANCELADO'
        order by os.data_atendimento, os.numero
    ),
    -- Todo gasto ligado ao socorrista no periodo da OP. So o marcado desconta.
    gastos as (
        select d.id, d.descricao, d.data_lancamento, d.valor, d.aprovada, d.status,
               d.observacoes, d.desconta_comissao, c.nome as categoria, v.identificacao as veiculo
        from public.despesas d
        join public.categorias c on c.id = d.categoria_id
        left join public.veiculos v on v.id = d.veiculo_id
        where d.motorista_id = v_motorista
          and d.status <> 'REJEITADO'
          and (d.protocolo is null or d.protocolo not like 'COMISSAO-%')
          and v_ini is not null and v_fim is not null
          and d.data_lancamento between v_ini and v_fim
    ),
    pagamento as (
        select pc.id, pc.valor_pago, pc.data_pagamento, pc.forma_pagamento,
               pc.observacoes, pc.despesa_id, p.nome as pago_por, pc.criado_em
        from public.pagamentos_comissao pc
        left join public.perfis p on p.id = pc.pago_por
        where pc.motorista_id = v_motorista and pc.ordem_pagamento_id = p_op_id
    ),
    somas as (
        select coalesce((select sum(valor_total) from servicos), 0) as producao,
               coalesce((select count(*) from servicos), 0) as quantidade,
               coalesce((select sum(valor) from gastos where desconta_comissao and aprovada), 0) as descontos,
               coalesce((select sum(valor) from gastos where desconta_comissao and not aprovada), 0) as descontos_pendentes
    )
    select jsonb_build_object(
        'ordemPagamentoId', p_op_id,
        'numeroOp', v_op.numero,
        'periodo', 'OP ' || v_op.numero
            || coalesce(' · ' || to_char(v_ini, 'DD/MM') || ' a ' || to_char(v_fim, 'DD/MM'), ''),
        'periodoInicio', v_ini,
        'periodoFim', v_fim,
        'motoristaId', v_motorista,
        'socorrista', (select nome from public.motoristas where id = v_motorista),
        'quantidadeServicosPagos', s.quantidade,
        'producaoPaga', s.producao,
        'percentualComissao', v_pct,
        'comissaoBruta', round(s.producao * v_pct, 2),
        'descontos', s.descontos,
        'descontosPendentes', s.descontos_pendentes,
        'liquido', round(s.producao * v_pct, 2) - s.descontos,
        'aguardandoOp', s.quantidade = 0,
        'servicos', coalesce((select jsonb_agg(jsonb_build_object(
            'id', id, 'numeroOs', numero, 'especialidade', especialidade,
            'dataAtendimento', data_atendimento, 'numeroOp', v_op.numero,
            'valorServico', valor_total, 'comissaoServico', comissao_servico))
            from servicos), '[]'::jsonb),
        'gastos', coalesce((select jsonb_agg(jsonb_build_object(
            'id', id, 'descricao', descricao, 'data', data_lancamento, 'valor', valor,
            'categoria', categoria, 'veiculo', veiculo, 'situacao', status::text,
            'aprovada', aprovada, 'descontaDaComissao', desconta_comissao,
            'observacoes', observacoes) order by data_lancamento desc, id desc)
            from gastos), '[]'::jsonb),
        'pagamento', (select to_jsonb(p) from pagamento p)
    ) into v_resultado
    from somas s;

    return v_resultado;
end;
$$;

create or replace function public.resumo_comissoes_op(p_op_id bigint, p_motorista_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb; v_pct numeric := public.percentual_comissao();
        v_ini date; v_fim date;
begin
    perform public.exigir_administrador();

    select coalesce(periodo_inicio, data_pagamento_programada),
           coalesce(periodo_fim, data_pagamento_programada)
      into v_ini, v_fim
      from public.ordens_pagamento_porto where id = p_op_id;

    with servicos as (
        select os.motorista_id, count(*) as qtd, sum(os.valor_total) as producao
        from public.ordens_servico_porto os
        where os.ordem_pagamento_id = p_op_id
          and os.motorista_id is not null
          and os.status_operacional <> 'CANCELADO'
          and (p_motorista_id is null or os.motorista_id = p_motorista_id)
        group by os.motorista_id
    ),
    descontos as (
        select d.motorista_id, sum(d.valor) as aprovado
        from public.despesas d
        where d.desconta_comissao and d.aprovada
          and d.status <> 'REJEITADO'
          and (d.protocolo is null or d.protocolo not like 'COMISSAO-%')
          and v_ini is not null and v_fim is not null
          and d.data_lancamento between v_ini and v_fim
          and d.motorista_id is not null
        group by d.motorista_id
    ),
    pagamento as (
        select pc.motorista_id, pc.id, pc.valor_pago, pc.data_pagamento,
               pc.forma_pagamento, pc.observacoes, pc.despesa_id, pc.criado_em
        from public.pagamentos_comissao pc
        where pc.ordem_pagamento_id = p_op_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'motoristaId', m.id,
        'socorrista', m.nome,
        'quantidadeServicosPagos', coalesce(s.qtd, 0),
        'producaoPaga', coalesce(s.producao, 0),
        'comissaoBruta', round(coalesce(s.producao, 0) * v_pct, 2),
        'descontos', coalesce(a.aprovado, 0),
        'liquido', round(coalesce(s.producao, 0) * v_pct, 2) - coalesce(a.aprovado, 0),
        'pagamento', case when p.id is null then null else jsonb_build_object(
            'id', p.id, 'motoristaId', m.id, 'ordemPagamentoId', p_op_id,
            'despesaId', p.despesa_id, 'valorPago', p.valor_pago,
            'dataPagamento', p.data_pagamento, 'formaPagamento', p.forma_pagamento,
            'observacoes', p.observacoes, 'pagoPor', '', 'criadoEm', p.criado_em) end
    ) order by m.nome), '[]'::jsonb) into v
    from public.motoristas m
    left join servicos s on s.motorista_id = m.id
    left join descontos a on a.motorista_id = m.id
    left join pagamento p on p.motorista_id = m.id
    where (p_motorista_id is null or m.id = p_motorista_id)
      and (coalesce(s.qtd, 0) > 0 or p.id is not null);

    return v;
end;
$$;

-- ---------------------------------------------------------------- emendas
do $$
declare v_def text; v_antes text; v_depois text;
begin
    -- Detalhe do socorrista: a marca do gasto decide o desconto, nao a categoria.
    select pg_get_functiondef('public.detalhe_socorrista_op'::regproc) into v_def;
    v_antes := '''descontaDaComissao'', d.natureza = ''ALIMENTACAO_FUNCIONARIO''';
    if position(v_antes in v_def) = 0 then raise exception 'detalhe_socorrista_op: marca nao encontrada'; end if;
    execute replace(v_def, v_antes, '''descontaDaComissao'', d.desconta_comissao');

    -- Visao geral: gasto marcado e do socorrista, nao da viatura em que foi passado.
    select pg_get_functiondef('public.dashboard_financeiro'::regproc) into v_def;
    v_antes := 'select d.id, d.valor, d.status, d.aprovada, d.natureza,';
    if position(v_antes in v_def) = 0 then raise exception 'dashboard_financeiro: despesas_periodo'; end if;
    v_def := replace(v_def, v_antes, 'select d.id, d.valor, d.status, d.aprovada, d.natureza, d.desconta_comissao,');
    v_antes := 'and natureza <> ''ALIMENTACAO_FUNCIONARIO''';
    if position(v_antes in v_def) = 0 then raise exception 'dashboard_financeiro: viatura'; end if;
    v_def := replace(v_def, v_antes, 'and not desconta_comissao');
    v_antes := '(veiculo_id is null or natureza = ''ALIMENTACAO_FUNCIONARIO'')';
    if position(v_antes in v_def) = 0 then raise exception 'dashboard_financeiro: socorrista'; end if;
    execute replace(v_def, v_antes, '(veiculo_id is null or desconta_comissao)');

    -- Pendencias resolvidas mudam o dono da OS: a comissao acompanha.
    select pg_get_functiondef('public.porto_resolver_pendencias'::regproc) into v_def;
    v_antes := '    return v_total;';
    if position(v_antes in v_def) = 0 then raise exception 'porto_resolver_pendencias: retorno'; end if;
    execute replace(v_def, v_antes, '    perform public.porto_sincronizar_comissoes();
    return v_total;');

    -- Importacao: valor pago informado e comissao sincronizada no fim.
    select pg_get_functiondef('public.porto_confirmar_importacao'::regproc) into v_def;
    v_antes := 'p_confirmar_divergencias boolean DEFAULT false)
 RETURNS jsonb';
    if position(v_antes in v_def) = 0 then raise exception 'porto_confirmar_importacao: cabecalho'; end if;
    v_def := replace(v_def, v_antes, 'p_confirmar_divergencias boolean DEFAULT false, p_valor_pago numeric DEFAULT NULL::numeric)
 RETURNS jsonb');
    v_antes := '        update public.ordens_pagamento_porto
           set calendario_pagamento_id = coalesce(v_cal.id, calendario_pagamento_id),';
    if position(v_antes in v_def) = 0 then raise exception 'porto_confirmar_importacao: update da OP'; end if;
    v_def := replace(v_def, v_antes, '        update public.ordens_pagamento_porto
           set calendario_pagamento_id = coalesce(v_cal.id, calendario_pagamento_id),
               valor_pago_porto = coalesce(p_valor_pago, valor_pago_porto),');
    v_antes := '    update public.importacoes_porto
       set status = ''CONFIRMADA''';
    if position(v_antes in v_def) = 0 then raise exception 'porto_confirmar_importacao: status'; end if;
    v_def := replace(v_def, v_antes, '    perform public.porto_sincronizar_comissoes();

    update public.importacoes_porto
       set status = ''CONFIRMADA''');
    execute v_def;
end $$;

drop function if exists public.porto_confirmar_importacao(bigint, jsonb, text, bigint, text, text, boolean);
revoke execute on function public.porto_confirmar_importacao(bigint, jsonb, text, bigint, text, text, boolean, numeric) from public, anon;
grant execute on function public.porto_confirmar_importacao(bigint, jsonb, text, bigint, text, text, boolean, numeric) to authenticated;

-- Lancamento do administrador aceita a marca de desconto.
drop function if exists public.registrar_despesa_aprovada(
    text, bigint, numeric, date, date, text, bigint, bigint, text, text,
    public.natureza_despesa, boolean, date);

create or replace function public.registrar_despesa_aprovada(
    p_descricao text,
    p_categoria_id bigint,
    p_valor numeric,
    p_data date,
    p_vencimento date default null,
    p_forma_pagamento text default null,
    p_veiculo_id bigint default null,
    p_motorista_id bigint default null,
    p_protocolo text default null,
    p_observacoes text default null,
    p_natureza public.natureza_despesa default 'GERAL',
    p_paga boolean default false,
    p_data_pagamento date default null,
    p_desconta_comissao boolean default false
)
returns public.despesas
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_despesa public.despesas;
    v_quem uuid := (select auth.uid());
begin
    perform public.exigir_administrador();

    if p_valor is null or p_valor <= 0 then
        raise exception 'Informe o valor da despesa.' using errcode = 'invalid_parameter_value';
    end if;
    if p_categoria_id is null then
        raise exception 'Informe a categoria da despesa.' using errcode = 'invalid_parameter_value';
    end if;

    insert into public.despesas (
        descricao, categoria_id, valor, data_lancamento, vencimento,
        forma_pagamento, veiculo_id, motorista_id, protocolo, observacoes,
        natureza, status, data_pagamento, aprovada, aprovado_por, aprovado_em, criado_por,
        desconta_comissao)
    values (
        p_descricao, p_categoria_id, p_valor, p_data, p_vencimento,
        p_forma_pagamento, p_veiculo_id, p_motorista_id, p_protocolo, p_observacoes,
        coalesce(p_natureza, 'GERAL'),
        (case when p_paga then 'PAGO' else 'PENDENTE' end)::public.status_despesa,
        case when p_paga then coalesce(p_data_pagamento, p_data) else null end,
        true, v_quem, now(), v_quem,
        -- Sem socorrista nao ha de quem descontar.
        coalesce(p_desconta_comissao, false) and p_motorista_id is not null)
    returning * into v_despesa;

    return v_despesa;
end;
$$;
revoke execute on function public.registrar_despesa_aprovada(
    text, bigint, numeric, date, date, text, bigint, bigint, text, text,
    public.natureza_despesa, boolean, date, boolean) from public, anon;
grant execute on function public.registrar_despesa_aprovada(
    text, bigint, numeric, date, date, text, bigint, bigint, text, text,
    public.natureza_despesa, boolean, date, boolean) to authenticated;

-- ---------------------------------------------------------------- estado atual
select public.porto_recalcular_periodos();
select public.porto_sincronizar_comissoes();

notify pgrst, 'reload schema';
