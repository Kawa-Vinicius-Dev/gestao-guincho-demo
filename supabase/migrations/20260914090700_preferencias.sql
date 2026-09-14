-- Preferencias de quem usa o sistema.

-- Atalhos que a pessoa fixou no menu lateral. Sao dela e de mais ninguem.
create table public.favoritos_menu (
    id bigint generated always as identity primary key,
    perfil_id uuid not null references public.perfis (id) on delete cascade,
    rota text not null,
    ordem integer not null default 0,
    criado_em timestamptz not null default now(),
    constraint favoritos_menu_rota_nao_vazia check (length(btrim(rota)) > 0),
    constraint favoritos_menu_rota_interna check (rota like '/%')
);

create unique index favoritos_menu_rota_unica_por_pessoa
    on public.favoritos_menu (perfil_id, rota);
