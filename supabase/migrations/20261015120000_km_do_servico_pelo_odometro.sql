-- Km de cada servico pelo odometro: inicio e fim, com foto e local (Kawa, 15/10/2026).
--
-- Antes o socorrista digitava o km do GPS da Porto de cada servico. Agora ele
-- toca "Iniciar servico" (numero da OS, km do odometro, foto) e, na entrega,
-- "Finalizar servico" (km do odometro, foto). O km do servico e final - inicial.
-- Tres contas, cada uma com seu odometro:
--   * km total do turno  = odometro do fim do turno - do inicio do turno;
--   * km em servico      = soma do km dos servicos finalizados do turno;
--   * km morto           = km total do turno - km em servico.
--
-- Reaproveita `servicos_do_turno`: o km do servico continua na coluna `km`, e
-- a soma dela continua sendo o km produtivo que a aprovacao do turno ja puxa.
-- Os lancamentos antigos (so `km`, digitado do GPS) ficam como estao.
--
-- Fotos: mesma pasta do turno no bucket privado (turnos/<id_do_turno>/...),
-- entao valem as policies que ja existem para a foto do odometro do turno — e
-- a mesma regra de apagar depois da aprovacao.
--
-- Local: o celular pode negar ou nao conseguir. Nao se inventa coordenada: a
-- linha guarda o motivo (NEGADA, INDISPONIVEL) e o registro segue.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

alter table public.servicos_do_turno
    alter column km drop not null,
    add column if not exists km_inicial numeric(12, 2),
    add column if not exists km_final numeric(12, 2),
    add column if not exists iniciado_em timestamptz,
    add column if not exists finalizado_em timestamptz,
    add column if not exists foto_inicio text,
    add column if not exists foto_fim text,
    add column if not exists inicio_latitude numeric(9, 6),
    add column if not exists inicio_longitude numeric(9, 6),
    add column if not exists inicio_precisao_m integer,
    add column if not exists inicio_sem_local text,
    add column if not exists fim_latitude numeric(9, 6),
    add column if not exists fim_longitude numeric(9, 6),
    add column if not exists fim_precisao_m integer,
    add column if not exists fim_sem_local text;

-- O km do servico pode ser zero quando o odometro nao andou (entrega no mesmo
-- lugar); o lancamento antigo pelo GPS continua exigindo mais que zero na funcao.
alter table public.servicos_do_turno drop constraint if exists servicos_do_turno_km_valido;
alter table public.servicos_do_turno add constraint servicos_do_turno_km_valido
    check (km is null or (km >= 0 and km <= 2000));

alter table public.servicos_do_turno drop constraint if exists servicos_do_turno_pelo_odometro;
alter table public.servicos_do_turno add constraint servicos_do_turno_pelo_odometro check (
    -- Lancamento antigo: so o km.
    (km_inicial is null and km is not null and km_final is null and finalizado_em is null)
    -- Em andamento: inicio sem fim.
    or (km_inicial is not null and iniciado_em is not null
        and km_final is null and finalizado_em is null and km is null and foto_fim is null)
    -- Finalizado: fim com foto, e o km e a diferenca dos dois odometros.
    or (km_inicial is not null and iniciado_em is not null
        and km_final is not null and finalizado_em is not null and foto_fim is not null
        and km_final >= km_inicial and km = km_final - km_inicial)
);

alter table public.servicos_do_turno drop constraint if exists servicos_do_turno_local_inicio;
alter table public.servicos_do_turno add constraint servicos_do_turno_local_inicio check (
    (inicio_latitude is null) = (inicio_longitude is null)
    and (inicio_latitude is null or (inicio_latitude between -90 and 90 and inicio_longitude between -180 and 180))
    and (inicio_sem_local is null or inicio_sem_local in ('NEGADA', 'INDISPONIVEL'))
);
alter table public.servicos_do_turno drop constraint if exists servicos_do_turno_local_fim;
alter table public.servicos_do_turno add constraint servicos_do_turno_local_fim check (
    (fim_latitude is null) = (fim_longitude is null)
    and (fim_latitude is null or (fim_latitude between -90 and 90 and fim_longitude between -180 and 180))
    and (fim_sem_local is null or fim_sem_local in ('NEGADA', 'INDISPONIVEL'))
);

-- Um servico em andamento por turno: o caminhao so esta num chamado por vez.
create unique index if not exists servicos_do_turno_um_em_andamento
    on public.servicos_do_turno (turno_id)
    where km_inicial is not null and finalizado_em is null;

