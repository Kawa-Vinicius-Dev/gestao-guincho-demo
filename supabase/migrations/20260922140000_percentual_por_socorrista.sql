-- A porcentagem da comissao passa a ser de cada socorrista, com teto de 20%.
--
-- Kawa, 22/09/2026: o cliente quer escolher a porcentagem de cada funcionario,
-- no maximo 20%. Ate aqui era uma funcao que devolvia 0.20 fixo para todo
-- mundo, e mudar exigia migration.
--
-- "So daquele periodo": a taxa fica GRAVADA no pagamento de comissao quando ele
-- nasce, e recalculo nenhum a troca depois. Mudar a porcentagem de alguem hoje
-- vale para as OPs que ainda nao fecharam comissao, e nao reescreve as que ja
-- fecharam — que era o defeito de origem, com a taxa atual sendo aplicada a
-- todo o historico a cada despesa lancada.
--
-- Isso convive com "tirar a comissao de uma OS": o recalculo continua
-- acontecendo e mudando o VALOR, so que com a taxa congelada daquela OP. Tirar
-- uma OS de uma OP antiga acerta o valor sem mudar a regra que valia na epoca.

alter table public.motoristas
    add column if not exists percentual_comissao numeric(5, 4)
        check (percentual_comissao is null
               or (percentual_comissao > 0 and percentual_comissao <= 0.20));
comment on column public.motoristas.percentual_comissao is
    'Comissao deste socorrista, de 0 a 0,20. Vazio: vale o padrao de percentual_comissao().';

alter table public.pagamentos_comissao
    add column if not exists percentual numeric(5, 4);
comment on column public.pagamentos_comissao.percentual is
    'A taxa usada quando esta comissao fechou. Congelada: recalculo nao a troca.';

-- ---------------------------------------------------------------- a taxa
-- A pergunta "quanto vale a comissao desta pessoa nesta OP" tem uma resposta so,
-- e ela mora aqui para nao se repetir diferente em cada funcao de leitura.
--
-- Ordem: a taxa congelada daquela OP, se ja fechou; senao a do socorrista; senao
-- o padrao da casa.
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
        (select pc.percentual from public.pagamentos_comissao pc
          where pc.motorista_id = p_motorista_id
            and pc.ordem_pagamento_id is not distinct from p_op_id
            and pc.percentual is not null
          limit 1),
        (select m.percentual_comissao from public.motoristas m where m.id = p_motorista_id),
        public.percentual_comissao())
$$;
grant execute on function public.percentual_da_comissao(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------- ajudante
-- Mesma trava da migration anterior: `replace` sem correspondencia devolve o
-- texto igual e a migration passa sem ter feito nada.
create or replace function public.__trocar_no_corpo(v_def text, v_antes text, v_depois text, v_onde text)
returns text language plpgsql as $$
begin
    if position(v_antes in v_def) = 0 then
        raise exception 'Ancora nao encontrada em %: %', v_onde, left(v_antes, 60);
    end if;
    return replace(v_def, v_antes, v_depois);
end $$;

create or replace function public.__ja_usa_taxa(v_funcao text)
returns boolean language plpgsql as $$
begin
    return position('percentual_da_comissao' in pg_get_functiondef(v_funcao::regprocedure)) > 0;
end $$;

do $migracao$
declare v_def text;
begin
    -- 1. A despesa de comissao. Aqui a taxa e por (OP, socorrista), que e
    --    exatamente o grao do group by, entao a funcao pode entrar na conta.
    if not public.__ja_usa_taxa('public.porto_sincronizar_comissoes()') then
        v_def := pg_get_functiondef('public.porto_sincronizar_comissoes()'::regprocedure);
        v_def := public.__trocar_no_corpo(v_def,
            'round(sum(os.valor_total) * v_pct, 2) as bruta',
            'round(sum(os.valor_total) * public.percentual_da_comissao(os.motorista_id, op.id), 2) as bruta',
            'porto_sincronizar_comissoes (bruta)');
        execute v_def;
    end if;

    -- 2. A leitura do periodo: cada servico rende pela taxa daquela OP.
    if not public.__ja_usa_taxa('public.comissao_das_ops(bigint[], bigint)') then
        v_def := pg_get_functiondef('public.comissao_das_ops(bigint[], bigint)'::regprocedure);
        v_def := public.__trocar_no_corpo(v_def,
            'case when os.sem_comissao then 0 else round(os.valor_total * v_pct, 2) end as comissao_servico',
            'case when os.sem_comissao then 0 else round(os.valor_total * public.percentual_da_comissao(os.motorista_id, os.ordem_pagamento_id), 2) end as comissao_servico',
            'comissao_das_ops (comissao_servico)');
        -- O percentual que a tela mostra passa a ser o de quem esta sendo lido.
        v_def := public.__trocar_no_corpo(v_def,
            '''percentualComissao'', v_pct',
            '''percentualComissao'', public.percentual_da_comissao(v_motorista, p_op_ids[1])',
            'comissao_das_ops (percentualComissao)');
        execute v_def;
    end if;

    -- 3. A ficha do socorrista.
    if not public.__ja_usa_taxa('public.detalhe_socorrista_ops(bigint, bigint[])') then
        v_def := pg_get_functiondef('public.detalhe_socorrista_ops(bigint, bigint[])'::regprocedure);
        v_def := public.__trocar_no_corpo(v_def,
            E'''comissaoGerada'', case when os.sem_comissao then 0\n                    when os.status_financeiro = ''RECEBIDO''\n                    then round(os.valor_total * v_pct, 2) end)',
            E'''comissaoGerada'', case when os.sem_comissao then 0\n                    when os.status_financeiro = ''RECEBIDO''\n                    then round(os.valor_total * public.percentual_da_comissao(os.motorista_id, os.ordem_pagamento_id), 2) end)',
            'detalhe_socorrista_ops');
        execute v_def;
    end if;

    -- 4. O previsto: ainda nao ha OP, entao vale a taxa atual do socorrista.
    if not public.__ja_usa_taxa('public.porto_comissao_prevista(date, date, bigint)') then
        v_def := pg_get_functiondef('public.porto_comissao_prevista(date, date, bigint)'::regprocedure);
        v_def := public.__trocar_no_corpo(v_def,
            'round(coalesce(sum(s.valor_previsto), 0) * v_pct, 2)',
            'round(coalesce(sum(s.valor_previsto), 0) * public.percentual_da_comissao(os.motorista_id, null), 2)',
            'porto_comissao_prevista');
        execute v_def;
    end if;
