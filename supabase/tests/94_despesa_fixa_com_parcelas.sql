-- Despesa fixa com parcelas: conta sozinha e encerra na ultima.
--
-- Kawa, 22/09/2026: "SEGURO DOS CAMINHOES 3/10". Cadastrada em 3 de 10, cada mes
-- lancado avanca uma parcela, e depois da 10a a fixa se desativa sozinha.
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}');
insert into public.categorias (nome,tipo) values ('Seguro','DESPESA');
-- Seguro em 9 de 10: faltam duas parcelas. IPTU sem parcelas: nao acaba.
insert into public.despesas_recorrentes (descricao,categoria_id,valor,dia_vencimento,total_parcelas,parcela_inicial)
 values ('Seguro dos caminhoes',1,5716.40,18,10,9);
insert into public.despesas_recorrentes (descricao,categoria_id,valor,dia_vencimento)
 values ('Contador',1,810.50,18);

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== Primeiro mes: parcela 9 de 10 ====='
select public.lancar_despesas_recorrentes('2026-09-01');
select pg_temp.checar('descricao leva a parcela',
  (select descricao from public.despesas where despesa_recorrente_id = 1), 'Seguro dos caminhoes (9/10)');
select pg_temp.checar('o numero fica gravado',
  (select parcela_numero || '/' || parcela_total from public.despesas where despesa_recorrente_id = 1), '9/10');
select pg_temp.checar('fixa sem parcelas nao ganha numero',
  (select descricao from public.despesas where despesa_recorrente_id = 2), 'Contador');

\echo '===== Lancar o mesmo mes de novo nao duplica ====='
select pg_temp.checar('continua uma so',
  (select (public.lancar_despesas_recorrentes('2026-09-01') ->> 'jaExistiam')), '2');

\echo '===== Ultima parcela encerra a fixa ====='
select pg_temp.checar('outubro lanca a 10/10 e encerra uma',
  (select (public.lancar_despesas_recorrentes('2026-10-01') ->> 'encerradas')), '1');
select pg_temp.checar('a parcela de outubro e a 10',
  (select parcela_numero::text from public.despesas where despesa_recorrente_id = 1 and data_lancamento = '2026-10-01'), '10');
select pg_temp.checar('o seguro ficou desativado',
  (select ativo::text from public.despesas_recorrentes where id = 1), 'false');
select public.lancar_despesas_recorrentes('2026-11-01');
select pg_temp.checar('novembro nao lanca seguro',
  (select count(*)::text from public.despesas where despesa_recorrente_id = 1), '2');
select pg_temp.checar('mas o contador continua',
  (select count(*)::text from public.despesas where despesa_recorrente_id = 2), '3');

\echo '===== Apagar um lancamento e lancar de novo nao pula numero ====='
reset role;
update public.despesas_recorrentes set ativo = true where id = 1;
delete from public.despesas where despesa_recorrente_id = 1 and parcela_numero = 10;
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('a proxima volta a ser a 10',
  (select public.proxima_parcela(f)::text from public.despesas_recorrentes f where f.id = 1), '10');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
