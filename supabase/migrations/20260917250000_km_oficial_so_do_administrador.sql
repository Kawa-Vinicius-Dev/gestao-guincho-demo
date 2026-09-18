-- Quilometragem oficial passa a ser so do administrador.
--
-- Achado tentando, com a sessao de um socorrista de verdade, tudo o que ele nao
-- deveria conseguir. Onze das doze tentativas quebraram na cara do RLS. Esta
-- passou:
--
--     insert into public.quilometragens (...) values (...)  -> 1 linha
--
-- A policy pedia apenas `e_operador()` e `criado_por = auth.uid()`. Ela nasceu
-- quando o km era digitado a mao por quem rodava, e nessa epoca fazia sentido.
-- Mas o km morto vira custo da empresa, e a regra desta casa e que o socorrista
-- aponta e o administrador confirma — nada que ele manda vira despesa, km
-- oficial ou comissao sozinho. Pela tela ele nem via o formulario; pela API,
-- com a chave anon e a sessao dele, lancava o numero que quisesse, em qualquer
-- viatura, inclusive sem socorrista nenhum.
--
-- O caminho dele agora e o turno: odometro de abertura e de fechamento com foto,
-- e a linha em `quilometragens` nasce na aprovacao, por `aprovar_turno`, que e
-- SECURITY DEFINER e exige administrador. Nada se perde fechando esta porta.
--
-- `registrar_quilometragem`, que a tela de frota usa, acompanha: ela tambem
-- pedia so `e_operador()`.

drop policy if exists quilometragens_insercao on public.quilometragens;

create policy quilometragens_insercao on public.quilometragens
    for insert to authenticated
    with check (public.e_administrador() and criado_por = (select auth.uid()));

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
    perform public.exigir_administrador();

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