end
$migracao$;

drop function public.__trocar_no_corpo(text, text, text, text);
drop function public.__ja_usa_taxa(text);

-- ---------------------------------------------------------------- congelar
-- A taxa se grava no pagamento assim que ele nasce. Gatilho e nao codigo dentro
-- da sincronizacao porque a sincronizacao e reescrita por cirurgia de texto a
-- cada migration, e uma regra de dinheiro nao pode depender de sobreviver a
-- isso.
create or replace function public.congelar_percentual_da_comissao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.percentual is null then
        new.percentual := coalesce(
            (select m.percentual_comissao from public.motoristas m where m.id = new.motorista_id),
            public.percentual_comissao());
    end if;
    return new;
end;
$$;
revoke execute on function public.congelar_percentual_da_comissao() from public, anon, authenticated;

drop trigger if exists pagamentos_comissao_congela_percentual on public.pagamentos_comissao;
create trigger pagamentos_comissao_congela_percentual
    before insert on public.pagamentos_comissao
    for each row execute function public.congelar_percentual_da_comissao();

-- As comissoes que ja existem fecharam sob os 20% da casa, e e essa a taxa que
-- vale para elas para sempre.
update public.pagamentos_comissao
   set percentual = public.percentual_comissao()
 where percentual is null;

-- ---------------------------------------------------------------- escrita
create or replace function public.definir_percentual_do_socorrista(
    p_motorista_id bigint,
    p_percentual numeric
)
returns public.motoristas
language plpgsql
security definer
set search_path = ''
as $$
declare v_motorista public.motoristas;
begin
    perform public.exigir_administrador();

    if p_percentual is not null and (p_percentual <= 0 or p_percentual > 0.20) then
        raise exception 'A comissão tem que ficar entre 0 e 20%%.'
            using errcode = 'invalid_parameter_value';
    end if;

    update public.motoristas
       set percentual_comissao = p_percentual,
           atualizado_em = now()
     where id = p_motorista_id
    returning * into v_motorista;

    if not found then
        raise exception 'Socorrista nao encontrado.' using errcode = 'no_data_found';
    end if;

    -- O que ainda nao fechou passa a valer pela taxa nova; o que fechou nao se
    -- move, porque a taxa dele esta congelada no proprio pagamento.
    perform public.porto_sincronizar_comissoes();
    return v_motorista;
end;
$$;

revoke execute on function public.definir_percentual_do_socorrista(bigint, numeric) from public, anon;
grant execute on function public.definir_percentual_do_socorrista(bigint, numeric) to authenticated;
