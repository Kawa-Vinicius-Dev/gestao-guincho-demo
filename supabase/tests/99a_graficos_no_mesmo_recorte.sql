-- A aba Graficos (antigo Painel Porto) conta o mesmo que a lista de OS e a
-- Visao geral, no modo do seletor. Antes eram quatro regras de data na mesma
-- chamada.
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}');
insert into public.motoristas (nome) values ('DJALMA');

-- Ids gerados na ordem: OP 1; OS 1 a 3.
insert into public.ordens_pagamento_porto (numero, valor_total, periodo_inicio, periodo_fim)
 values ('06438807', 300, '2026-09-01', '2026-09-16');
insert into public.ordens_servico_porto (numero, numero_normalizado, ordem_pagamento_id, valor_total,
  data_atendimento, motorista_id, sigla_viatura, status_financeiro) values
 -- Atrasada: atendida em 28/08, paga na OP de 01/09 a 16/09.
 ('OS-A', 'OSA', 1, 100, '2026-08-28', 1, 'K85', 'RECEBIDO'),
 ('OS-B', 'OSB', 1, 200, '2026-09-07', 1, null,  'RECEBIDO'),
 ('OS-C', 'OSC', null, 0, '2026-09-07', null, 'K85', 'AGUARDANDO_OP');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== Pela competencia (periodo da OP) ====='
select pg_temp.checar('servicos da quinzena = os da lista de OS',
  (public.porto_dashboard_alto_nivel('2026-09-01', '2026-09-16', 'DIA', true) ->> 'quantidadeTotalServicos'),
  (public.porto_listar_os('2026-09-01', '2026-09-16', p_por_competencia => true) ->> 'total'));
select pg_temp.checar('e a Visao geral conta igual',
  (public.porto_dashboard_alto_nivel('2026-09-01', '2026-09-16', 'DIA', true) ->> 'quantidadeTotalServicos'),
  (public.dashboard_financeiro('2026-09-01', '2026-09-16', true) ->> 'servicosDoPeriodo'));
select pg_temp.checar('a OP da quinzena aparece',
  (public.porto_dashboard_alto_nivel('2026-09-01', '2026-09-16', 'DIA', true) ->> 'quantidadeTotalOps'), '1');

\echo '===== Pela data (De-ate) ====='
select pg_temp.checar('07/09: os dois servicos daquele dia',
  (public.porto_dashboard_alto_nivel('2026-09-07', '2026-09-07', 'DIA', false) ->> 'quantidadeTotalServicos'), '2');
select pg_temp.checar('e a lista de OS do dia conta igual',
  (public.porto_listar_os('2026-09-07', '2026-09-07') ->> 'total'), '2');
select pg_temp.checar('a OP que pagou servico do dia entra nas OPs do recorte',
  (public.porto_dashboard_alto_nivel('2026-09-07', '2026-09-07', 'DIA', false) ->> 'quantidadeTotalOps'), '1');
select pg_temp.checar('OS sem dono do recorte: 1 sem socorrista, 1 sem viatura',
  (public.porto_dashboard_alto_nivel('2026-09-07', '2026-09-07', 'DIA', false) -> 'pendenciasVinculo' ->> 'semSocorrista')
  || '/' ||
  (public.porto_dashboard_alto_nivel('2026-09-07', '2026-09-07', 'DIA', false) -> 'pendenciasVinculo' ->> 'semViatura'), '1/1');

\echo '===== O faturamento saiu daqui ====='
select pg_temp.checar('faturamento por socorrista vem vazio (esta na Visao geral)',
  (public.porto_dashboard_alto_nivel('2026-09-01', '2026-09-16') ->> 'faturamentoPorSocorrista'), '[]');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
