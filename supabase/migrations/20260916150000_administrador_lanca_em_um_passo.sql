-- O administrador lanca a despesa num passo so.
--
-- Fluxo de hoje: o administrador preenche o formulario, escolhe "Paga", e a
-- despesa nasce PENDENTE e nao aprovada assim mesmo. Para ela chegar na Visao
-- geral ele ainda clica em "Aprovar" e depois em "Registrar pagamento" — tres
-- acoes para registrar um almoco de R$ 50 que ele mesmo ja pagou, e o campo
-- "Situacao" do formulario nao valia nada.
--
-- A segregacao de funcoes continua, e continua sendo levada a serio. O que muda
-- e ONDE ela se aplica:
--
--   despesa lancada por FUNCIONARIO -> nasce pendente, o administrador aprova.
--       E aqui que a regra existe: um segundo par de olhos sobre o gasto de
--       quem nao responde pelo caixa. Nada disto muda — nem o caminho, nem a
--       policy de insercao, nem `aprovar_despesa`, que segue recusando que
--       alguem aprove o proprio lancamento.
--
--   despesa lancada por ADMINISTRADOR -> nasce aprovada, por ele.
--       Aqui a regra nunca protegeu nada: `aprovar_despesa` ja recusa a
--       autoaprovacao, entao o administrador que lancava a propria despesa
--       ficava com ela travada em pendente para sempre, ou pedia a outro
--       administrador para aprovar um gasto que ele mesmo decidiu. O controle
--       nao acontecia; so o incomodo.
--
-- O registro fica honesto: `aprovado_por` guarda quem lancou, porque foi ele
-- quem aprovou, e a auditoria continua sabendo dizer de quem foi a decisao.
--
-- Por que RPC e nao insert direto: a policy `despesas_insercao` exige
-- `not aprovada and status = 'PENDENTE'`, e isso NAO muda — e o que impede
-- qualquer sessao de escrever uma despesa ja aprovada direto na tabela. Nascer
-- aprovada so acontece aqui dentro, onde `exigir_administrador()` confere quem
-- esta chamando.

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
    p_data_pagamento date default null
)
returns public.despesas
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_despesa public.despesas;
    v_quem uuid := (select auth.uid());
    -- Alimentacao e custo do socorrista, nao da viatura: a viatura sairia da
    -- conta no painel de qualquer forma, e gravar o vinculo so deixaria um
    -- rastro que nenhuma soma usa. Mesma regra que a tela aplica.
    v_alimentacao boolean := p_natureza = 'ALIMENTACAO_FUNCIONARIO' and p_motorista_id is not null;
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
        natureza, status, data_pagamento, aprovada, aprovado_por, aprovado_em, criado_por)
    values (
        p_descricao, p_categoria_id, p_valor, p_data, p_vencimento,
        p_forma_pagamento, case when v_alimentacao then null else p_veiculo_id end,
        p_motorista_id, p_protocolo, p_observacoes,
        case when v_alimentacao then 'ALIMENTACAO_FUNCIONARIO'::public.natureza_despesa
             else 'GERAL'::public.natureza_despesa end,
        (case when p_paga then 'PAGO' else 'PENDENTE' end)::public.status_despesa,
        -- A constraint `despesas_paga_tem_data` exige a data quando esta paga.
        -- Sem data informada, vale a do lancamento: e o dia em que o dinheiro
        -- saiu, que e o que o formulario acabou de dizer.
        case when p_paga then coalesce(p_data_pagamento, p_data) else null end,
        true, v_quem, now(), v_quem)
    returning * into v_despesa;

    return v_despesa;
end;
$$;

revoke execute on function public.registrar_despesa_aprovada(
    text, bigint, numeric, date, date, text, bigint, bigint, text, text,
    public.natureza_despesa, boolean, date) from public, anon;
grant execute on function public.registrar_despesa_aprovada(
    text, bigint, numeric, date, date, text, bigint, bigint, text, text,
    public.natureza_despesa, boolean, date) to authenticated;
