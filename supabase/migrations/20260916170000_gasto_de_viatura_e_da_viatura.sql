-- Todo gasto da viatura é da viatura, alimentação incluída.
--
-- Informação nova da operação, e ela derruba a premissa da migração
-- 20260916160000: o cartão que a equipe usa é vinculado à viatura. Então a
-- refeição comprada naquele cartão é custo daquela viatura, como o diesel e o
-- pedágio — não é adiantamento ao socorrista, e não tem por que sair do
-- líquido dele. A regra anterior tirava a viatura de toda despesa de
-- Alimentação; aqui ela cai.
--
-- O que volta ao que era:
--   - o trigger que apagava veiculo_id sai;
--   - registrar_despesa_aprovada grava a viatura que o formulário mandou e não
--     reescreve natureza.
--
-- O que NÃO volta, porque não dependia dessa premissa:
--   - registrar_alimentacao continua marcando ALIMENTACAO_FUNCIONARIO. É o
--     socorrista lançando a refeição que ele mesmo pagou, do bolso dele, e essa
--     é a que desconta da comissão. Nada aqui a toca.
--   - detalhe_socorrista_op continua listando as despesas no nome dele.
--   - o administrador continua lançando em um passo.

drop trigger if exists despesas_alimentacao_sem_viatura on public.despesas;
drop function if exists public.despesa_alimentacao_nao_tem_viatura();

-- Mesma assinatura de antes, de propósito: trocar a lista de parâmetros
-- obrigaria o PostgREST a recarregar o cache de esquema e derrubaria o
-- lançamento no intervalo. Só o corpo muda.
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
        p_forma_pagamento, p_veiculo_id, p_motorista_id, p_protocolo, p_observacoes,
        coalesce(p_natureza, 'GERAL'),
        (case when p_paga then 'PAGO' else 'PENDENTE' end)::public.status_despesa,
        -- A constraint `despesas_paga_tem_data` exige a data quando está paga.
        case when p_paga then coalesce(p_data_pagamento, p_data) else null end,
        true, v_quem, now(), v_quem)
    returning * into v_despesa;

    return v_despesa;
end;
$$;