-- Local recebido da tela: coordenada valida, ou o motivo de nao ter.
create or replace function public.servico_local_valido(
    p_latitude numeric, p_longitude numeric, p_sem_local text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select case
        when p_latitude is not null and p_longitude is not null
            then p_latitude between -90 and 90 and p_longitude between -180 and 180
        when p_latitude is null and p_longitude is null
            then coalesce(p_sem_local, '') in ('NEGADA', 'INDISPONIVEL')
        else false
    end
$$;
revoke execute on function public.servico_local_valido(numeric, numeric, text) from public, anon;
grant execute on function public.servico_local_valido(numeric, numeric, text) to authenticated;

-- ------------------------------------------------------------------ iniciar
create or replace function public.iniciar_servico_do_turno(
    p_numero_os text, p_numero_normalizado text, p_km_inicial numeric,
    p_latitude numeric default null, p_longitude numeric default null,
    p_precisao_m integer default null, p_sem_local text default null
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
        v_turno.id, btrim(p_numero_os), btrim(p_numero_normalizado), round(p_km_inicial, 2), now(),
        round(p_latitude, 6), round(p_longitude, 6), p_precisao_m,
        case when p_latitude is null then p_sem_local end)
    returning id into v_id;

    return v_id;
end;
$$;
revoke execute on function public.iniciar_servico_do_turno(text, text, numeric, numeric, numeric, integer, text) from public, anon;
grant execute on function public.iniciar_servico_do_turno(text, text, numeric, numeric, numeric, integer, text) to authenticated;

-- A foto do inicio sobe depois do servico existir (o nome do arquivo leva o id
-- dele), como a foto da saida do turno. Sem ela, o servico nao finaliza.
create or replace function public.registrar_foto_inicio_servico(p_id bigint, p_caminho text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_motorista bigint := public.exigir_socorrista();
    v_turno bigint;
begin
    select s.turno_id into v_turno
      from public.servicos_do_turno s
      join public.turnos t on t.id = s.turno_id
     where s.id = p_id and t.motorista_id = v_motorista and t.situacao = 'ABERTO'
       and s.km_inicial is not null and s.finalizado_em is null;
    if not found then
        raise exception 'Serviço em andamento não encontrado.' using errcode = 'invalid_parameter_value';
    end if;

    if public.turno_do_caminho(p_caminho) is distinct from v_turno then
        raise exception 'Foto inválida. Tire a foto de novo.' using errcode = 'invalid_parameter_value';
    end if;

    update public.servicos_do_turno set foto_inicio = p_caminho where id = p_id;
end;
$$;
revoke execute on function public.registrar_foto_inicio_servico(bigint, text) from public, anon;
grant execute on function public.registrar_foto_inicio_servico(bigint, text) to authenticated;

-- ------------------------------------------------------------------ finalizar
create or replace function public.finalizar_servico_do_turno(
    p_id bigint, p_km_final numeric, p_foto text,
    p_latitude numeric default null, p_longitude numeric default null,
    p_precisao_m integer default null, p_sem_local text default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_motorista bigint := public.exigir_socorrista();
    v_servico public.servicos_do_turno;
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

    update public.servicos_do_turno
       set km_final = round(p_km_final, 2),
           km = round(p_km_final, 2) - km_inicial,
           finalizado_em = now(),
           foto_fim = p_foto,
           fim_latitude = round(p_latitude, 6),
           fim_longitude = round(p_longitude, 6),
           fim_precisao_m = p_precisao_m,
           fim_sem_local = case when p_latitude is null then p_sem_local end
     where id = p_id;

    return round(p_km_final, 2) - v_servico.km_inicial;
end;
$$;
revoke execute on function public.finalizar_servico_do_turno(bigint, numeric, text, numeric, numeric, integer, text) from public, anon;
grant execute on function public.finalizar_servico_do_turno(bigint, numeric, text, numeric, numeric, integer, text) to authenticated;

-- ------------------------------------------------------------------ consulta do administrador
-- Turnos do periodo (pela data do turno), com os servicos de cada um. As contas
-- de km ficam na tela, num lugar so e testado; aqui so os dados.
create or replace function public.km_dos_turnos(
    p_inicio date, p_fim date, p_motorista_id bigint default null, p_veiculo_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
    perform public.exigir_administrador();
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'dataTurno', t.data_turno, 'situacao', t.situacao,
        'motoristaId', t.motorista_id, 'socorrista', m.nome,
        'veiculoId', t.veiculo_id, 'viatura', coalesce(nullif(btrim(v.sigla_porto), ''), v.identificacao),
        'abertoEm', t.aberto_em, 'fechadoEm', t.fechado_em,
        'kmInicial', t.hodometro_inicial, 'kmFinal', t.hodometro_final,
        'servicos', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', s.id, 'numeroOs', s.numero_os, 'km', s.km,
                'kmInicial', s.km_inicial, 'kmFinal', s.km_final,
                'iniciadoEm', s.iniciado_em, 'finalizadoEm', s.finalizado_em,
                'fotoInicio', s.foto_inicio, 'fotoFim', s.foto_fim,
                'inicioLatitude', s.inicio_latitude, 'inicioLongitude', s.inicio_longitude,
                'inicioPrecisaoM', s.inicio_precisao_m, 'inicioSemLocal', s.inicio_sem_local,
                'fimLatitude', s.fim_latitude, 'fimLongitude', s.fim_longitude,
                'fimPrecisaoM', s.fim_precisao_m, 'fimSemLocal', s.fim_sem_local
            ) order by coalesce(s.iniciado_em, s.criado_em), s.id)
              from public.servicos_do_turno s where s.turno_id = t.id), '[]'::jsonb)
    ) order by t.data_turno desc, t.aberto_em desc), '[]'::jsonb) into v
      from public.turnos t
      join public.motoristas m on m.id = t.motorista_id
      join public.veiculos v on v.id = t.veiculo_id
     where t.data_turno between p_inicio and p_fim
       and (p_motorista_id is null or t.motorista_id = p_motorista_id)
       and (p_veiculo_id is null or t.veiculo_id = p_veiculo_id);
    return v;
end;
$$;
revoke execute on function public.km_dos_turnos(date, date, bigint, bigint) from public, anon;
grant execute on function public.km_dos_turnos(date, date, bigint, bigint) to authenticated;
