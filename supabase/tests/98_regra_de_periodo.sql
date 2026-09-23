-- Regra de periodo (Kawa, 23/09/2026): o mesmo recorte em toda tela.
--
--  - A quinzena comeca na data que a Porto declara (01/09), nao no dia seguinte
--    ao fechamento anterior (29/08).
--  - OS sem OP de um dia que sobra entre quinzenas (30/08) entra na seguinte.
--  - Pela competencia, a OS atrasada paga na OP de 01/09 a 16/09 (atendida em
--    28/08) conta nessa quinzena; pela data, conta em 28/08.
--  - Um dia filtrado pela data mostra os servicos e a receita daquele dia.
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','soc@t.local','{"nome":"Soc","perfil":"FUNCIONARIO"}');
insert into public.motoristas (nome) values ('DJALMA');
insert into public.veiculos (identificacao, sigla_porto) values ('K85', 'K85'), ('L999', null);

-- Ids gerados na ordem: OPs 1, 2 e 3; OS 1 a 5.
-- Quinzena anterior fecha em 28/08; as duas OPs da quinzena seguinte declaram
-- 01/09 a 16/09 (Taxi e Guincho), como as 06438807 e 06438808.
insert into public.ordens_pagamento_porto (numero, valor_total, periodo_inicio, periodo_fim) values
 ('06433185', 100, '2026-08-15', '2026-08-28'),
 ('06438807', 300, '2026-09-01', '2026-09-16'),
 ('06438808', 200, '2026-09-01', '2026-09-16');

insert into public.ordens_servico_porto (numero, numero_normalizado, ordem_pagamento_id, valor_total,
  data_atendimento, motorista_id, sigla_viatura, status_financeiro) values
 ('OS-A', 'OSA', 1, 100, '2026-08-20', 1, 'K85',  'RECEBIDO'),
 -- Atrasada: atendida em 28/08, paga na OP de 01/09 a 16/09.
 ('OS-B', 'OSB', 2, 150, '2026-08-28', 1, 'K85',  'RECEBIDO'),
 ('OS-C', 'OSC', 2, 150, '2026-09-07', 1, 'K85',  'RECEBIDO'),
 -- Viatura sem sigla da Porto: casa pela identificacao.
 ('OS-D', 'OSD', 3, 200, '2026-09-07', 1, 'L999', 'RECEBIDO'),
 -- Sem OP, num dia que sobra entre as quinzenas.
 ('OS-E', 'OSE', null, 0, '2026-08-30', 1, null, 'AGUARDANDO_OP');

-- A receita de cada OS paga nasce no fim da OP.
insert into public.receitas (descricao, valor, data_competencia, status, data_recebimento, ordem_servico_porto_id) values
 ('OS-A', 100, '2026-08-28', 'RECEBIDA', '2026-08-28', 1),
 ('OS-B', 150, '2026-09-16', 'RECEBIDA', '2026-09-16', 2),
 ('OS-C', 150, '2026-09-16', 'RECEBIDA', '2026-09-16', 3),
 ('OS-D', 200, '2026-09-16', 'RECEBIDA', '2026-09-16', 4);

\echo '===== Quinzena: a data que a Porto declara ====='
select pg_temp.checar('a quinzena das duas OPs comeca em 01/09, e nao em 29/08',
  (select inicio::text from public.porto_competencias() where fim = '2026-09-16'), '2026-09-01');
select pg_temp.checar('as duas OPs estao na mesma quinzena',
  (select array_length(op_ids, 1)::text from public.porto_competencias() where fim = '2026-09-16'), '2');

\echo '===== OS do dia que sobra entre quinzenas ====='
select pg_temp.checar('a OS de 30/08 sem OP tem competencia (nao fica sem quinzena)',
  (select (competencia_fim is not null)::text from public.porto_os_situacao() where os_id = 5), 'true');
select pg_temp.checar('e aguarda a proxima OP, projetada depois de 16/09',
  (select situacao || ' ' || (competencia_fim > '2026-09-16')::text from public.porto_os_situacao() where os_id = 5),
  'AGUARDANDO_PROXIMA_OP true');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== Seletor: as quinzenas vem do banco, com os numeros ====='
select pg_temp.checar('a quinzena lista as duas OPs pelo numero',
  (select array_to_string(op_numeros, ',') from public.porto_periodos() where fim = '2026-09-16'), '06438807,06438808');

\echo '===== Periodo da OP: pela competencia ====='
select pg_temp.checar('a atrasada de 28/08 conta na quinzena da OP que a pagou',
  (public.dashboard_financeiro('2026-09-01', '2026-09-16', true) ->> 'servicosDoPeriodo'), '3');
select pg_temp.checar('a receita da quinzena e a das OPs dela',
  (public.dashboard_financeiro('2026-09-01', '2026-09-16', true) ->> 'receitaRecebida'), '500.00');
select pg_temp.checar('a Visao geral e a lista de OS contam igual',
  (public.porto_listar_os('2026-09-01', '2026-09-16', p_por_competencia => true) ->> 'total'),
  (public.dashboard_financeiro('2026-09-01', '2026-09-16', true) ->> 'servicosDoPeriodo'));

\echo '===== Um dia, pela data do servico ====='
select pg_temp.checar('07/09 mostra os servicos daquele dia',
  (public.dashboard_financeiro('2026-09-07', '2026-09-07', false) ->> 'servicosDoPeriodo'), '2');
select pg_temp.checar('e a receita deles, embora lancada no fim da OP',
  (public.dashboard_financeiro('2026-09-07', '2026-09-07', false) ->> 'receitaRecebida'), '350.00');
select pg_temp.checar('a lista de OS do dia bate com a Visao geral',
  (public.porto_listar_os('2026-09-07', '2026-09-07') ->> 'total'),
  (public.dashboard_financeiro('2026-09-07', '2026-09-07', false) ->> 'servicosDoPeriodo'));
select pg_temp.checar('pela competencia, o mesmo dia nao tem servico (a OP fecha em 16/09)',
  (public.dashboard_financeiro('2026-09-07', '2026-09-07', true) ->> 'servicosDoPeriodo'), '0');

\echo '===== Viatura: sigla da Porto, senao identificacao ====='
select pg_temp.checar('a viatura sem sigla recebe a OS pela identificacao',
  (select r ->> 'receitas' from jsonb_array_elements(
     public.dashboard_financeiro('2026-09-01', '2026-09-16', true) -> 'resultadoPorVeiculo') r
    where r ->> 'veiculo' = 'L999'), '200.00');

\echo '===== Chamada sem o modo continua pela competencia ====='
select pg_temp.checar('dashboard_financeiro(inicio, fim) = competencia',
  (public.dashboard_financeiro('2026-09-01', '2026-09-16') ->> 'servicosDoPeriodo'), '3');
select pg_temp.checar('dashboard_resumo repassa o modo',
  (public.dashboard_resumo('2026-09-07', '2026-09-07', false) -> 'financeiro' ->> 'servicosDoPeriodo'), '2');
reset role;

\echo '===== Socorrista nao le a lista de periodos ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
do $$ begin
  perform public.porto_periodos();
  raise exception 'FALHOU  | socorrista leu os periodos';
exception when insufficient_privilege or raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSOU  | socorrista e recusado';
end $$;
reset role;

\echo 'TODOS OS TESTES PASSARAM'
