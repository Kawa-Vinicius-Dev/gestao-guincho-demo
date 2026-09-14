-- Escritas com regra de negocio.
--
-- Estas nao viram policy de UPDATE. Uma policy diz quem pode escrever numa linha;
-- nao diz que aprovar exige carimbar quem aprovou, que pagar exige estar aprovada
-- antes, nem que ninguem aprova o proprio lancamento. Regra que depende do estado
-- anterior e de quem chama mora numa funcao, onde da para verificar e recusar com
-- uma mensagem que a tela mostra.
--
-- Sao SECURITY DEFINER porque escrevem em tabelas cujo UPDATE nao esta liberado
-- por policy — e cada uma comeca conferindo quem esta chamando. Sem esse guarda,
-- definer seria uma porta aberta.

-- ---------------------------------------------------------------------------
-- Aprovacao de despesa
-- ---------------------------------------------------------------------------

create or replace function public.aprovar_despesa(p_despesa_id bigint)
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

    select * into v_despesa from public.despesas where id = p_despesa_id for update;
    if not found then
        raise exception 'Despesa nao encontrada.' using errcode = 'no_data_found';
    end if;

    -- Segregacao de funcoes: quem lanca nao aprova. E a unica trava entre um
    -- administrador e reembolsar a si mesmo sem um segundo par de olhos, e por
    -- isso vale inclusive para administrador.
    if v_despesa.criado_por = v_quem then
        raise exception 'Ninguem aprova o proprio lancamento.'
            using errcode = 'insufficient_privilege';
    end if;

    if v_despesa.status = 'REJEITADO' then
        raise exception 'Despesa rejeitada nao pode ser aprovada.'
            using errcode = 'invalid_parameter_value';
    end if;
    if v_despesa.aprovada then
        raise exception 'Despesa ja aprovada.' using errcode = 'invalid_parameter_value';
    end if;

    update public.despesas
       set aprovada = true, aprovado_por = v_quem, aprovado_em = now()
     where id = p_despesa_id
     returning * into v_despesa;

    return v_despesa;
end;
$$;

create or replace function public.rejeitar_despesa(p_despesa_id bigint)
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

    select * into v_despesa from public.despesas where id = p_despesa_id for update;
    if not found then
        raise exception 'Despesa nao encontrada.' using errcode = 'no_data_found';
    end if;
    if v_despesa.criado_por = v_quem then
        raise exception 'Ninguem rejeita o proprio lancamento.'
            using errcode = 'insufficient_privilege';
    end if;
    if v_despesa.status = 'PAGO' then
        raise exception 'Despesa ja paga nao pode ser rejeitada.'
            using errcode = 'invalid_parameter_value';
    end if;

    update public.despesas
       set status = 'REJEITADO', aprovada = false, aprovado_por = null, aprovado_em = null
     where id = p_despesa_id
     returning * into v_despesa;

    return v_despesa;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pagamento de despesa
-- ---------------------------------------------------------------------------

create or replace function public.pagar_despesa(
    p_despesa_id bigint,
    p_data_pagamento date default current_date,
    p_forma_pagamento text default null
)
returns public.despesas
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_despesa public.despesas;
begin
    perform public.exigir_administrador();

    select * into v_despesa from public.despesas where id = p_despesa_id for update;
    if not found then
        raise exception 'Despesa nao encontrada.' using errcode = 'no_data_found';
    end if;
    -- A constraint da tabela ja recusaria; a checagem aqui existe para a tela
    -- receber "aprove antes de pagar" em vez de um erro de constraint.
    if not v_despesa.aprovada then
        raise exception 'Despesa precisa ser aprovada antes de ser paga.'
            using errcode = 'invalid_parameter_value';
    end if;
    if v_despesa.status = 'PAGO' then
        raise exception 'Despesa ja paga.' using errcode = 'invalid_parameter_value';
    end if;

    update public.despesas
       set status = 'PAGO',
           data_pagamento = p_data_pagamento,
           forma_pagamento = coalesce(p_forma_pagamento, forma_pagamento)
     where id = p_despesa_id
     returning * into v_despesa;

    return v_despesa;
end;
$$;

-- ---------------------------------------------------------------------------
-- Comprovante
-- ---------------------------------------------------------------------------
-- O arquivo vai direto do browser para o Storage; esta funcao so registra o
-- caminho. Quem pode: o administrador, ou quem lancou a despesa — a mesma regra
-- que o backend aplicava ("voce so gerencia o comprovante do que voce lancou").

