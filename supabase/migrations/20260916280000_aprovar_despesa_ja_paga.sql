-- Aprovar a despesa do socorrista ja a torna paga.
--
-- Kawa: a lancada pelo socorrista precisa ser aprovada pelo administrador, e so
-- isso. O segundo passo, "registrar pagamento", saiu: aprovado entra em despesas
-- e no dashboard na hora, na data do gasto.
create or replace function public.aprovar_despesa(p_despesa_id bigint)
returns public.despesas
language plpgsql
security definer
set search_path to ''
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
    if v_despesa.status = 'REJEITADO' then
        raise exception 'Despesa rejeitada nao pode ser aprovada.'
            using errcode = 'invalid_parameter_value';
    end if;

    update public.despesas
       set aprovada = true, aprovado_por = v_quem, aprovado_em = now(),
           status = 'PAGO',
           data_pagamento = coalesce(data_pagamento, data_lancamento)
     where id = p_despesa_id
     returning * into v_despesa;

    return v_despesa;
end;
$$;

-- O que ja foi aprovado e ficou esperando o "registrar pagamento" entra agora.
update public.despesas
   set status = 'PAGO', data_pagamento = coalesce(data_pagamento, data_lancamento)
 where aprovada and status = 'PENDENTE';
