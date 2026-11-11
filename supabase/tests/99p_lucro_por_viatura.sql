-- Lucro por viatura em SQL: mesmo resultado da tela da frota, com o rateio das
-- despesas gerais (aluguel, contador...) pela receita de cada viatura.
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','soc@t.local','{"nome":"Socorrista","perfil":"FUNCIONARIO"}');
insert into public.categorias (nome,tipo) values ('Combustível','DESPESA'),('Aluguel','DESPESA');
insert into public.veiculos (identificacao,placa,custo_por_km) values
 ('L168','AAA1A11',2.00),('L200','BBB2B22',3.00),('L300','CCC3C33',2.00);

-- Setembro: L168 fatura 1000, L200 fatura 3000, L300 so tem despesa (prejuizo).
insert into public.receitas (descricao,valor,data_competencia,status,data_recebimento,veiculo_id) values
 ('Guincho L168',1000,'2026-09-10','RECEBIDA','2026-09-10',1),
 ('Guincho L200',3000,'2026-09-11','RECEBIDA','2026-09-11',2);

insert into public.despesas (descricao,categoria_id,valor,data_lancamento,status,aprovada,
  aprovado_por,aprovado_em,data_pagamento,veiculo_id,criado_por,natureza) values
 ('Diesel L168',(select id from public.categorias where nome='Combustível'),200,'2026-09-08','PAGO',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),'2026-09-08',1,'aaaaaaaa-0000-0000-0000-000000000002','GERAL'),
 ('Diesel L200',(select id from public.categorias where nome='Combustível'),100,'2026-09-09','PAGO',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),'2026-09-09',2,'aaaaaaaa-0000-0000-0000-000000000002','GERAL'),
 ('Conserto L300',(select id from public.categorias where nome='Combustível'),500,'2026-09-10','PAGO',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),'2026-09-10',3,'aaaaaaaa-0000-0000-0000-000000000002','GERAL'),
 ('Aluguel',(select id from public.categorias where nome='Aluguel'),400,'2026-09-05','PAGO',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),'2026-09-05',null,'aaaaaaaa-0000-0000-0000-000000000002','GERAL');
-- Nao aprovada: nao pode mexer no resultado.
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,status,aprovada,veiculo_id,criado_por)
 values ('Aguardando aprovacao',(select id from public.categorias where nome='Combustível'),5000,'2026-09-12','PENDENTE',false,1,'aaaaaaaa-0000-0000-0000-000000000002');

-- Outubro: nenhuma receita. Duas viaturas com despesa propria e despesa geral.
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,status,aprovada,
  aprovado_por,aprovado_em,data_pagamento,veiculo_id,criado_por,natureza) values
 ('Diesel L168 out',(select id from public.categorias where nome='Combustível'),100,'2026-10-08','PAGO',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),'2026-10-08',1,'aaaaaaaa-0000-0000-0000-000000000002','GERAL'),
 ('Diesel L200 out',(select id from public.categorias where nome='Combustível'),100,'2026-10-09','PAGO',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),'2026-10-09',2,'aaaaaaaa-0000-0000-0000-000000000002','GERAL'),
 ('Aluguel out',(select id from public.categorias where nome='Aluguel'),200,'2026-10-05','PAGO',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),'2026-10-05',null,'aaaaaaaa-0000-0000-0000-000000000002','GERAL');

\echo '===== administrador: setembro ====='
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);
set role authenticated;

-- gerais = 1200 pagas - 800 proprias = 400; rateio L168=100, L200=300, L300=0.
select pg_temp.checar('ordem: maior resultado primeiro',
  (select string_agg(veiculo, ',' order by resultado desc) from public.lucro_por_viatura('2026-09-01','2026-09-30')),
  'L200,L168,L300');
select pg_temp.checar('L168: rateio',
  (select rateio::text from public.lucro_por_viatura('2026-09-01','2026-09-30') where veiculo='L168'), '100.00');
select pg_temp.checar('L168: resultado = 1000 - 200 - 100',
  (select resultado::text from public.lucro_por_viatura('2026-09-01','2026-09-30') where veiculo='L168'), '700.00');
select pg_temp.checar('L200: resultado = 3000 - 100 - 300',
  (select resultado::text from public.lucro_por_viatura('2026-09-01','2026-09-30') where veiculo='L200'), '2600.00');
select pg_temp.checar('L200: margem',
  (select round(margem, 2)::text from public.lucro_por_viatura('2026-09-01','2026-09-30') where veiculo='L200'), '86.67');
select pg_temp.checar('L300: prejuizo, sem receita nao leva rateio',
  (select resultado::text || '/' || rateio::text from public.lucro_por_viatura('2026-09-01','2026-09-30') where veiculo='L300'), '-500.00/0.00');
select pg_temp.checar('L300: margem nula sem receita',
  (select (margem is null)::text from public.lucro_por_viatura('2026-09-01','2026-09-30') where veiculo='L300'), 'true');
select pg_temp.checar('despesa nao aprovada nao entra',
  (select sum(despesas_proprias)::text from public.lucro_por_viatura('2026-09-01','2026-09-30')), '800.00');
select pg_temp.checar('o rateio fecha: soma dos resultados = receita - despesas pagas',
  (select sum(resultado)::text from public.lucro_por_viatura('2026-09-01','2026-09-30')), '2800.00');

\echo '===== administrador: outubro (sem receita divide igual) ====='
select pg_temp.checar('sem receita: rateio igual (200 / 2)',
  (select string_agg(rateio::text, ',' order by veiculo) from public.lucro_por_viatura('2026-10-01','2026-10-31')), '100.00,100.00');
select pg_temp.checar('sem receita: resultado = -proprio - rateio',
  (select string_agg(resultado::text, ',' order by veiculo) from public.lucro_por_viatura('2026-10-01','2026-10-31')), '-200.00,-200.00');

\echo '===== periodo vazio ====='
select pg_temp.checar('periodo sem movimento: nenhuma linha',
  (select count(*)::text from public.lucro_por_viatura('2025-01-01','2025-01-31')), '0');

\echo '===== quem nao e administrador nao passa ====='
reset role;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000002',false);
set role authenticated;
do $$ begin
  perform * from public.lucro_por_viatura('2026-09-01','2026-09-30');
  raise exception 'FALHOU  | funcionario leu o lucro por viatura';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSOU  | funcionario barrado: %', sqlerrm;
end $$;

\echo '===== sem login nao passa ====='
reset role;
select set_config('request.jwt.claim.sub','',false);
set role anon;
do $$ begin
  perform * from public.lucro_por_viatura('2026-09-01','2026-09-30');
  raise exception 'FALHOU  | anon executou lucro_por_viatura';
exception when insufficient_privilege then
  raise notice 'PASSOU  | anon sem permissao de executar';
end $$;
reset role;
