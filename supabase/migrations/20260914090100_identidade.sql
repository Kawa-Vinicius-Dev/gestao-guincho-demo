-- Identidade: Supabase Auth manda, `perfis` complementa.
--
-- A tabela `usuarios` do esquema antigo guardava email, senha_hash, perfil e um
-- token de sessao numa tabela `sessoes`. Senha e sessao saem inteiras: quem faz
-- isso agora e o Supabase Auth. O que sobra e o que o Auth nao sabe — o nome
-- exibido, o perfil de acesso e o "esta senha e provisoria" — e isso vive aqui,
-- com a mesma chave de auth.users.
--
-- O id e uuid, nao bigint: e a chave que o JWT carrega. Todas as FKs de usuario
-- (criou a despesa, aprovou, pagou a comissao) apontam para ca.

create table public.perfis (
    id uuid primary key references auth.users (id) on delete cascade,
    nome text not null,
    email text not null,
    perfil public.perfil_usuario not null default 'FUNCIONARIO',
    ativo boolean not null default true,
    -- Enquanto verdadeiro o frontend so deixa abrir /trocar-senha. Nao e uma regra
    -- de tela: as policies de escrita tambem recusam quem esta nesse estado.
    senha_provisoria boolean not null default false,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint perfis_nome_nao_vazio check (length(btrim(nome)) > 0),
    constraint perfis_email_nao_vazio check (length(btrim(email)) > 0)
);

comment on table public.perfis is
    'Dados de acesso que o Supabase Auth nao guarda. 1:1 com auth.users.';

-- Email unico e case-insensitive: o login antigo normalizava para minusculas antes
-- de comparar, e duas contas "Joao@" e "joao@" seriam a mesma pessoa com dois perfis.
create unique index perfis_email_unico on public.perfis (lower(email));

-- ---------------------------------------------------------------------------
-- Utilitario de timestamp
-- ---------------------------------------------------------------------------

create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.atualizado_em := now();
    return new;
end;
$$;

create trigger perfis_atualizado_em
    before update on public.perfis
    for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- Funcoes de identidade usadas pelas policies
-- ---------------------------------------------------------------------------
--
-- Todas sao SECURITY DEFINER de proposito. Uma policy de `perfis` que consultasse
-- `perfis` entraria em recursao infinita; definer le a tabela sem reaplicar RLS e
-- corta o ciclo. Sao STABLE para o planejador chamar uma vez por consulta, e tem
-- search_path travado para nao serem sequestradas por um schema no caminho.

create or replace function public.perfil_atual()
returns public.perfil_usuario
language sql
stable
security definer
set search_path = ''
as $$
    select p.perfil
    from public.perfis p
    where p.id = (select auth.uid())
      and p.ativo
$$;

comment on function public.perfil_atual() is
    'Perfil de quem esta chamando, ou null se nao autenticado/inativo.';

create or replace function public.e_administrador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(public.perfil_atual() = 'ADMINISTRADOR', false)
$$;

-- Usuario ativo e com a senha ja trocada. As policias de escrita exigem isto:
-- esconder a tela de quem esta com senha provisoria nao impede um POST na API.
create or replace function public.e_operador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.perfis p
        where p.id = (select auth.uid())
          and p.ativo
          and not p.senha_provisoria
    )
$$;

-- ---------------------------------------------------------------------------
-- Provisionamento
-- ---------------------------------------------------------------------------
--
-- Criar o usuario no Auth e criar o perfil sao dois passos; se o segundo ficar
-- para o cliente, um erro de rede deixa uma conta que entra no sistema e nao tem
-- perfil — e sem perfil nenhuma policy libera nada, entao a pessoa fica presa numa
-- tela vazia sem mensagem. O trigger fecha os dois no mesmo commit do Auth.
--
-- O perfil sai de raw_user_meta_data, preenchido por quem cria a conta (a Edge
-- Function administrativa). Sem metadata, entra como FUNCIONARIO: o padrao precisa
-- ser o menor privilegio, nunca administrador.

create or replace function public.provisionar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.perfis (id, nome, email, perfil, senha_provisoria)
    values (
        new.id,
        coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
        new.email,
        coalesce((new.raw_user_meta_data ->> 'perfil')::public.perfil_usuario, 'FUNCIONARIO'),
        coalesce((new.raw_user_meta_data ->> 'senha_provisoria')::boolean, false)
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger provisionar_perfil_ao_criar_usuario
    after insert on auth.users
    for each row execute function public.provisionar_perfil();

-- O email de verdade mora em auth.users; a copia em `perfis` existe so para a
-- listagem de usuarios nao precisar de um join com um schema protegido.
create or replace function public.sincronizar_email_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.email is distinct from old.email then
        update public.perfis set email = new.email where id = new.id;
    end if;
    return new;
end;
$$;

create trigger sincronizar_email_perfil_ao_atualizar
    after update of email on auth.users
    for each row execute function public.sincronizar_email_perfil();
