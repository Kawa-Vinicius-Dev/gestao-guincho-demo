-- Km dos servicos: o socorrista lanca pelo numero da OS no turno aberto, a mesma
-- OS corrige em vez de duplicar, e ninguem ve nem mexe no turno de outro.
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','soc@t.local','{"nome":"Socorrista","perfil":"FUNCIONARIO"}'),
 ('aaaaaaaa-0000-0000-0000-000000000003','outro@t.local','{"nome":"Outro","perfil":"FUNCIONARIO"}');
insert into public.veiculos (identificacao, placa, custo_por_km) values ('L168','ABC1D23',2.50), ('K85','XYZ9A87',2.50);
insert into public.motoristas (nome,perfil_id,veiculo_id) values
 ('Socorrista','aaaaaaaa-0000-0000-0000-000000000002',1),
 ('Outro','aaaaaaaa-0000-0000-0000-000000000003',2);

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';

\echo '===== Sem turno aberto nao lanca ====='
do $$
begin
  perform public.lancar_servico_do_turno('1234567-26', '123456726', 12);
  raise exception 'FALHOU  | lancou sem turno';
exception when invalid_parameter_value then raise notice 'PASSOU  | sem turno nao lanca';
end $$;

select public.abrir_turno(1, 1000);

\echo '===== Lanca, e a mesma OS corrige ====='
select public.lancar_servico_do_turno('1234567-26', '123456726', 12);
select public.lancar_servico_do_turno('1234567-26', '123456726', 15.5);
select public.lancar_servico_do_turno('7654321-26', '765432126', 20);
select pg_temp.checar('duas OS no turno', (select count(*)::text from public.servicos_do_turno), '2');
select pg_temp.checar('a segunda vez corrigiu o km',
  (select km::text from public.servicos_do_turno where numero_normalizado = '123456726'), '15.5');
select pg_temp.checar('soma do turno',
  (select sum(km)::text from public.servicos_do_turno where turno_id = 1), '35.5');

\echo '===== Km fora da faixa e recusado ====='
do $$
begin
  perform public.lancar_servico_do_turno('1111111-26', '111111126', 0);
  raise exception 'FALHOU  | aceitou km zero';
exception when invalid_parameter_value then raise notice 'PASSOU  | km zero recusado';
end $$;

\echo '===== Outro socorrista nao ve nem tira ====='
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
select pg_temp.checar('outro nao ve', (select count(*)::text from public.servicos_do_turno), '0');
do $$
begin
  perform public.remover_servico_do_turno(1);
  raise exception 'FALHOU  | outro tirou servico alheio';
exception when insufficient_privilege then raise notice 'PASSOU  | outro nao tira';
end $$;
do $$
begin
  insert into public.servicos_do_turno (turno_id, numero_os, numero_normalizado, km) values (1, 'x', '9', 1);
  raise exception 'FALHOU  | escreveu direto na tabela';
exception when insufficient_privilege then raise notice 'PASSOU  | nao escreve direto';
end $$;

\echo '===== O dono tira do turno aberto; o administrador ve tudo ====='
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select public.remover_servico_do_turno(1);
select pg_temp.checar('sobrou um', (select count(*)::text from public.servicos_do_turno), '1');
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('administrador ve', (select count(*)::text from public.servicos_do_turno), '1');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