create or replace function public.registrar_comprovante(
    p_despesa_id bigint,
    p_caminho text,
    p_nome_original text,
    p_content_type text,
    p_tamanho_bytes bigint
)
returns public.despesas
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_despesa public.despesas;
begin
    if not public.e_operador() then
        raise exception 'Sessao invalida.' using errcode = 'insufficient_privilege';
    end if;

    select * into v_despesa from public.despesas where id = p_despesa_id for update;
    if not found then
        raise exception 'Despesa nao encontrada.' using errcode = 'no_data_found';
    end if;
    if not public.e_administrador() and v_despesa.criado_por <> (select auth.uid()) then
        raise exception 'Voce so pode anexar comprovante as despesas que lancou.'
            using errcode = 'insufficient_privilege';
    end if;
    if p_caminho is null or length(btrim(p_caminho)) = 0 then
        raise exception 'Caminho do arquivo ausente.' using errcode = 'invalid_parameter_value';
    end if;

    update public.despesas
       set comprovante_arquivo = p_caminho,
           comprovante_nome_original = p_nome_original,
           comprovante_content_type = p_content_type,
           comprovante_tamanho_bytes = p_tamanho_bytes
     where id = p_despesa_id
     returning * into v_despesa;

    return v_despesa;
end;
$$;

create or replace function public.remover_comprovante(p_despesa_id bigint)
returns public.despesas
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_despesa public.despesas;
begin
    if not public.e_operador() then
        raise exception 'Sessao invalida.' using errcode = 'insufficient_privilege';
    end if;

    select * into v_despesa from public.despesas where id = p_despesa_id for update;
    if not found then
        raise exception 'Despesa nao encontrada.' using errcode = 'no_data_found';
    end if;
    if not public.e_administrador() and v_despesa.criado_por <> (select auth.uid()) then
        raise exception 'Voce so pode remover o comprovante das despesas que lancou.'
            using errcode = 'insufficient_privilege';
    end if;

    update public.despesas
       set comprovante_arquivo = null, comprovante_nome_original = null,
           comprovante_content_type = null, comprovante_tamanho_bytes = null
     where id = p_despesa_id
     returning * into v_despesa;

    return v_despesa;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recebimento de conta
-- ---------------------------------------------------------------------------

create or replace function public.receber_conta(
    p_conta_id bigint,
    p_valor_recebido numeric,
    p_data_recebimento date default current_date
)
returns public.contas_receber
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_conta public.contas_receber;
begin
    perform public.exigir_administrador();

    if p_valor_recebido is null or p_valor_recebido < 0 then
        raise exception 'Informe o valor recebido.' using errcode = 'invalid_parameter_value';
    end if;

    select * into v_conta from public.contas_receber where id = p_conta_id for update;
    if not found then
        raise exception 'Conta nao encontrada.' using errcode = 'no_data_found';
    end if;
    if v_conta.status = 'RECEBIDO' then
        raise exception 'Conta ja recebida.' using errcode = 'invalid_parameter_value';
    end if;
    if v_conta.status = 'CANCELADO' then
        raise exception 'Conta cancelada nao pode ser recebida.'
            using errcode = 'invalid_parameter_value';
    end if;

    update public.contas_receber
       set status = 'RECEBIDO', valor_recebido = p_valor_recebido,
           data_recebimento = p_data_recebimento
     where id = p_conta_id
     returning * into v_conta;

    return v_conta;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atraso
-- ---------------------------------------------------------------------------
-- O Java recalculava o atraso a cada leitura, percorrendo as linhas em memoria
-- (`peek(c -> c.atualizarAtraso(hoje))`). Aqui e um UPDATE por conjunto, chamado
-- pela tela de caixa ou por um agendamento — nao a cada SELECT.

create or replace function public.marcar_atrasos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_total integer := 0;
    v_parcial integer;
begin
    perform public.exigir_administrador();

    update public.contas_receber
       set status = 'ATRASADO'
     where status = 'PENDENTE' and vencimento < current_date;
    get diagnostics v_parcial = row_count;
    v_total := v_parcial;

    update public.despesas
       set status = 'ATRASADO'
     where status = 'PENDENTE' and vencimento is not null and vencimento < current_date;
    get diagnostics v_parcial = row_count;
    v_total := v_total + v_parcial;

    return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Despesas fixas do mes
-- ---------------------------------------------------------------------------
-- Gera as despesas do mes a partir das recorrentes ativas. Roda quando o dono
-- manda, nao por relogio. Idempotente: rodar duas vezes no mesmo mes nao duplica.

