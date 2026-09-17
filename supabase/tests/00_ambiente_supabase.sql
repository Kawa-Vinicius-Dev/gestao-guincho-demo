-- Emulacao minima do ambiente Supabase, so para validacao local.
-- Reproduz o contrato que as migrations usam: auth.users, auth.uid(), os papeis
-- anon/authenticated/service_role e o schema storage.

do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then
    create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then
    create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then
    create role service_role nologin noinherit bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema auth;
create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
grant usage on schema auth to anon, authenticated, service_role;

create or replace function auth.uid() returns uuid
language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;

create schema storage;
create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz not null default now()
);
create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets (id),
    name text not null,
    owner uuid,
    created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;

-- A publication que o Realtime usa. No Supabase ela ja vem criada; aqui nao, e
-- a migration que liga o tempo real nas tabelas de dinheiro parava com
-- "publication supabase_realtime does not exist" — derrubando todas as suites,
-- que aplicam as migrations antes de rodar. Nasce vazia, como la: sao as
-- migrations que dizem quais tabelas entram.
create publication supabase_realtime;
