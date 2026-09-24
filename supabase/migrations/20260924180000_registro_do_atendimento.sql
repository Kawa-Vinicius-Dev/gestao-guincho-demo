-- Registro do atendimento no celular: prova para contestar a Porto.
--
-- Kawa, 24/09/2026 (melhorias depois da comparacao com o AutEM): no local, o
-- socorrista digita o numero da OS (ele tem no app da Porto), marca a chegada,
-- fotografa o veiculo do segurado antes e depois e colhe a assinatura. Quando a
-- OS chega pelo diario/OP, o registro se junta a ela pelo numero normalizado.
--
-- Banco leve: fotos e assinatura vao para o Storage (bucket `comprovantes`,
-- pasta atendimentos/<id>/), comprimidas no celular; aqui fica so o caminho. Elas
-- saem quando a OS ja esta paga numa OP e nao ha contestacao aberta, ou depois de
-- 120 dias (a janela de cobranca das contestacoes).
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

create table if not exists public.atendimentos (
    id bigint generated always as identity primary key,
    motorista_id bigint not null references public.motoristas (id) on delete restrict,
    turno_id bigint references public.turnos (id) on delete set null,
    veiculo_id bigint references public.veiculos (id) on delete set null,
    -- Como o socorrista digitou, e so os digitos na forma da importacao (junta com a OS).
    numero_os text not null,
    numero_normalizado text not null,
    placa_segurado text,
    chegada_em timestamptz not null,
    -- {"antes": [caminhos], "depois": [caminhos]}
    fotos jsonb not null default '{"antes": [], "depois": []}'::jsonb,
    assinatura text,
    nome_assinante text,
    observacao text,
    arquivos_apagados_em timestamptz,
    criado_em timestamptz not null default now(),
    constraint atendimentos_numero_nao_vazio check (length(btrim(numero_normalizado)) > 0)
);
create index if not exists atendimentos_por_os on public.atendimentos (numero_normalizado);
create index if not exists atendimentos_por_motorista on public.atendimentos (motorista_id, chegada_em desc);
comment on table public.atendimentos is
    'Prova do atendimento colhida no local (chegada, fotos, assinatura). Arquivos no Storage; aqui so os caminhos.';

alter table public.atendimentos enable row level security;
grant select on public.atendimentos to authenticated;
drop policy if exists atendimentos_leitura on public.atendimentos;
create policy atendimentos_leitura on public.atendimentos
    for select to authenticated
    using ((select public.e_administrador()) or motorista_id = (select public.motorista_atual()));

