-- Editar o numero da OP (Kawa, 23/09/2026: "nos detalhes da OP, uma opcao de
-- edicao para editar o numero da OP").
--
-- O numero nao mora so na OP: a comissao que o sistema lanca em despesas leva
-- o numero na descricao ("FULANO — comissao da OP 06433184"). Trocar so a OP
-- deixaria o Extrato falando de um numero que nao existe mais. Por isso a troca
-- e uma funcao so, que tambem acerta essas descricoes e registra no historico.
-- O indice ops_porto_numero_unico continua impedindo duas OPs com o mesmo numero.

create or replace function public.porto_renomear_op(p_id bigint, p_numero text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
    v_antigo text;
    v_novo text := btrim(coalesce(p_numero, ''));
begin
    perform public.exigir_administrador();

    if v_novo = '' then
        raise exception 'Informe o número da OP.';
    end if;

    select numero into v_antigo from public.ordens_pagamento_porto where id = p_id for update;
    if not found then
        raise exception 'OP não encontrada.';
    end if;
    if v_antigo = v_novo then
        return;
    end if;

    if exists (select 1 from public.ordens_pagamento_porto
                where id <> p_id and upper(btrim(numero)) = upper(v_novo)) then
        raise exception 'Já existe uma OP com o número %.', v_novo;
    end if;

    update public.ordens_pagamento_porto set numero = v_novo where id = p_id;

    -- Comissoes lancadas por esta OP: o protocolo guarda o id, a descricao o numero.
    update public.despesas
       set descricao = replace(descricao, 'OP ' || v_antigo, 'OP ' || v_novo)
     where protocolo like 'COMISSAO-OP-' || p_id || '-%'
       and descricao like '%OP ' || v_antigo || '%';

    insert into public.historico_porto (ordem_pagamento_id, evento, descricao, criado_por)
    values (p_id, 'NUMERO_ALTERADO', format('Número da OP alterado de %s para %s.', v_antigo, v_novo), auth.uid());
end;
$$;

revoke all on function public.porto_renomear_op(bigint, text) from public, anon;
grant execute on function public.porto_renomear_op(bigint, text) to authenticated;
