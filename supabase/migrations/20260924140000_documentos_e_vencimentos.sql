-- Vencimentos do credenciamento: documentos das viaturas e dos socorristas.
--
-- Kawa, 24/09/2026 (melhorias depois da comparacao com o AutEM): documento
-- vencido pode tirar a viatura ou o socorrista do acionamento da Porto. O
-- sistema guarda a validade de cada um e avisa 30 dias antes.
--
-- So a data e o que e: o arquivo do documento nao e guardado (banco leve).
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

create table if not exists public.documentos (
    id bigint generated always as identity primary key,
    -- De quem e: uma viatura ou um socorrista, nunca os dois.
    veiculo_id bigint references public.veiculos (id) on delete cascade,
    motorista_id bigint references public.motoristas (id) on delete cascade,
    -- CRLV, Seguro, Tacografo, CNH, Curso Porto... texto livre, com sugestoes na tela.
    tipo text not null,
    vence_em date not null,
    observacao text,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint documentos_de_um_dono check ((veiculo_id is null) <> (motorista_id is null)),
    constraint documentos_tipo_nao_vazio check (length(btrim(tipo)) > 0)
);
create index if not exists documentos_por_vencimento on public.documentos (vence_em);
comment on table public.documentos is
    'Validade dos documentos das viaturas e dos socorristas. So a data: o arquivo nao fica no sistema.';

alter table public.documentos enable row level security;
grant select, insert, update, delete on public.documentos to authenticated;
drop policy if exists documentos_admin on public.documentos;
create policy documentos_admin on public.documentos
    for all to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));

create or replace function public.documentos_atualizado_em()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.atualizado_em := now();
    return new;
end;
$$;
drop trigger if exists documentos_atualizado_em on public.documentos;
create trigger documentos_atualizado_em before update on public.documentos
    for each row execute function public.documentos_atualizado_em();
