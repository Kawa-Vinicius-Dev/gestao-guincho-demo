-- Reenviar o turno devolvido sem foto nova (Kawa, 15/10/2026).
--
-- O administrador costuma devolver no dia seguinte, e ai nao da mais para
-- fotografar o painel daquele momento: a viatura ja rodou. Antes, reenviar
-- passava por `fechar_turno`, que exige foto nova. Agora o socorrista corrige a
-- quilometragem da chegada e explica; a foto do fechamento que ja esta guardada
-- continua valendo (ela so e apagada na aprovacao). Foto nova e opcional.
--
-- A explicacao entra nas observacoes do turno, que a tela de Aprovacoes ja
-- mostra. A hora de fechamento continua a original: o turno e daquele dia.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

create or replace function public.reenviar_turno_devolvido(
    p_turno_id bigint,
    p_hodometro numeric,
    p_explicacao text,
    p_foto text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_motorista bigint := public.exigir_socorrista();
    v_turno public.turnos;
begin
    select * into v_turno from public.turnos t
     where t.id = p_turno_id and t.motorista_id = v_motorista and t.situacao = 'DEVOLVIDO'
     for update;
    if v_turno.id is null then
        raise exception 'Este turno não está mais devolvido para você.'
            using errcode = 'invalid_parameter_value';
    end if;

    if p_hodometro is null then
        raise exception 'Informe a quilometragem da chegada.' using errcode = 'invalid_parameter_value';
    end if;

    if p_hodometro < v_turno.hodometro_inicial then
        raise exception 'A quilometragem da chegada (%) é menor que a da saída (%). Confira o painel.',
            p_hodometro, v_turno.hodometro_inicial using errcode = 'invalid_parameter_value';
    end if;

    if length(btrim(coalesce(p_explicacao, ''))) = 0 then
        raise exception 'Explique a correção para o administrador.' using errcode = 'invalid_parameter_value';
    end if;

    -- Foto nova so se ele tiver; precisa ser da pasta deste turno.
    if nullif(btrim(coalesce(p_foto, '')), '') is not null
       and public.turno_do_caminho(p_foto) is distinct from v_turno.id then
        raise exception 'Foto inválida. Tire a foto de novo.' using errcode = 'invalid_parameter_value';
    end if;

    update public.turnos
       set situacao = 'AGUARDANDO_APROVACAO',
           hodometro_final = p_hodometro,
           foto_fechamento = coalesce(nullif(btrim(coalesce(p_foto, '')), ''), foto_fechamento),
           observacoes = concat_ws(' · ', nullif(btrim(coalesce(observacoes, '')), ''),
                                   'Correção: ' || btrim(p_explicacao)),
           atualizado_em = now()
     where id = v_turno.id;
end;
$$;

revoke execute on function public.reenviar_turno_devolvido(bigint, numeric, text, text) from public, anon;
grant execute on function public.reenviar_turno_devolvido(bigint, numeric, text, text) to authenticated;
