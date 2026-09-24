-- Juros da despesa fixa: 200 pagos como 210 viram 200 na fixa e 10 em Juros.
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
insert into public.despesas_recorrentes (descricao,categoria_id,valor,dia_vencimento)
 values ('Seguro L168',(select id from public.categorias where nome = 'Seguro'),200,10);

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select public.lancar_fixas_vencidas('2026-09-15');
reset role;
-- Uma despesa comum, para provar que juros e so de fixa.
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,data_pagamento,criado_por,status,aprovada)
 values ('Almoco',(select id from public.categorias where nome = 'Seguro'),30,'2026-09-12','2026-09-12',
         'aaaaaaaa-0000-0000-0000-000000000001','PAGO',true);
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== 200 pagos como 210 ====='
select pg_temp.checar('devolve o juros',
  public.despesa_fixa_valor_pago((select id from public.despesas where despesa_recorrente_id is not null), 210)::text, '10.00');
select pg_temp.checar('a fixa continua com 200',
  (select valor::text from public.despesas where despesa_recorrente_id is not null), '200.00');
select pg_temp.checar('os 10 vao para a categoria Juros',
  (select c.nome || ' ' || d.valor from public.despesas d join public.categorias c on c.id = d.categoria_id
    where d.juros_de_despesa_id is not null), 'Juros 10.00');
select pg_temp.checar('o juros entra pago, na data da fixa',
  (select status::text || ' ' || data_pagamento from public.despesas where juros_de_despesa_id is not null), 'PAGO 2026-09-10');

\echo '===== Editar de novo recalcula, sem duplicar ====='
select public.despesa_fixa_valor_pago((select id from public.despesas where despesa_recorrente_id is not null), 215);
select pg_temp.checar('um juros so, agora de 15',
  (select count(*) || ' ' || max(valor) from public.despesas where juros_de_despesa_id is not null), '1 15.00');
select pg_temp.checar('a categoria Juros nao se repete',
  (select count(*)::text from public.categorias where nome = 'Juros'), '1');

\echo '===== Voltar ao valor da fixa tira o juros ====='
select public.despesa_fixa_valor_pago((select id from public.despesas where despesa_recorrente_id is not null), 200);
select pg_temp.checar('sem juros',
  (select count(*)::text from public.despesas where juros_de_despesa_id is not null), '0');

\echo '===== Apagar a fixa leva o juros junto ====='
select public.despesa_fixa_valor_pago((select id from public.despesas where despesa_recorrente_id is not null), 210);
reset role;
delete from public.despesas where despesa_recorrente_id is not null;
select pg_temp.checar('juros saiu com a fixa',
  (select count(*)::text from public.despesas where juros_de_despesa_id is not null), '0');

\echo '===== Juros e so de despesa fixa ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$
begin
  perform public.despesa_fixa_valor_pago((select id from public.despesas where descricao = 'Almoco'), 40);
  raise exception 'FALHOU  | despesa comum aceitou juros';
exception when check_violation then raise notice 'PASSOU  | despesa comum recusa juros';
end $$;
reset role;

\echo 'TODOS OS TESTES PASSARAM'
