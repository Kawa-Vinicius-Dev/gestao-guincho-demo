-- Base para as metas: media dos ultimos meses completos, tendencia, e o mes em
-- andamento fora da conta. Nada aqui grava meta.
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
insert into public.veiculos (identificacao,placa,custo_por_km) values ('L1','AAA1A11',2.00),('L2','BBB2B22',2.00);
insert into public.motoristas (nome) values ('ANA');

-- Referencia 15/10: os meses completos sao set, ago e jul. Outubro fica de fora.
-- L1 fatura 1000 (jul), 2000 (ago), 3000 (set) e 9999 em outubro (nao pode entrar).
-- L2 so existe a partir de setembro: 600.
insert into public.receitas (descricao,valor,data_competencia,status,data_recebimento,veiculo_id) values
 ('L1 jul',1000,'2026-07-10','RECEBIDA','2026-07-10',1),
 ('L1 ago',2000,'2026-08-10','RECEBIDA','2026-08-10',1),
 ('L1 set',3000,'2026-09-10','RECEBIDA','2026-09-10',1),
 ('L1 out',9999,'2026-10-05','RECEBIDA','2026-10-05',1),
 ('L2 set',600,'2026-09-12','RECEBIDA','2026-09-12',2);

-- ANA: 2 servicos em jul (1000), 1 em ago (500), 3 em set (1500).
insert into public.ordens_pagamento_porto (numero, valor_total, periodo_inicio, periodo_fim) values
 ('OP-JUL',0,'2026-07-01','2026-07-31'),('OP-AGO',0,'2026-08-01','2026-08-31'),('OP-SET',0,'2026-09-01','2026-09-30');
insert into public.ordens_servico_porto (numero, numero_normalizado, ordem_pagamento_id, valor_total, data_atendimento, motorista_id) values
 ('J1','J1',1,500,'2026-07-02',1),('J2','J2',1,500,'2026-07-03',1),
 ('G1','G1',2,500,'2026-08-04',1),
 ('S1','S1',3,500,'2026-09-02',1),('S2','S2',3,500,'2026-09-03',1),('S3','S3',3,500,'2026-09-04',1);
select public.porto_recalcular_periodos();

select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);
set role authenticated;

\echo '===== viatura com tres meses ====='
select pg_temp.checar('L1 receita: media de jul/ago/set, sem outubro',
  (select media_mensal::text from public.base_para_metas(3,'2026-10-15') where nome='L1' and metrica='receita'), '2000.00');
select pg_temp.checar('L1: apoia-se em 3 meses',
  (select meses_com_dado::text from public.base_para_metas(3,'2026-10-15') where nome='L1' and metrica='receita'), '3');
select pg_temp.checar('L1: ultimo mes e setembro',
  (select ultimo_mes::text from public.base_para_metas(3,'2026-10-15') where nome='L1' and metrica='receita'), '3000.00');
select pg_temp.checar('L1: tendencia = (3000 - 1500) / 1500',
  (select tendencia_pct::text from public.base_para_metas(3,'2026-10-15') where nome='L1' and metrica='receita'), '100.00');
select pg_temp.checar('L1: agosto (1 servico contra a media 2) e parcial; a media de todos nao muda',
  (select meses_parciais || '/' || media_mensal from public.base_para_metas(3,'2026-10-15') where nome='L1' and metrica='receita'), '1/2000.00');
select pg_temp.checar('L1: media sem o mes parcial = (1000+3000)/2',
  (select media_sem_parciais::text from public.base_para_metas(3,'2026-10-15') where nome='L1' and metrica='receita'), '2000.00');
select pg_temp.checar('ANA: media sem agosto = (1000+1500)/2',
  (select media_sem_parciais::text from public.base_para_metas(3,'2026-10-15') where nome='ANA' and metrica='producao'), '1250.00');
select pg_temp.checar('janela de 1 mes: sem outros meses nao ha como marcar parcial',
  (select meses_parciais || '/' || media_sem_parciais from public.base_para_metas(1,'2026-10-15') where nome='L1' and metrica='receita'), '0/3000.00');
select pg_temp.checar('L1 resultado tambem vem na base',
  (select media_mensal::text from public.base_para_metas(3,'2026-10-15') where nome='L1' and metrica='resultado'), '2000.00');

\echo '===== viatura nova nao e punida ====='
select pg_temp.checar('L2: media so dos meses em que existiu, nao dividida por 3',
  (select media_mensal || '/' || meses_com_dado from public.base_para_metas(3,'2026-10-15') where nome='L2' and metrica='receita'), '600.00/1');
select pg_temp.checar('L2: sem meses anteriores nao ha tendencia',
  (select (tendencia_pct is null)::text from public.base_para_metas(3,'2026-10-15') where nome='L2' and metrica='receita'), 'true');

\echo '===== socorrista ====='
select pg_temp.checar('ANA producao: media (1000+500+1500)/3',
  (select media_mensal::text from public.base_para_metas(3,'2026-10-15') where nome='ANA' and metrica='producao'), '1000.00');
select pg_temp.checar('ANA: tendencia = (1500 - 750) / 750',
  (select tendencia_pct::text from public.base_para_metas(3,'2026-10-15') where nome='ANA' and metrica='producao'), '100.00');

\echo '===== janela ====='
select pg_temp.checar('1 mes so: setembro',
  (select media_mensal::text from public.base_para_metas(1,'2026-10-15') where nome='L1' and metrica='receita'), '3000.00');
select pg_temp.checar('referencia em novembro: outubro entra',
  (select ultimo_mes::text from public.base_para_metas(1,'2026-11-02') where nome='L1' and metrica='receita'), '9999.00');
do $$ begin
  perform * from public.base_para_metas(0,'2026-10-15');
  raise exception 'FALHOU  | aceitou 0 meses';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSOU  | p_meses invalido recusado: %', sqlerrm;
end $$;

\echo '===== quem nao e administrador nao passa ====='
reset role;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000002',false);
set role authenticated;
do $$ begin
  perform * from public.base_para_metas(3,'2026-10-15');
  raise exception 'FALHOU  | funcionario leu a base de metas';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSOU  | funcionario barrado: %', sqlerrm;
end $$;

\echo '===== sem login nao passa ====='
reset role;
select set_config('request.jwt.claim.sub','',false);
set role anon;
do $$ begin
  perform * from public.base_para_metas(3,'2026-10-15');
  raise exception 'FALHOU  | anon executou base_para_metas';
exception when insufficient_privilege then
  raise notice 'PASSOU  | anon sem permissao de executar';
end $$;
reset role;