-- ---------------------------------------------------------------- escrita pelo socorrista
-- Cria o registro (o id vai no caminho dos arquivos); os arquivos sobem depois.
create or replace function public.registrar_atendimento(
    p_numero_os text, p_numero_normalizado text, p_chegada_em timestamptz,
    p_placa text default null, p_nome_assinante text default null, p_observacao text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_motorista bigint := public.exigir_socorrista();
    v_turno public.turnos;
    v_id bigint;
begin
    if length(btrim(coalesce(p_numero_normalizado, ''))) = 0 then
        raise exception 'Informe o número da OS.' using errcode = 'invalid_parameter_value';
    end if;
    if p_chegada_em is null or p_chegada_em > now() + interval '10 minutes' then
        raise exception 'Hora de chegada inválida.' using errcode = 'invalid_parameter_value';
    end if;

    select * into v_turno from public.turnos
     where motorista_id = v_motorista and situacao = 'ABERTO'
     order by aberto_em desc limit 1;

    insert into public.atendimentos (motorista_id, turno_id, veiculo_id, numero_os, numero_normalizado,
                                     placa_segurado, chegada_em, nome_assinante, observacao)
    values (v_motorista, v_turno.id, v_turno.veiculo_id, btrim(p_numero_os), btrim(p_numero_normalizado),
            nullif(upper(regexp_replace(coalesce(p_placa, ''), '[^0-9A-Za-z]', '', 'g')), ''),
            p_chegada_em, nullif(btrim(coalesce(p_nome_assinante, '')), ''), nullif(btrim(coalesce(p_observacao, '')), ''))
    returning id into v_id;
    return v_id;
end;
$$;
revoke execute on function public.registrar_atendimento(text, text, timestamptz, text, text, text) from public, anon;
grant execute on function public.registrar_atendimento(text, text, timestamptz, text, text, text) to authenticated;

-- Grava os caminhos dos arquivos ja enviados (so os da pasta do proprio registro).
create or replace function public.anexar_arquivos_atendimento(p_id bigint, p_fotos jsonb, p_assinatura text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_motorista bigint := public.exigir_socorrista();
    v_pasta text := 'atendimentos/' || p_id || '/';
    v_caminho text;
begin
    perform 1 from public.atendimentos where id = p_id and motorista_id = v_motorista;
    if not found then
        raise exception 'Atendimento não encontrado.' using errcode = 'invalid_parameter_value';
    end if;
    for v_caminho in
        select value from jsonb_array_elements_text(coalesce(p_fotos -> 'antes', '[]'::jsonb))
        union all select value from jsonb_array_elements_text(coalesce(p_fotos -> 'depois', '[]'::jsonb))
        union all select p_assinatura where p_assinatura is not null
    loop
        if v_caminho not like v_pasta || '%' then
            raise exception 'Arquivo fora da pasta do atendimento.' using errcode = 'invalid_parameter_value';
        end if;
    end loop;
    update public.atendimentos
       set fotos = jsonb_build_object('antes', coalesce(p_fotos -> 'antes', '[]'::jsonb),
                                      'depois', coalesce(p_fotos -> 'depois', '[]'::jsonb)),
           assinatura = coalesce(p_assinatura, assinatura)
     where id = p_id;
end;
$$;
revoke execute on function public.anexar_arquivos_atendimento(bigint, jsonb, text) from public, anon;
grant execute on function public.anexar_arquivos_atendimento(bigint, jsonb, text) to authenticated;

-- ---------------------------------------------------------------- Storage
create or replace function public.atendimento_do_caminho(p_caminho text)
returns bigint language sql immutable set search_path = '' as $$
    select case when p_caminho like 'atendimentos/%' and split_part(p_caminho, '/', 2) ~ '^[0-9]+$'
                then split_part(p_caminho, '/', 2)::bigint end
$$;

drop policy if exists atendimentos_arquivos_leitura on storage.objects;
create policy atendimentos_arquivos_leitura on storage.objects
    for select to authenticated
    using (
        bucket_id = 'comprovantes' and name like 'atendimentos/%'
        and ((select public.e_administrador())
             or exists (select 1 from public.atendimentos a
                         where a.id = public.atendimento_do_caminho(name)
                           and a.motorista_id = (select public.motorista_atual())))
    );

drop policy if exists atendimentos_arquivos_envio on storage.objects;
create policy atendimentos_arquivos_envio on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'comprovantes' and name like 'atendimentos/%'
        and exists (select 1 from public.atendimentos a
                     where a.id = public.atendimento_do_caminho(name)
                       and a.motorista_id = (select public.motorista_atual())
                       and a.criado_em > now() - interval '1 day')
    );

-- ---------------------------------------------------------------- administrador
-- Os atendimentos com a OS que ja chegou (pelo numero), para a tela e as contestacoes.
create or replace function public.atendimentos_registrados(p_inicio date, p_fim date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
    perform public.exigir_administrador();
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', a.id, 'numeroOs', a.numero_os, 'numeroNormalizado', a.numero_normalizado,
            'chegadaEm', a.chegada_em, 'placa', a.placa_segurado,
            'motoristaId', a.motorista_id, 'motorista', m.nome, 'viatura', v.identificacao,
            'fotos', a.fotos, 'assinatura', a.assinatura, 'nomeAssinante', a.nome_assinante,
            'observacao', a.observacao, 'arquivosApagados', a.arquivos_apagados_em is not null,
            'osId', os.id, 'dataAtendimento', os.data_atendimento, 'especialidade', os.especialidade,
            'numeroOp', op.numero
        ) order by a.chegada_em desc)
        from public.atendimentos a
        join public.motoristas m on m.id = a.motorista_id
        left join public.veiculos v on v.id = a.veiculo_id
        left join lateral (
            select o.* from public.ordens_servico_porto o where o.numero_normalizado = a.numero_normalizado
             order by o.id desc limit 1
        ) os on true
        left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
        where a.chegada_em::date between p_inicio and p_fim
    ), '[]'::jsonb);
end;
$$;
revoke execute on function public.atendimentos_registrados(date, date) from public, anon;
grant execute on function public.atendimentos_registrados(date, date) to authenticated;

-- Arquivos que ja podem sair: OS paga numa OP e sem contestacao aberta, ou 120 dias.
create or replace function public.atendimentos_para_apagar()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
    perform public.exigir_administrador();
    return coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'caminhos', (
            select coalesce(jsonb_agg(c), '[]'::jsonb) from (
                select value as c from jsonb_array_elements_text(coalesce(a.fotos -> 'antes', '[]'::jsonb))
                union all select value from jsonb_array_elements_text(coalesce(a.fotos -> 'depois', '[]'::jsonb))
                union all select a.assinatura where a.assinatura is not null
            ) t)))
        from public.atendimentos a
        where a.arquivos_apagados_em is null
          and (a.chegada_em < now() - interval '120 days'
               or exists (
                   select 1 from public.ordens_servico_porto o
                    where o.numero_normalizado = a.numero_normalizado and o.ordem_pagamento_id is not null
                      and not exists (select 1 from public.porto_contestacoes c
                                       where c.os_id = o.id and c.situacao in ('A_CONTESTAR', 'CONTESTADA'))
                      and a.chegada_em < now() - interval '15 days'))
    ), '[]'::jsonb);
end;
$$;
revoke execute on function public.atendimentos_para_apagar() from public, anon;
grant execute on function public.atendimentos_para_apagar() to authenticated;

create or replace function public.marcar_atendimentos_apagados(p_ids bigint[])
returns void language plpgsql security definer set search_path = '' as $$
begin
    perform public.exigir_administrador();
    update public.atendimentos set arquivos_apagados_em = now() where id = any(p_ids) and arquivos_apagados_em is null;
end;
$$;
revoke execute on function public.marcar_atendimentos_apagados(bigint[]) from public, anon;
grant execute on function public.marcar_atendimentos_apagados(bigint[]) to authenticated;
