-- A despesa de comissao diz de quem e e de qual OP, e o extrato entrega o
-- socorrista e a OP para a tela montar o link.
--
-- Kawa, 22/09/2026: "socorrista tal, comissao da OP tal", com o nome clicavel
-- levando a comissao dele.
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}');
insert into public.categorias (nome,tipo) values ('Combustível','DESPESA');
insert into public.motoristas (nome) values ('Anderson');

insert into public.ordens_pagamento_porto (numero,valor_total,data_pagamento_programada)
 values ('OP-77',1000,'2026-10-05');
insert into public.ordens_servico_porto
 (numero,numero_normalizado,data_atendimento,valor_total,motorista_id,ordem_pagamento_id,status_financeiro,status_operacional)
 values ('OS-1','OS1','2026-09-10',1000,1,1,'RECEBIDO','PROCESSADO');
select public.porto_recalcular_periodos();
select public.porto_sincronizar_comissoes();

\echo '===== A despesa leva o nome e a OP ====='
select pg_temp.checar('descricao da comissao',
  (select descricao from public.despesas where protocolo like 'COMISSAO-OP-%'),
  'Anderson — comissão da OP OP-77');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== O extrato entrega socorrista e OP ====='
select pg_temp.checar('extrato traz o socorrista da comissao',
  (select motorista_id::text from public.extrato_financeiro('2026-01-01','2026-12-31') where origem = 'COMISSAO'), '1');
select pg_temp.checar('extrato traz o numero da OP',
  (select numero_op from public.extrato_financeiro('2026-01-01','2026-12-31') where origem = 'COMISSAO'), 'OP-77');
reset role;

\echo '===== Uma despesa comum nao vira comissao ====='
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,motorista_id,status,natureza)
 values ('Diesel',(select id from public.categorias where nome='Combustível'),50,'2026-09-12',1,'PENDENTE','GERAL');
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('despesa comum sem OP',
  (select coalesce(numero_op,'—') || '/' || origem from public.extrato_financeiro('2026-01-01','2026-12-31') where descricao = 'Diesel'),
  '—/MANUAL');
reset role;

\echo '===== Renomear o socorrista acerta o texto na proxima sincronizacao ====='
update public.motoristas set nome = 'Anderson Jorge' where id = 1;
select public.porto_sincronizar_comissoes();
select pg_temp.checar('texto acompanha o nome',
  (select descricao from public.despesas where protocolo like 'COMISSAO-OP-%'),
  'Anderson Jorge — comissão da OP OP-77');

\echo 'TODOS OS TESTES PASSARAM'
