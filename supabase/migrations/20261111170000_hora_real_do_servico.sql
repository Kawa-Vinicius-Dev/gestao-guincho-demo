-- Hora real do toque, para o envio de servicos que esperou o sinal voltar.
--
-- O socorrista na rua nem sempre tem sinal. O celular guarda "iniciar" e
-- "finalizar" e envia quando a conexao volta (fila offline). Sem este ajuste o
-- banco gravaria `now()` do envio: o dono veria, em "Km dos turnos", o servico
-- iniciado as 14:50 em vez das 14:05 em que o socorrista tocou no botao.
--
-- As duas funcoes ganham o parametro opcional `p_ocorrido_em` (no fim, com
-- default null). Sem ele, nada muda: continua `now()`. Com ele, vale a hora do
-- celular, dentro destes limites:
--   * nao pode estar mais de 5 minutos no futuro (relogio adiantado);
--   * nao pode ser anterior ao turno (iniciar) nem ao inicio do servico
--     (finalizar), com 5 minutos de folga para diferenca de relogio.
-- O resto das regras (um servico por vez, odometro que nao volta, foto, local)
-- e o corpo das funcoes seguem como estavam em 20261015120000.

create or replace function public.hora_do_toque(p_ocorrido_em timestamptz, p_minimo timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
    if p_ocorrido_em is null then
        return now();
    end if;
    if p_ocorrido_em > now() + interval '5 minutes' then
        raise exception 'O horário do celular está adiantado. Acerte o relógio e tente de novo.'
            using errcode = 'invalid_parameter_value';
    end if;
    if p_ocorrido_em < p_minimo - interval '5 minutes' then
        raise exception 'O horário do celular não confere com o do turno. Acerte o relógio e tente de novo.'
            using errcode = 'invalid_parameter_value';
    end if;
    return least(p_ocorrido_em, now());
end;
$$;
revoke execute on function public.hora_do_toque(timestamptz, timestamptz) from public, anon;
grant execute on function public.hora_do_toque(timestamptz, timestamptz) to authenticated;

-- Duas assinaturas com o mesmo nome deixariam o PostgREST sem saber qual chamar
-- (PGRST203): troca a antiga pela nova, que aceita as mesmas chamadas.
drop function public.iniciar_servico_do_turno(text, text, numeric, numeric, numeric, integer, text);
drop function public.finalizar_servico_do_turno(bigint, numeric, text, numeric, numeric, integer, text);

create function public.iniciar_servico_do_turno(
    p_numero_os text, p_numero_normalizado text, p_km_inicial numeric,
    p_latitude numeric default null, p_longitude numeric default null,
    p_precisao_m integer default null, p_sem_local text default null,
    p_ocorrido_em timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_motorista bigint := public.exigir_socorrista();
    v_turno public.turnos;
    v_em_andamento text;
    v_ultimo_final numeric;
    v_hora timestamptz;
    v_id bigint;
begin
    select * into v_turno from public.turnos t
     where t.motorista_id = v_motorista and t.situacao = 'ABERTO'
     for update;
    if v_turno.id is null then
        raise exception 'Abra o turno antes de iniciar um serviço.'
            using errcode = 'invalid_parameter_value';
    end if;

    if coalesce(btrim(p_numero_os), '') = '' or coalesce(btrim(p_numero_normalizado), '') = '' then
        raise exception 'Informe o número da OS.' using errcode = 'invalid_parameter_value';
    end if;

    if p_km_inicial is null or p_km_inicial < 0 then
        raise exception 'Informe a quilometragem do painel.' using errcode = 'invalid_parameter_value';
    end if;

    if not public.servico_local_valido(p_latitude, p_longitude, p_sem_local) then
        raise exception 'Localização inválida. Tente de novo.' using errcode = 'invalid_parameter_value';
    end if;

    v_hora := public.hora_do_toque(p_ocorrido_em, v_turno.aberto_em);

    select s.numero_os into v_em_andamento from public.servicos_do_turno s
     where s.turno_id = v_turno.id and s.km_inicial is not null and s.finalizado_em is null;
    if found then
        raise exception 'Finalize o serviço da OS % antes de iniciar outro.', v_em_andamento
            using errcode = 'invalid_parameter_value';
    end if;

    if exists (select 1 from public.servicos_do_turno s
                where s.turno_id = v_turno.id and s.numero_normalizado = btrim(p_numero_normalizado)) then
        raise exception 'A OS % já está registrada neste turno.', btrim(p_numero_os)
            using errcode = 'unique_violation';
    end if;

    -- O odometro nao volta: nem para antes do inicio do turno, nem para antes
    -- do fim do ultimo servico.
    if p_km_inicial < v_turno.hodometro_inicial then
        raise exception 'A quilometragem (%) é menor que a do início do turno (%). Confira o painel.',
            p_km_inicial, v_turno.hodometro_inicial using errcode = 'invalid_parameter_value';
    end if;
    select max(s.km_final) into v_ultimo_final from public.servicos_do_turno s
     where s.turno_id = v_turno.id and s.km_final is not null;
    if v_ultimo_final is not null and p_km_inicial < v_ultimo_final then
        raise exception 'A quilometragem (%) é menor que a do fim do último serviço (%). Confira o painel.',
            p_km_inicial, v_ultimo_final using errcode = 'invalid_parameter_value';
    end if;

    insert into public.servicos_do_turno (
        turno_id, numero_os, numero_normalizado, km_inicial, iniciado_em,
        inicio_latitude, inicio_longitude, inicio_precisao_m, inicio_sem_local)
    values (
        v_turno.id, btrim(p_numero_os), btrim(p_numero_normalizado), round(p_km_inicial, 2), v_hora,
        round(p_latitude, 6), round(p_longitude, 6), p_precisao_m,
        case when p_latitude is null then p_sem_local end)
    returning id into v_id;

    return v_id;
end;
$$;
revoke execute on function public.iniciar_servico_do_turno(text, text, numeric, numeric, numeric, integer, text, timestamptz) from public, anon;
grant execute on function public.iniciar_servico_do_turno(text, text, numeric, numeric, numeric, integer, text, timestamptz) to authenticated;

create function public.finalizar_servico_do_turno(
    p_id bigint, p_km_final numeric, p_foto text,
    p_latitude numeric default null, p_longitude numeric default null,
    p_precisao_m integer default null, p_sem_local text default null,
    p_ocorrido_em timestamptz default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_motorista bigint := public.exigir_socorrista();
    v_servico public.servicos_do_turno;
    v_hora timestamptz;
begin
    -- Trava a linha: dois toques em "Finalizar" nao finalizam duas vezes.
    select s.* into v_servico
      from public.servicos_do_turno s
      join public.turnos t on t.id = s.turno_id
     where s.id = p_id and t.motorista_id = v_motorista and t.situacao = 'ABERTO'
       and s.km_inicial is not null
     for update of s;
    if v_servico.id is null then
        raise exception 'Serviço não encontrado no seu turno aberto.' using errcode = 'invalid_parameter_value';
    end if;

    if v_servico.finalizado_em is not null then
        raise exception 'Este serviço já foi finalizado.' using errcode = 'invalid_parameter_value';
    end if;

    if v_servico.foto_inicio is null then
        raise exception 'Envie a foto do painel do início antes de finalizar.'
            using errcode = 'invalid_parameter_value';
    end if;

    if p_km_final is null then
        raise exception 'Informe a quilometragem do painel.' using errcode = 'invalid_parameter_value';
    end if;

    if p_km_final < v_servico.km_inicial then
        raise exception 'A quilometragem final (%) é menor que a do início do serviço (%). Confira o painel.',
            p_km_final, v_servico.km_inicial using errcode = 'invalid_parameter_value';
    end if;

    if p_km_final - v_servico.km_inicial > 2000 then
        raise exception 'Mais de 2.000 km num serviço. Confira a quilometragem do painel.'
            using errcode = 'invalid_parameter_value';
    end if;

    if public.turno_do_caminho(p_foto) is distinct from v_servico.turno_id then
        raise exception 'A foto do painel é obrigatória para finalizar.' using errcode = 'invalid_parameter_value';
    end if;

    if not public.servico_local_valido(p_latitude, p_longitude, p_sem_local) then
        raise exception 'Localização inválida. Tente de novo.' using errcode = 'invalid_parameter_value';
    end if;

    v_hora := public.hora_do_toque(p_ocorrido_em, v_servico.iniciado_em);

    update public.servicos_do_turno
       set km_final = round(p_km_final, 2),
           km = round(p_km_final, 2) - km_inicial,
           finalizado_em = v_hora,
           foto_fim = p_foto,
           fim_latitude = round(p_latitude, 6),
           fim_longitude = round(p_longitude, 6),
           fim_precisao_m = p_precisao_m,
           fim_sem_local = case when p_latitude is null then p_sem_local end
     where id = p_id;

    return round(p_km_final, 2) - v_servico.km_inicial;
end;
$$;
revoke execute on function public.finalizar_servico_do_turno(bigint, numeric, text, numeric, numeric, integer, text, timestamptz) from public, anon;
grant execute on function public.finalizar_servico_do_turno(bigint, numeric, text, numeric, numeric, integer, text, timestamptz) to authenticated;
