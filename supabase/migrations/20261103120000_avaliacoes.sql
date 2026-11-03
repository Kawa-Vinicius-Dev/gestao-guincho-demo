-- Avaliacoes dos clientes (03/11/2026).
--
-- O cliente do guincho abre /avaliar, sem login, da uma nota de 1 a 5 e, se
-- quiser, deixa o nome, a placa e um comentario. So o administrador le.
--
-- A tabela nao tem policy nenhuma: ninguem le nem escreve direto. Visitante so
-- grava pela funcao `avaliar`, que valida tudo; o administrador so le por
-- `listar_avaliacoes`.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

create table if not exists public.avaliacoes (
    id bigint generated always as identity primary key,
    nota smallint not null check (nota between 1 and 5),
    nome text check (char_length(nome) <= 80),
    placa text check (char_length(placa) <= 10),
    comentario text check (char_length(comentario) <= 1000),
    criado_em timestamptz not null default now()
);
alter table public.avaliacoes enable row level security;
revoke all on table public.avaliacoes from public, anon, authenticated;

-- ponytail: sem trava contra envio repetido; se aparecer spam, limitar por
-- minuto aqui (contar as avaliacoes dos ultimos 60s) ou por captcha na tela.
create or replace function public.avaliar(p_nota int, p_nome text, p_placa text, p_comentario text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_nota is null or p_nota not between 1 and 5 then
        raise exception 'Escolha uma nota de 1 a 5.' using errcode = 'check_violation';
    end if;
    insert into public.avaliacoes (nota, nome, placa, comentario)
    values (
        p_nota,
        nullif(left(btrim(p_nome), 80), ''),
        nullif(upper(left(btrim(p_placa), 10)), ''),
        nullif(left(btrim(p_comentario), 1000), '')
    );
end;
$$;
revoke all on function public.avaliar(int, text, text, text) from public;
grant execute on function public.avaliar(int, text, text, text) to anon, authenticated;

create or replace function public.listar_avaliacoes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v jsonb;
begin
    perform public.exigir_administrador();
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'nota', a.nota, 'nome', a.nome, 'placa', a.placa,
        'comentario', a.comentario, 'criadoEm', a.criado_em
    ) order by a.criado_em desc), '[]'::jsonb) into v
      from public.avaliacoes a;
    return v;
end;
$$;
revoke all on function public.listar_avaliacoes() from public, anon;
grant execute on function public.listar_avaliacoes() to authenticated;
