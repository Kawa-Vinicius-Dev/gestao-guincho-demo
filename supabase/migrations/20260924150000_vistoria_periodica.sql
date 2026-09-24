-- Vistoria periodica obrigatoria da Porto.
--
-- Manual de Frota da Porto (abril/2026, item 5): a vistoria e em meses fixos,
-- pelo final da placa — impar em janeiro, abril, julho e outubro; par em
-- fevereiro, maio, agosto e novembro. Fora do mes ou reprovada, a Porto pede nova
-- vistoria (48h para refazer; falta de item obrigatorio, 5 dias corridos), senao
-- bloqueia a viatura. Kawa pediu, em 24/09/2026, o aviso automatico.
--
-- O calendario sai da placa, na tela; aqui fica so o registro de cada vistoria
-- feita (uma por viatura por mes de vistoria), com o resultado.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

create table if not exists public.vistorias_periodicas (
    id bigint generated always as identity primary key,
    veiculo_id bigint not null references public.veiculos (id) on delete cascade,
    -- O mes de vistoria a que ela responde (sempre o dia 1).
    referencia date not null,
    feita_em date not null,
    resultado text not null default 'APROVADA',
    observacao text,
    criado_em timestamptz not null default now(),
    constraint vistorias_periodicas_resultado_valido check (resultado in ('APROVADA', 'REPROVADA')),
    constraint vistorias_periodicas_referencia_dia_1 check (extract(day from referencia) = 1),
    constraint vistorias_periodicas_uma_por_mes unique (veiculo_id, referencia)
);
comment on table public.vistorias_periodicas is
    'Vistoria periodica obrigatoria da Porto feita em cada mes de vistoria da viatura (calendario pelo final da placa).';

alter table public.vistorias_periodicas enable row level security;
grant select, insert, update, delete on public.vistorias_periodicas to authenticated;
drop policy if exists vistorias_periodicas_admin on public.vistorias_periodicas;
create policy vistorias_periodicas_admin on public.vistorias_periodicas
    for all to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));
