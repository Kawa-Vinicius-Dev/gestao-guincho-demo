-- Documentos: de uma viatura ou de um socorrista, so o administrador mexe.
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
insert into public.veiculos (identificacao, placa, custo_por_km) values ('L168','ABC1D23',2.50);
insert into public.motoristas (nome, perfil_id) values ('DJALMA', 'aaaaaaaa-0000-0000-0000-000000000002');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.documentos (veiculo_id, tipo, vence_em) values (1, 'CRLV', '2026-10-10');
insert into public.documentos (motorista_id, tipo, vence_em) values (1, 'CNH', '2027-03-01');
select pg_temp.checar('administrador cadastra', (select count(*)::text from public.documentos), '2');

do $$
begin
  insert into public.documentos (veiculo_id, motorista_id, tipo, vence_em) values (1, 1, 'X', '2026-10-10');
  raise exception 'FALHOU  | aceitou documento com dois donos';
exception when check_violation then raise notice 'PASSOU  | documento tem um dono so';
end $$;

\echo '===== Vistoria periodica ====='
insert into public.vistorias_periodicas (veiculo_id, referencia, feita_em) values (1, '2026-10-01', '2026-10-03');
select pg_temp.checar('vistoria registrada, aprovada por padrao',
  (select resultado from public.vistorias_periodicas), 'APROVADA');
do $$
begin
  insert into public.vistorias_periodicas (veiculo_id, referencia, feita_em) values (1, '2026-10-01', '2026-10-05');
  raise exception 'FALHOU  | aceitou duas vistorias no mesmo mes';
exception when unique_violation then raise notice 'PASSOU  | uma vistoria por mes';
end $$;
do $$
begin
  insert into public.vistorias_periodicas (veiculo_id, referencia, feita_em) values (1, '2026-11-15', '2026-11-15');
  raise exception 'FALHOU  | aceitou referencia fora do dia 1';
exception when check_violation then raise notice 'PASSOU  | referencia e o mes (dia 1)';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select pg_temp.checar('socorrista nao ve', (select count(*)::text from public.documentos), '0');
select pg_temp.checar('nem as vistorias', (select count(*)::text from public.vistorias_periodicas), '0');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
