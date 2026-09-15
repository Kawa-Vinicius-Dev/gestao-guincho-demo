-- Volta o comportamento observavel ao que o Spring faz hoje.
--
-- A migracao nao e o momento de corrigir regra de negocio: o sistema tem de
-- continuar se comportando igual enquanto troca de fundacao. As divergencias
-- abaixo estao registradas como divida tecnica no README dos testes.
--
-- Seguranca nao entra nesta reversao: RLS, autorizacao e segregacao por perfil
-- continuam como estao.

-- D1: o Spring so barra auto-REJEICAO. `aprovar` nunca verificou quem lancou
-- (a mensagem fala em "aprovar ou rejeitar", mas a trava existe so no rejeitar).
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
    if v_despesa.status = 'REJEITADO' then
        raise exception 'Despesa rejeitada nao pode ser aprovada.'
            using errcode = 'invalid_parameter_value';
    end if;

    update public.despesas
       set aprovada = true, aprovado_por = v_quem, aprovado_em = now()
     where id = p_despesa_id
     returning * into v_despesa;

    return v_despesa;
end;
$$;

-- D2: o Spring aceita criar despesa ja PAGA, com aprovada=false. A constraint
-- que exigia aprovacao antes do pagamento e a policy que forcava PENDENTE
-- saem; quem paga pelo fluxo normal continua passando por `pagar_despesa`,
-- que exige aprovacao — igual ao Spring.
alter table public.despesas drop constraint if exists despesas_paga_exige_aprovacao;
-- O Spring marca aprovado_por ao REJEITAR (com aprovada=false), o que a
-- constraint original proibia.
alter table public.despesas drop constraint if exists despesas_aprovada_tem_autor;

drop policy if exists despesas_insercao on public.despesas;
create policy despesas_insercao on public.despesas
    for insert to authenticated
    with check (
        (select public.e_operador())
        and criado_por = (select auth.uid())
        and not aprovada
        and comprovante_arquivo is null
    );

-- D4: "Programado" volta a somar todas as OPs do periodo, como o Spring faz
-- (filtra por data de pagamento programada preenchida — e o recorte do periodo
-- ja exige essa data, entao o conjunto e o mesmo do previsto).
create or replace function public.resumo_porto_dashboard(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare v jsonb;
begin
    perform public.exigir_administrador();
    select jsonb_build_object(
        'quantidadeTotalOps', count(*),
        'valorTotalPrevisto', coalesce(sum(valor_total), 0),
        'valorProgramado', coalesce(sum(valor_total)
            filter (where data_pagamento_programada is not null), 0),
        'valorRecebido', coalesce(sum(valor_recebido)
            filter (where data_recebimento is not null), 0)
    ) into v
    from public.ordens_pagamento_porto
    where data_pagamento_programada between p_inicio and p_fim;
    return v;
end;
$$;

-- D6: o Spring aceita km remunerado maior que o rodado quando quem lanca
-- confirma o excesso (QuilometragemService). A constraint proibia sempre.
-- Ela sai, e a regra vai para uma RPC — continua no servidor, so que com a
-- confirmacao no meio, como no Spring.
alter table public.quilometragens drop constraint if exists quilometragens_remunerado_ate_total;

create or replace function public.registrar_quilometragem(
    p_data date, p_veiculo_id bigint, p_motorista_id bigint,
    p_hodometro_inicial numeric, p_hodometro_final numeric,
    p_km_remunerado numeric, p_custo_por_km numeric,
    p_protocolo text default null, p_observacoes text default null,
    p_confirmar_excesso boolean default false
)
returns public.quilometragens
language plpgsql
security definer
set search_path = ''
as $$
declare v public.quilometragens;
begin
    if not public.e_operador() then
        raise exception 'Sessao invalida.' using errcode = 'insufficient_privilege';
    end if;

    if p_km_remunerado > (p_hodometro_final - p_hodometro_inicial)
       and not coalesce(p_confirmar_excesso, false) then
        raise exception 'O km remunerado excede o rodado. Confirme para registrar assim mesmo.'
            using errcode = 'invalid_parameter_value';
    end if;

    insert into public.quilometragens (
        data_registro, veiculo_id, motorista_id, protocolo,
        hodometro_inicial, hodometro_final, km_remunerado, custo_por_km,
        observacoes, criado_por
    ) values (
        p_data, p_veiculo_id, p_motorista_id, p_protocolo,
        p_hodometro_inicial, p_hodometro_final, p_km_remunerado, p_custo_por_km,
        p_observacoes, (select auth.uid())
    ) returning * into v;

    return v;
end;
$$;

revoke execute on function public.registrar_quilometragem(
    date, bigint, bigint, numeric, numeric, numeric, numeric, text, text, boolean) from public;
grant execute on function public.registrar_quilometragem(
    date, bigint, bigint, numeric, numeric, numeric, numeric, text, text, boolean) to authenticated;
