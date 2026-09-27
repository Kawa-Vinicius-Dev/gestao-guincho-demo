-- Avisos no celular (Web Push).
--
-- Cada linha e um aparelho que aceitou receber avisos: o navegador entrega o
-- endpoint e as duas chaves, e a Edge Function `avisos` usa isso para mandar a
-- notificacao. A mesma pessoa pode ter mais de um aparelho.
--
-- Quem grava e a propria pessoa, pela tela; quem le para enviar e a Edge
-- Function, com a service_role. Ninguem enxerga o aparelho de outra pessoa.

create table public.inscricoes_de_aviso (
    id bigint generated always as identity primary key,
    usuario_id uuid not null default auth.uid() references public.perfis (id) on delete cascade,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    criado_em timestamptz not null default now()
);

create index inscricoes_de_aviso_usuario on public.inscricoes_de_aviso (usuario_id);

alter table public.inscricoes_de_aviso enable row level security;

create policy inscricoes_de_aviso_proprias on public.inscricoes_de_aviso
    for all to authenticated
    using (usuario_id = (select auth.uid()))
    with check (usuario_id = (select auth.uid()) and public.e_operador());

grant select, insert, update, delete on public.inscricoes_de_aviso to authenticated;