create or replace function public.lancar_despesas_recorrentes(p_mes date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_inicio date := date_trunc('month', p_mes)::date;
    v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
    v_lancadas integer := 0;
    v_ja_existiam integer := 0;
    v_valor numeric := 0;
    v_quem uuid := (select auth.uid());
    r record;
    v_vencimento date;
begin
    perform public.exigir_administrador();

    for r in
        select * from public.despesas_recorrentes where ativo
    loop
        -- Dia 31 em fevereiro cai no ultimo dia do mes, nao no mes seguinte.
        v_vencimento := least(
            (v_inicio + (r.dia_vencimento - 1) * interval '1 day')::date,
            v_fim
        );

        if exists (
            select 1 from public.despesas d
            where d.despesa_recorrente_id = r.id
              and d.data_lancamento between v_inicio and v_fim
        ) then
            v_ja_existiam := v_ja_existiam + 1;
            continue;
        end if;

        insert into public.despesas (
            descricao, categoria_id, valor, data_lancamento, vencimento,
            veiculo_id, motorista_id, observacoes, despesa_recorrente_id,
            criado_por, status, aprovada
        ) values (
            r.descricao, r.categoria_id, r.valor, v_inicio, v_vencimento,
            r.veiculo_id, r.motorista_id, r.observacoes, r.id,
            v_quem, 'PENDENTE', false
        );

        v_lancadas := v_lancadas + 1;
        v_valor := v_valor + r.valor;
    end loop;

    return jsonb_build_object(
        'mes', to_char(v_inicio, 'YYYY-MM'),
        'lancadas', v_lancadas,
        'jaExistiam', v_ja_existiam,
        'valorLancado', v_valor
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- Pagamento de comissao
-- ---------------------------------------------------------------------------
-- Cria a despesa que representa o repasse e o registro do pagamento no mesmo
-- commit. Separar os dois deixaria repasse sem despesa (some do resultado) ou
-- despesa sem repasse (a comissao aparece paga duas vezes).

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

    select id into v_categoria_id from public.categorias
     where lower(btrim(nome)) = 'comissao de socorrista' and tipo = 'DESPESA';
    if v_categoria_id is null then
        insert into public.categorias (nome, tipo) values ('Comissão de socorrista', 'DESPESA')
        returning id into v_categoria_id;
    end if;

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

-- ---------------------------------------------------------------------------
-- Troca de senha
-- ---------------------------------------------------------------------------
-- A senha em si e trocada pelo Supabase Auth (updateUser). O que sobra e baixar a
-- bandeira de senha provisoria — e isso nao pode ser um UPDATE livre em `perfis`,
-- senao qualquer um limparia a propria trava sem trocar senha nenhuma.
-- A funcao so aceita ser chamada por quem ja trocou a senha no Auth, o que se
-- verifica pelo horario da ultima alteracao.

create or replace function public.concluir_troca_de_senha()
returns public.perfis
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_perfil public.perfis;
    v_quem uuid := (select auth.uid());
    v_alterada_em timestamptz;
begin
    if v_quem is null then
        raise exception 'Sessao invalida.' using errcode = 'insufficient_privilege';
    end if;

    select u.updated_at into v_alterada_em from auth.users u where u.id = v_quem;

    if v_alterada_em is null or v_alterada_em < now() - interval '5 minutes' then
        raise exception 'Troque a senha antes de concluir.'
            using errcode = 'invalid_parameter_value';
    end if;

    update public.perfis set senha_provisoria = false
     where id = v_quem
     returning * into v_perfil;

    return v_perfil;
end;
$$;

-- ---------------------------------------------------------------------------
-- Favoritos do menu
-- ---------------------------------------------------------------------------
-- Substitui a lista inteira numa transacao: a tela manda a ordem final, nao um
-- diff, e apagar-e-inserir em duas chamadas deixaria o menu vazio no meio.

create or replace function public.substituir_favoritos(p_rotas text[])
returns setof public.favoritos_menu
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_quem uuid := (select auth.uid());
begin
    if v_quem is null then
        raise exception 'Sessao invalida.' using errcode = 'insufficient_privilege';
    end if;

    delete from public.favoritos_menu where perfil_id = v_quem;

    insert into public.favoritos_menu (perfil_id, rota, ordem)
    select v_quem, rota, ordem - 1
    from unnest(coalesce(p_rotas, '{}'::text[])) with ordinality as t(rota, ordem)
    where length(btrim(rota)) > 0 and rota like '/%'
    on conflict (perfil_id, rota) do nothing;

    return query
        select * from public.favoritos_menu
         where perfil_id = v_quem order by ordem, id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissoes de execucao
-- ---------------------------------------------------------------------------

revoke execute on function public.aprovar_despesa(bigint) from public;
revoke execute on function public.rejeitar_despesa(bigint) from public;
revoke execute on function public.pagar_despesa(bigint, date, text) from public;
revoke execute on function public.registrar_comprovante(bigint, text, text, text, bigint) from public;
revoke execute on function public.remover_comprovante(bigint) from public;
revoke execute on function public.receber_conta(bigint, numeric, date) from public;
revoke execute on function public.marcar_atrasos() from public;
revoke execute on function public.lancar_despesas_recorrentes(date) from public;
revoke execute on function public.pagar_comissao(bigint, bigint, date, text, text) from public;
revoke execute on function public.concluir_troca_de_senha() from public;
revoke execute on function public.substituir_favoritos(text[]) from public;

grant execute on function public.aprovar_despesa(bigint) to authenticated;
grant execute on function public.rejeitar_despesa(bigint) to authenticated;
grant execute on function public.pagar_despesa(bigint, date, text) to authenticated;
grant execute on function public.registrar_comprovante(bigint, text, text, text, bigint) to authenticated;
grant execute on function public.remover_comprovante(bigint) to authenticated;
grant execute on function public.receber_conta(bigint, numeric, date) to authenticated;
grant execute on function public.marcar_atrasos() to authenticated;
grant execute on function public.lancar_despesas_recorrentes(date) to authenticated;
grant execute on function public.pagar_comissao(bigint, bigint, date, text, text) to authenticated;
grant execute on function public.concluir_troca_de_senha() to authenticated;
grant execute on function public.substituir_favoritos(text[]) to authenticated;
