-- Km de cada servico, lancado pelo socorrista (Kawa, 24/09/2026).
--
-- O km que a Porto registra pelo GPS so aparece no acesso de gestor do portal,
-- nao num arquivo que de para importar. Entao o socorrista digita, pelo numero
-- da OS, o km do GPS de cada servico: da saida para o chamado ate a entrega do
-- veiculo. Divergencia grande o operador confere no sistema da Porto.
--
-- Nao passa por aprovacao: nao mexe em comissao nem em pagamento. A soma do
-- turno vira o km produtivo que a aprovacao do turno ja pedia (antes digitado
-- pelo administrador), e o km morto continua sendo o rodado menos o produtivo.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

create table if not exists public.servicos_do_turno (
    id bigint generated always as identity primary key,
    turno_id bigint not null references public.turnos (id) on delete cascade,
    numero_os text not null,
    -- O mesmo numero que a importacao da Porto grava: e por ele que o km se
    -- junta a OS quando ela chega.
    numero_normalizado text not null,
    km numeric(8, 1) not null,
    criado_em timestamptz not null default now(),
    constraint servicos_do_turno_km_valido check (km > 0 and km <= 2000),
    constraint servicos_do_turno_tem_numero check (length(btrim(numero_normalizado)) > 0),
    constraint servicos_do_turno_uma_vez unique (turno_id, numero_normalizado)
);

create index if not exists servicos_do_turno_por_os on public.servicos_do_turno (numero_normalizado);

comment on table public.servicos_do_turno is
    'Km do GPS de cada servico, digitado pelo socorrista durante o turno. A soma e o km produtivo do turno.';

-- Leitura: o socorrista ve os do proprio turno; o administrador, todos.
-- Escrita so pelas funcoes abaixo.
alter table public.servicos_do_turno enable row level security;
grant select on public.servicos_do_turno to authenticated;
drop policy if exists servicos_do_turno_leitura on public.servicos_do_turno;
create policy servicos_do_turno_leitura on public.servicos_do_turno
    for select to authenticated
    using (
        (select public.e_administrador())
        or exists (
            select 1 from public.turnos t
            where t.id = turno_id and t.motorista_id = (select public.motorista_atual()))
    );

-- Lanca no turno aberto. A mesma OS de novo corrige o km, em vez de duplicar.
create or replace function public.lancar_servico_do_turno(
    p_numero_os text, p_numero_normalizado text, p_km numeric
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_motorista bigint := public.exigir_socorrista();
    v_turno bigint;
    v_id bigint;
begin
    select t.id into v_turno from public.turnos t
     where t.motorista_id = v_motorista and t.situacao = 'ABERTO';
    if v_turno is null then
        raise exception 'Abra o turno para lançar os serviços.'
            using errcode = 'invalid_parameter_value';
    end if;

    if coalesce(btrim(p_numero_os), '') = '' or coalesce(btrim(p_numero_normalizado), '') = '' then
        raise exception 'Informe o número da OS.'
            using errcode = 'invalid_parameter_value';
    end if;

    if p_km is null or p_km <= 0 or p_km > 2000 then
        raise exception 'Informe os km do serviço (de 1 a 2000).'
            using errcode = 'invalid_parameter_value';
    end if;

    insert into public.servicos_do_turno (turno_id, numero_os, numero_normalizado, km)
    values (v_turno, btrim(p_numero_os), btrim(p_numero_normalizado), round(p_km, 1))
    on conflict (turno_id, numero_normalizado)
        do update set km = excluded.km, numero_os = excluded.numero_os
    returning id into v_id;

    return v_id;
end;
$$;

revoke execute on function public.lancar_servico_do_turno(text, text, numeric) from public, anon;
grant execute on function public.lancar_servico_do_turno(text, text, numeric) to authenticated;

-- Tirar: o socorrista, do proprio turno aberto; o administrador, de qualquer
-- turno ainda nao aprovado (aprovado, o km ja virou quilometragem da empresa).
create or replace function public.remover_servico_do_turno(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_situacao public.situacao_turno;
    v_dono bigint;
begin
    select t.situacao, t.motorista_id into v_situacao, v_dono
      from public.servicos_do_turno s
      join public.turnos t on t.id = s.turno_id
     where s.id = p_id;

    if not found then
        raise exception 'Serviço não encontrado.' using errcode = 'invalid_parameter_value';
    end if;

    if public.e_administrador() then
        if v_situacao = 'APROVADO' then
            raise exception 'O turno já foi aprovado: o km dele já está fechado.'
                using errcode = 'invalid_parameter_value';
        end if;
    elsif v_dono is distinct from public.motorista_atual() or v_situacao <> 'ABERTO' then
        raise exception 'Só dá para tirar serviço do seu turno aberto.'
            using errcode = 'insufficient_privilege';
    end if;

    delete from public.servicos_do_turno where id = p_id;
end;
$$;

revoke execute on function public.remover_servico_do_turno(bigint) from public, anon;
grant execute on function public.remover_servico_do_turno(bigint) to authenticated;
