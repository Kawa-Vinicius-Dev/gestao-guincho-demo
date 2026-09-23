-- A porcentagem da comissao muda por OP, e o padrao da empresa e editavel.
--
-- Kawa, 22/09/2026: "tem algumas situacoes que em certas OPs ele usa 17%, as
-- vezes usa 20%. Como o padrao hoje e 20, eu quero que seja editavel." A % da OP
-- vale para todos os socorristas daquela OP, e e editada em Comissoes; o padrao
-- da empresa, em Configuracoes. Teto de 20% nos dois.
--
-- Quem decide, em ordem:
--   1. a % da OP, se o administrador definiu uma;
--   2. a taxa congelada quando aquela OP fechou (so muda se a OP mudar);
--   3. a % propria do socorrista;
--   4. o padrao da empresa.
-- Definir a % na OP e uma decisao explicita sobre aquela OP, entao ela passa por
-- cima do congelamento. Mudar o padrao ou a % de um socorrista nao mexe em OP
-- que ja fechou, como antes.
--
-- Esta migration tambem acerta tres leituras que ainda multiplicavam pelo
-- padrao fixo e ignoravam a taxa de cada OP: a lista de Comissoes, a tela de
-- Ordens de servico e a Visao geral.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

-- ---------------------------------------------------------------- o padrao
create table if not exists public.configuracao_comissao (
    id boolean primary key default true check (id),
    percentual_padrao numeric(5, 4) not null default 0.20
        check (percentual_padrao > 0 and percentual_padrao <= 0.20),
    atualizado_em timestamptz not null default now()
);
comment on table public.configuracao_comissao is
    'Uma linha so: a porcentagem padrao da comissao da empresa.';
insert into public.configuracao_comissao (id) values (true) on conflict (id) do nothing;
alter table public.configuracao_comissao enable row level security;
drop policy if exists configuracao_comissao_leitura on public.configuracao_comissao;
create policy configuracao_comissao_leitura on public.configuracao_comissao
    for select to authenticated using (true);

create or replace function public.percentual_comissao()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce((select c.percentual_padrao from public.configuracao_comissao c where c.id), 0.20)
$$;

-- ---------------------------------------------------------------- a % da OP
alter table public.ordens_pagamento_porto
    add column if not exists percentual_comissao numeric(5, 4)
        check (percentual_comissao is null or (percentual_comissao > 0 and percentual_comissao <= 0.20));
comment on column public.ordens_pagamento_porto.percentual_comissao is
    'Comissao desta OP para todos os socorristas, de 0 a 0,20. Vazio: vale a taxa de cada um.';

create or replace function public.percentual_da_comissao(
    p_motorista_id bigint,
    p_op_id bigint default null
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        (select op.percentual_comissao from public.ordens_pagamento_porto op where op.id = p_op_id),
        (select t.percentual from public.taxa_comissao_congelada t
          where t.motorista_id = p_motorista_id
            and t.ordem_pagamento_id = p_op_id),
        (select m.percentual_comissao from public.motoristas m where m.id = p_motorista_id),
        public.percentual_comissao())
$$;

-- ---------------------------------------------------------------- escrita
create or replace function public.definir_percentual_da_op(
    p_op_id bigint,
    p_percentual numeric
)
returns public.ordens_pagamento_porto
language plpgsql
security definer
set search_path = ''
as $$
declare v_op public.ordens_pagamento_porto;
begin
    perform public.exigir_administrador();

    if p_percentual is not null and (p_percentual <= 0 or p_percentual > 0.20) then
        raise exception 'A comissão tem que ficar entre 0 e 20%%.'
            using errcode = 'invalid_parameter_value';
    end if;

    update public.ordens_pagamento_porto
       set percentual_comissao = p_percentual
     where id = p_op_id
    returning * into v_op;

    if not found then
        raise exception 'OP nao encontrada.' using errcode = 'no_data_found';
    end if;

    -- A comissao desta OP e refeita na hora pela % nova.
    perform public.porto_sincronizar_comissoes();
    return v_op;
end;
$$;
revoke execute on function public.definir_percentual_da_op(bigint, numeric) from public, anon;
grant execute on function public.definir_percentual_da_op(bigint, numeric) to authenticated;

