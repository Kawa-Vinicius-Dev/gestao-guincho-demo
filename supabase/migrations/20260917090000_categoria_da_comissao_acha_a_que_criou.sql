-- O segundo pagamento de comissão sempre falhava.
--
-- As duas funções que pagam comissão procuram a categoria por um nome e criam
-- por outro:
--
--     select id ... where lower(btrim(nome)) = 'comissao de socorrista'
--     insert into categorias (nome, tipo) values ('Comissão de socorrista', ...)
--
-- "comissao" sem til não é igual a "comissão" com til. A busca nunca encontra a
-- categoria que ela mesma acabou de criar, então todo pagamento tenta inserir de
-- novo — e o segundo bate no índice único de nome por tipo:
--
--     duplicate key value violates unique constraint "categorias_nome_por_tipo_unico"
--
-- Passava despercebido enquanto havia um pagamento de comissão por vez. Com duas
-- OPs no mesmo período, ou com dois socorristas na mesma OP, o primeiro paga e o
-- segundo trava.
--
-- A correção é procurar pelo nome que é escrito de fato. `unaccent` não está
-- instalada e não vale uma extensão para isto: as duas pontas passam a usar a
-- mesma string, que é o que deveria ter acontecido desde o início. O
-- `coalesce` aceita as duas grafias para achar a categoria de quem já tem a
-- versão sem til gravada no banco.

create or replace function public.categoria_da_comissao()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
    select id into v_id from public.categorias
     where lower(btrim(nome)) in ('comissão de socorrista', 'comissao de socorrista')
       and tipo = 'DESPESA'
     order by id limit 1;

    if v_id is null then
        insert into public.categorias (nome, tipo)
        values ('Comissão de socorrista', 'DESPESA')
        returning id into v_id;
    end if;

    return v_id;
end;
$$;

revoke execute on function public.categoria_da_comissao() from public, anon, authenticated;

-- As duas funções que pagam comissão, redefinidas com a busca corrigida.
-- Só o trecho da categoria muda; o resto é o mesmo texto das migrações
-- 20260914091100 e 20260916090100, que não são editadas porque já foram
-- aplicadas.
create or replace function public.pagar_comissao(
    p_motorista_id bigint,
    p_calendario_id bigint,
    p_data_pagamento date default current_date,
    p_forma_pagamento text default null,
    p_observacoes text default null
)
returns public.pagamentos_comissao
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_comissao jsonb;
    v_liquido numeric;
    v_despesa_id bigint;
    v_categoria_id bigint;
    v_pagamento public.pagamentos_comissao;
    v_quem uuid := (select auth.uid());
begin
    perform public.exigir_administrador();

    if exists (
        select 1 from public.pagamentos_comissao
        where motorista_id = p_motorista_id and calendario_pagamento_id = p_calendario_id
    ) then
        raise exception 'A comissao deste ciclo ja foi paga a este socorrista.'
            using errcode = 'unique_violation';
    end if;

    v_comissao := public.comissao_do_ciclo(p_calendario_id, p_motorista_id);
    v_liquido := (v_comissao ->> 'liquido')::numeric;

    if v_liquido is null or v_liquido <= 0 then
        raise exception 'Nao ha valor liquido positivo de comissao para pagar neste periodo.'
            using errcode = 'invalid_parameter_value';
    end if;

    -- Era aqui: a busca usava 'comissao' e a criação gravava 'Comissão'.
    v_categoria_id := public.categoria_da_comissao();

    -- O protocolo COMISSAO- e o que o dashboard usa para nao contar o repasse
    -- duas vezes no custo da pessoa.
    insert into public.despesas (
        descricao, categoria_id, valor, data_lancamento, data_pagamento,
        motorista_id, protocolo, status, aprovada, aprovado_por, aprovado_em,
        forma_pagamento, observacoes, criado_por
    ) values (
        'Comissão de socorrista — ' || coalesce(v_comissao ->> 'periodo', 'ciclo'),
        v_categoria_id, v_liquido, p_data_pagamento, p_data_pagamento,
        p_motorista_id, 'COMISSAO-' || p_calendario_id::text || '-' || p_motorista_id::text,
        'PAGO', true, v_quem, now(),
        p_forma_pagamento, p_observacoes, v_quem
    ) returning id into v_despesa_id;

    insert into public.pagamentos_comissao (
        motorista_id, calendario_pagamento_id, despesa_id, valor_pago,
        data_pagamento, forma_pagamento, observacoes, pago_por
    ) values (
        p_motorista_id, p_calendario_id, v_despesa_id, v_liquido,
        p_data_pagamento, p_forma_pagamento, p_observacoes, v_quem
    ) returning * into v_pagamento;

    return v_pagamento;
end;
$$;

create or replace function public.pagar_comissao_op(
    p_motorista_id bigint,
    p_op_id bigint,
    p_data_pagamento date default current_date,
    p_forma_pagamento text default null,
    p_observacoes text default null
)
returns public.pagamentos_comissao
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_comissao jsonb;
    v_liquido numeric;
    v_despesa_id bigint;
    v_categoria_id bigint;
    v_pagamento public.pagamentos_comissao;
    v_quem uuid := (select auth.uid());
begin
    perform public.exigir_administrador();

    if exists (
        select 1 from public.pagamentos_comissao
        where motorista_id = p_motorista_id and ordem_pagamento_id = p_op_id
    ) then
        raise exception 'A comissao desta OP ja foi paga a este socorrista.'
            using errcode = 'unique_violation';
    end if;

    v_comissao := public.comissao_da_op(p_op_id, p_motorista_id);
    v_liquido := (v_comissao ->> 'liquido')::numeric;

    if v_liquido is null or v_liquido <= 0 then
        raise exception 'Nao ha valor liquido positivo de comissao para pagar nesta OP.'
            using errcode = 'invalid_parameter_value';
    end if;

    -- Era aqui: a busca usava 'comissao' e a criação gravava 'Comissão'.
    v_categoria_id := public.categoria_da_comissao();

    insert into public.despesas (
        descricao, categoria_id, valor, data_lancamento, data_pagamento,
        motorista_id, protocolo, status, aprovada, aprovado_por, aprovado_em,
        forma_pagamento, observacoes, criado_por
    ) values (
        'Comissão de socorrista — ' || coalesce(v_comissao ->> 'periodo', 'OP'),
        v_categoria_id, v_liquido, p_data_pagamento, p_data_pagamento,
        p_motorista_id, 'COMISSAO-OP-' || p_op_id::text || '-' || p_motorista_id::text,
        'PAGO', true, v_quem, now(),
        p_forma_pagamento, p_observacoes, v_quem
    ) returning id into v_despesa_id;

    insert into public.pagamentos_comissao (
        motorista_id, ordem_pagamento_id, despesa_id, valor_pago,
        data_pagamento, forma_pagamento, observacoes, pago_por
    ) values (
        p_motorista_id, p_op_id, v_despesa_id, v_liquido,
        p_data_pagamento, p_forma_pagamento, p_observacoes, v_quem
    ) returning * into v_pagamento;

    return v_pagamento;
end;
$$;

revoke execute on function public.pagar_comissao(bigint, bigint, date, text, text) from public, anon;
revoke execute on function public.pagar_comissao_op(bigint, bigint, date, text, text) from public, anon;
grant execute on function public.pagar_comissao(bigint, bigint, date, text, text) to authenticated;
grant execute on function public.pagar_comissao_op(bigint, bigint, date, text, text) to authenticated;
