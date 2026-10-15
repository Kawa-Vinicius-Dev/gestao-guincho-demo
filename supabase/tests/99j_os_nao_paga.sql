-- OS sem OP na quinzena dela (Kawa, 28/09/2026): "Nao paga", "Sem OP no
-- sistema", quinzenas provisorias no trecho sem OP e "aguardando" so o que ainda
-- pode vir numa OP.
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
insert into public.veiculos (identificacao, sigla_porto) values ('K85', 'K85');

-- Duas quinzenas com OP em maio, junho inteiro sem OP, e a primeira de julho.
insert into public.ordens_pagamento_porto (numero, valor_total, periodo_inicio, periodo_fim) values
 ('OP-MAI1', 0, '2026-05-01', '2026-05-15'),
 ('OP-MAI2', 100, '2026-05-16', '2026-05-31'),
 ('OP-JUL1', 0, '2026-07-01', '2026-07-15');

-- Ids na ordem: 1 a 6.
insert into public.ordens_servico_porto (numero, numero_normalizado, ordem_pagamento_id, valor_total,
  data_atendimento, motorista_id, sigla_viatura, valor_manual) values
 ('OS-PAGA',    'OSPAGA',    2, 100, '2026-05-20', 1, 'K85', null),
 -- A OP da quinzena dela veio sem ela, e as seguintes tambem.
 ('OS-NAOPAGA', 'OSNAOPAGA', null, 0, '2026-05-10', 1, 'K85', null),
 -- Junho nao tem OP nenhuma, e a de julho ja chegou.
 ('OS-LACUNA',  'OSLACUNA',  null, 0, '2026-06-10', 1, 'K85', null),
 -- A OP da quinzena dela veio sem ela; a seguinte ainda nao chegou.
 ('OS-ESPERA',  'OSESPERA',  null, 0, '2026-07-05', 1, 'K85', null),
 -- A quinzena dela ainda nao tem OP.
 ('OS-NOVA',    'OSNOVA',    null, 0, '2026-07-20', 1, 'K85', null),
 -- Nao paga com valor informado a mao e sem viatura.
 ('OS-MANUAL',  'OSMANUAL',  null, 0, '2026-05-12', 1, null, 300);

\echo '===== Quinzenas provisorias no trecho sem OP ====='
select pg_temp.checar('junho ganha duas quinzenas sem OP',
  (select string_agg(inicio || '/' || fim, ',' order by fim) from public.porto_competencias()
    where not tem_op and fim < '2026-07-01'), '2026-06-01/2026-06-15,2026-06-16/2026-06-30');
select pg_temp.checar('a quinzena de julho continua no inicio que a OP declara',
  (select inicio::text from public.porto_competencias() where fim = '2026-07-15'), '2026-07-01');

\echo '===== Situacao e quinzena de cada OS ====='
select pg_temp.checar('paga continua conciliada', (select situacao from public.porto_os_situacao() where os_id = 1), 'CONCILIADA');
select pg_temp.checar('nao paga fica na quinzena dela, e nao na atual',
  (select situacao || ' ' || competencia_inicio || ' ' || competencia_fim from public.porto_os_situacao() where os_id = 2),
  'NAO_PAGA 2026-05-01 2026-05-15');
select pg_temp.checar('quinzena sem OP nenhuma no sistema',
  (select situacao || ' ' || competencia_inicio || ' ' || competencia_fim from public.porto_os_situacao() where os_id = 3),
  'SEM_OP_NO_SISTEMA 2026-06-01 2026-06-15');
select pg_temp.checar('aguarda a proxima OP, projetada na quinzena seguinte',
  (select situacao || ' ' || competencia_inicio || ' ' || competencia_fim from public.porto_os_situacao() where os_id = 4),
  'AGUARDANDO_PROXIMA_OP 2026-07-16 2026-07-31');
select pg_temp.checar('quinzena sem OP ainda: aguarda analise',
  (select situacao || ' ' || competencia_inicio from public.porto_os_situacao() where os_id = 5),
  'AGUARDANDO_ANALISE 2026-07-16');
select pg_temp.checar('nao paga sai do valor previsto, mas nao fica sem valor',
  (select situacao || ' ' || coalesce(valor_previsto::text, 'nulo') || ' ' || sem_valor from public.porto_os_situacao() where os_id = 6),
  'NAO_PAGA nulo false');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== Contestacao: so a nao paga, nunca a sem OP no sistema ====='
select pg_temp.checar('duas nao pagas viram caso', public.porto_detectar_contestacoes('2026-07-20')::text, '2');
select pg_temp.checar('a da quinzena sem OP nao vira caso',
  (select count(*)::text from public.porto_contestacoes where os_id in (3, 4, 5)), '0');

\echo '===== Aguardando OP: so o que ainda pode vir ====='
select pg_temp.checar('filtro AGUARDANDO pega so as duas que esperam',
  (public.porto_listar_os('2026-05-01', '2026-07-31', p_situacao => 'AGUARDANDO', p_por_competencia => true) ->> 'total'), '2');
select pg_temp.checar('filtro pela situacao nova',
  (public.porto_listar_os('2026-05-01', '2026-07-31', p_situacao => 'NAO_PAGA', p_por_competencia => true) ->> 'total'), '2');
select pg_temp.checar('Graficos nao contam a nao paga como aguardando',
  (public.porto_dashboard_alto_nivel('2026-05-01', '2026-05-15', 'DIA', true) ->> 'quantidadeAguardandoOp'), '0');
select pg_temp.checar('comissao prevista so do que ainda pode vir',
  (select servicos::text from public.porto_comissao_prevista('2026-05-01', '2026-07-31')), '2');

\echo '===== Servico e servico: conta na quinzena dela ====='
select pg_temp.checar('as duas nao pagas contam como servico de 01 a 15/05',
  (public.dashboard_financeiro('2026-05-01', '2026-05-15', true) ->> 'servicosDoPeriodo'), '2');
select pg_temp.checar('e nao aguardam OP',
  (public.dashboard_financeiro('2026-05-01', '2026-05-15', true) ->> 'servicosPendentes'), '0');
select pg_temp.checar('a quinzena de 16 a 31/07 tem so as duas que esperam',
  (public.dashboard_financeiro('2026-07-16', '2026-07-31', true) ->> 'servicosPendentes'), '2');

\echo '===== Pendencias: so se faltar dado ====='
select pg_temp.checar('as duas nao pagas de maio aparecem (sem valor; sem viatura)',
  (select jsonb_array_length(public.porto_pendencias_os('2026-05-01', '2026-05-15', true))::text), '2');
select pg_temp.checar('a linha mostra o valor informado a mao',
  (select ((e ->> 'valorTotal')::numeric = 300)::text
     from jsonb_array_elements(public.porto_pendencias_os('2026-05-01', '2026-05-15', true)) e
    where e ->> 'numeroOs' = 'OS-MANUAL'), 'true');

\echo '===== Seletor de periodo continua so com as quinzenas com OP e a em andamento ====='
select pg_temp.checar('as provisorias de junho nao aparecem no seletor',
  (select count(*)::text from public.porto_periodos() where fim between '2026-06-01' and '2026-06-30'), '0');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
