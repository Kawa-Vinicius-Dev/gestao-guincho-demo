-- Manutencao por quilometragem e danos do checklist como pendencia da viatura.
--
-- Kawa, 24/09/2026 (melhorias depois da comparacao com o AutEM):
--  * o odometro dos turnos ja existe; com um intervalo por item (oleo, pneus,
--    revisao) o sistema avisa quando a viatura chega perto da troca;
--  * o dano marcado no checklist aparecia so em Aprovacoes e se perdia depois:
--    agora vira uma pendencia da viatura ate alguem resolver.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

-- ---------------------------------------------------------------- km atual
-- O maior odometro ja apontado da viatura: turnos (saida e chegada) e quilometragem.
create or replace function public.km_atual_da_viatura(p_veiculo_id bigint)
returns numeric language sql stable security definer set search_path = '' as $$
    select greatest(
        (select max(greatest(t.hodometro_inicial, coalesce(t.hodometro_final, 0))) from public.turnos t where t.veiculo_id = p_veiculo_id),
        (select max(q.hodometro_final) from public.quilometragens q where q.veiculo_id = p_veiculo_id))
$$;

-- ---------------------------------------------------------------- planos
create table if not exists public.manutencao_planos (
    id bigint generated always as identity primary key,
    veiculo_id bigint not null references public.veiculos (id) on delete cascade,
    -- Troca de oleo, Pneus, Revisao, Correia... texto livre, com sugestoes na tela.
    item text not null,
    intervalo_km integer not null,
    -- Odometro e data da ultima vez que foi feito.
    ultimo_km numeric(12, 2) not null default 0,
    ultima_data date,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint manutencao_planos_intervalo_positivo check (intervalo_km > 0),
    constraint manutencao_planos_item_nao_vazio check (length(btrim(item)) > 0)
);
create unique index if not exists manutencao_planos_um_item_por_viatura
    on public.manutencao_planos (veiculo_id, upper(btrim(item)));
comment on table public.manutencao_planos is
    'De quantos em quantos km cada item da viatura e trocado, e quando foi a ultima vez.';

alter table public.manutencao_planos enable row level security;
grant select, insert, update, delete on public.manutencao_planos to authenticated;
drop policy if exists manutencao_planos_admin on public.manutencao_planos;
create policy manutencao_planos_admin on public.manutencao_planos
    for all to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));

-- A situacao de cada plano: quantos km rodou desde a ultima troca e quantos faltam.
create or replace function public.manutencao_da_frota()
returns table(id bigint, veiculo_id bigint, viatura text, item text, intervalo_km integer,
              ultimo_km numeric, ultima_data date, km_atual numeric, faltam_km numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
    perform public.exigir_administrador();
    return query
    select p.id, p.veiculo_id, v.identificacao, p.item, p.intervalo_km, p.ultimo_km, p.ultima_data,
           k.km, p.intervalo_km - (coalesce(k.km, p.ultimo_km) - p.ultimo_km)
      from public.manutencao_planos p
      join public.veiculos v on v.id = p.veiculo_id
      cross join lateral (select public.km_atual_da_viatura(p.veiculo_id) as km) k
     order by p.intervalo_km - (coalesce(k.km, p.ultimo_km) - p.ultimo_km), v.identificacao, p.item;
end;
$$;
revoke execute on function public.manutencao_da_frota() from public, anon;
grant execute on function public.manutencao_da_frota() to authenticated;

-- Para preencher o "ultimo km" sem adivinhar: o km atual da viatura.
create or replace function public.km_atual_das_viaturas()
returns table(veiculo_id bigint, km_atual numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
    perform public.exigir_administrador();
    return query select v.id, public.km_atual_da_viatura(v.id) from public.veiculos v where v.ativo;
end;
$$;
revoke execute on function public.km_atual_das_viaturas() from public, anon;
grant execute on function public.km_atual_das_viaturas() to authenticated;

-- ---------------------------------------------------------------- danos
create table if not exists public.viatura_danos (
    id bigint generated always as identity primary key,
    veiculo_id bigint not null references public.veiculos (id) on delete cascade,
    -- De onde veio: o turno do checklist (com o socorrista) ou lancado a mao.
    turno_id bigint references public.turnos (id) on delete set null,
    motorista_id bigint references public.motoristas (id) on delete set null,
    descricao text not null,
    visto_em date not null default current_date,
    resolvido_em date,
    observacao text,
    criado_em timestamptz not null default now(),
    constraint viatura_danos_descricao_nao_vazia check (length(btrim(descricao)) > 0)
);
create index if not exists viatura_danos_abertos on public.viatura_danos (veiculo_id) where resolvido_em is null;
comment on table public.viatura_danos is
    'Dano visto na viatura (pelo checklist do turno ou a mao), aberto ate alguem marcar como resolvido.';

alter table public.viatura_danos enable row level security;
grant select, insert, update, delete on public.viatura_danos to authenticated;
drop policy if exists viatura_danos_admin on public.viatura_danos;
create policy viatura_danos_admin on public.viatura_danos
    for all to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));

-- O checklist com dano abre a pendencia sozinho, uma por dano.
create or replace function public.checklist_abre_danos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.checklist is not null and old.checklist is null
       and jsonb_typeof(new.checklist -> 'danos') = 'array' then
        insert into public.viatura_danos (veiculo_id, turno_id, motorista_id, descricao, visto_em)
        select new.veiculo_id, new.id, new.motorista_id, btrim(d ->> 'descricao'), new.data_turno
          from jsonb_array_elements(new.checklist -> 'danos') d
         where length(btrim(coalesce(d ->> 'descricao', ''))) > 0;
    end if;
    return new;
end;
$$;
drop trigger if exists turnos_checklist_abre_danos on public.turnos;
create trigger turnos_checklist_abre_danos
    after update of checklist on public.turnos
    for each row execute function public.checklist_abre_danos();