create or replace function public.definir_percentual_padrao(p_percentual numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.exigir_administrador();

    if p_percentual is null or p_percentual <= 0 or p_percentual > 0.20 then
        raise exception 'A comissão tem que ficar entre 0 e 20%%.'
            using errcode = 'invalid_parameter_value';
    end if;

    update public.configuracao_comissao
       set percentual_padrao = p_percentual, atualizado_em = now()
     where id;

    -- So o que ainda nao fechou muda: as OPs fechadas guardam a taxa delas.
    perform public.porto_sincronizar_comissoes();
    return p_percentual;
end;
$$;
revoke execute on function public.definir_percentual_padrao(numeric) from public, anon;
grant execute on function public.definir_percentual_padrao(numeric) to authenticated;

-- ---------------------------------------------------------------- leituras
-- Lista de Comissoes: a comissao de cada socorrista e a soma do que cada
-- servico gerou, pela taxa da OP dele — e nao a producao vezes o padrao.
create or replace function public.resumo_comissoes_ops(p_op_ids bigint[], p_motorista_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
    perform public.exigir_administrador();

    with servicos as (
        select os.motorista_id, count(*) as qtd, sum(os.valor_total) as producao,
               sum(case when os.sem_comissao then 0
                        else round(os.valor_total * public.percentual_da_comissao(os.motorista_id, os.ordem_pagamento_id), 2)
                   end) as comissao
        from public.ordens_servico_porto os
        where os.ordem_pagamento_id = any(p_op_ids)
          and os.motorista_id is not null
          and os.status_operacional <> 'CANCELADO'
          and (p_motorista_id is null or os.motorista_id = p_motorista_id)
        group by os.motorista_id
    ),
    descontos as (
        select da.motorista_id, sum(da.valor) as aprovado
        from public.descontos_atribuidos() da
        where da.ordem_pagamento_id = any(p_op_ids) and da.aprovada
        group by da.motorista_id
    ),
    pagamento as (
        select pc.motorista_id, min(pc.id) as id, sum(pc.valor_pago) as valor_pago,
               max(pc.data_pagamento) as data_pagamento, min(pc.despesa_id) as despesa_id
        from public.pagamentos_comissao pc
        where pc.ordem_pagamento_id = any(p_op_ids)
        group by pc.motorista_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'motoristaId', m.id,
        'socorrista', m.nome,
        'quantidadeServicosPagos', coalesce(s.qtd, 0),
        'producaoPaga', coalesce(s.producao, 0),
        'comissaoBruta', coalesce(s.comissao, 0),
        'descontos', coalesce(a.aprovado, 0),
        'liquido', coalesce(s.comissao, 0) - coalesce(a.aprovado, 0),
        'pagamento', case when p.id is null then null else jsonb_build_object(
            'id', p.id, 'motoristaId', m.id, 'despesaId', p.despesa_id,
            'valorPago', p.valor_pago, 'dataPagamento', p.data_pagamento) end
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

-- Tela de Ordens de servico e Visao geral: cirurgia de texto, como nas
-- migrations anteriores. Cada troca recusa se a ancora sumiu.
create or replace function public.__trocar_no_corpo(v_def text, v_antes text, v_depois text, v_onde text)
returns text language plpgsql as $$
begin
    if position(v_antes in v_def) = 0 then
        raise exception 'Ancora nao encontrada em %: %', v_onde, left(v_antes, 60);
    end if;
    return replace(v_def, v_antes, v_depois);
end $$;

do $migracao$
declare
    v_def text;
    v_listar constant regprocedure :=
        'public.porto_listar_os(date,date,text,text,bigint,text,text,text,integer,integer,boolean,boolean)'::regprocedure;
begin
    -- Ordens de servico: comissao de cada OS e o total, pela taxa da OP.
    v_def := pg_get_functiondef(v_listar);
    if position('percentual_da_comissao' in v_def) = 0 then
        v_def := public.__trocar_no_corpo(v_def,
            'round(sum(valor_total) * v_pct, 2)',
            'sum(round(valor_total * public.percentual_da_comissao(motorista_id, ordem_pagamento_id), 2))',
            'porto_listar_os (total)');
        v_def := public.__trocar_no_corpo(v_def,
            'round(f.valor_total * v_pct, 2)',
            'round(f.valor_total * public.percentual_da_comissao(f.motorista_id, f.ordem_pagamento_id), 2)',
            'porto_listar_os (linha)');
        execute v_def;
    end if;

    -- Visao geral: cada OS do periodo carrega a propria taxa (zero quando ela
    -- esta sem comissao), e as somas usam essa taxa.
    v_def := pg_get_functiondef('public.dashboard_financeiro(date,date)'::regprocedure);
    if position('percentual_da_comissao' in v_def) = 0 then
        v_def := public.__trocar_no_corpo(v_def,
            E'os.motorista_id, os.ordem_pagamento_id\n        from public.ordens_servico_porto os',
            E'os.motorista_id, os.ordem_pagamento_id,\n'
            || E'               case when os.sem_comissao then 0\n'
            || E'                    else public.percentual_da_comissao(os.motorista_id, os.ordem_pagamento_id) end as pct\n'
            || E'        from public.ordens_servico_porto os',
            'dashboard_financeiro (oss_periodo)');
        v_def := public.__trocar_no_corpo(v_def,
            E'coalesce(sum(valor_total) filter (where status_financeiro = ''RECEBIDO''), 0) as producao_paga,',
            E'coalesce(sum(valor_total) filter (where status_financeiro = ''RECEBIDO''), 0) as producao_paga,\n'
            || E'            coalesce(sum(round(valor_total * pct, 2)) filter (where status_financeiro = ''RECEBIDO''), 0) as comissao_paga,',
            'dashboard_financeiro (producao)');
        v_def := public.__trocar_no_corpo(v_def,
            'round(pr.producao_paga * v_pct, 2)',
            'pr.comissao_paga',
            'dashboard_financeiro (comissaoSobreProducao)');
        v_def := public.__trocar_no_corpo(v_def,
            'coalesce(round(sum(os.valor_total) * v_pct, 2), 0) as valor',
            'coalesce(sum(round(os.valor_total * os.pct, 2)), 0) as valor',
            'dashboard_financeiro (comissao_devida)');
        v_def := public.__trocar_no_corpo(v_def,
            E'select motorista_id, count(*) as servicos, sum(valor_total) as producao\n',
            E'select motorista_id, count(*) as servicos, sum(valor_total) as producao,\n'
            || E'                   sum(round(valor_total * pct, 2)) as comissao\n',
            'dashboard_financeiro (por_socorrista)');
        v_def := public.__trocar_no_corpo(v_def,
            'round(coalesce(s.producao, 0) * v_pct, 2)',
            'coalesce(s.comissao, 0)',
            'dashboard_financeiro (comissao do socorrista)');
        execute v_def;
    end if;
end
$migracao$;

drop function public.__trocar_no_corpo(text, text, text, text);

select public.porto_sincronizar_comissoes();
