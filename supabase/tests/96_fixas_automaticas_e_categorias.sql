-- Fixas entram sozinhas, ja pagas, no vencimento; o socorrista so lanca o que o
-- administrador libera; e a comissao padrao pode ser lida por quem esta logado.
--
-- Kawa, 23/09/2026: "para eu nao precisar colocar todos os meses esse valor" e
-- "nao e para aparecer todas as despesas possiveis, apenas aquilo que o
-- administrador permitir".
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
insert into public.categorias (nome,tipo,socorrista_pode) values
 ('Combustível','DESPESA',true), ('Seguro','DESPESA',false);
insert into public.veiculos (identificacao,placa,custo_por_km) values ('L168','AAA1A11',2.00);
insert into public.motoristas (nome,perfil_id,veiculo_id) values ('Anderson','aaaaaaaa-0000-0000-0000-000000000002',1);
insert into public.despesas_recorrentes (descricao,categoria_id,valor,dia_vencimento,total_parcelas,parcela_inicial)
 values ('Seguro dos caminhoes',(select id from public.categorias where nome='Seguro'),5716.40,18,10,3),
        ('Internet',(select id from public.categorias where nome='Seguro'),127.51,25,null,null);

\echo '===== Comissao padrao legivel por quem esta logado ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select pg_temp.checar('socorrista le a comissao padrao',
  (select percentual_padrao::text from public.configuracao_comissao), '0.2000');
reset role;
-- Sem usuario na sessao: e assim que o agendador do banco chama.
reset request.jwt.claim.sub;

\echo '===== Fixas: so as vencidas entram, ja pagas ====='
select pg_temp.checar('dia 20: entra o seguro (18), nao a internet (25)',
  public.lancar_fixas_vencidas('2026-09-20')::text, '1');
select pg_temp.checar('entra paga e aprovada, no vencimento',
  (select status || '/' || aprovada || '/' || data_pagamento from public.despesas where despesa_recorrente_id = 1),
  'PAGO/true/2026-09-18');
select pg_temp.checar('com a parcela',
  (select descricao from public.despesas where despesa_recorrente_id = 1), 'Seguro dos caminhoes (3/10)');
select pg_temp.checar('rodar de novo nao duplica',
  public.lancar_fixas_vencidas('2026-09-20')::text, '0');
select pg_temp.checar('dia 25: entra a internet',
  public.lancar_fixas_vencidas('2026-09-25')::text, '1');
select pg_temp.checar('outubro: as duas de novo',
  public.lancar_fixas_vencidas('2026-10-31')::text, '2');
select pg_temp.checar('o seguro de outubro e a 4/10',
  (select descricao from public.despesas where despesa_recorrente_id = 1 and data_lancamento = '2026-10-18'),
  'Seguro dos caminhoes (4/10)');

\echo '===== Socorrista so lanca na categoria liberada ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
do $$ begin
  insert into public.despesas (descricao,categoria_id,valor,data_lancamento,motorista_id,veiculo_id,criado_por,status,aprovada)
   values ('Seguro',(select id from public.categorias where nome='Seguro'),50,'2026-09-12',1,1,'aaaaaaaa-0000-0000-0000-000000000002','PENDENTE',false);
  raise exception 'FALHOU  | socorrista lancou em categoria nao liberada';
exception when insufficient_privilege or raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSOU  | categoria nao liberada e recusada';
end $$;
select pg_temp.checar('na categoria liberada, lanca',
  (with ins as (insert into public.despesas (descricao,categoria_id,valor,data_lancamento,motorista_id,veiculo_id,criado_por,status,aprovada)
     values ('Diesel',(select id from public.categorias where nome='Combustível'),80,'2026-09-12',1,1,'aaaaaaaa-0000-0000-0000-000000000002','PENDENTE',false) returning 1)
   select count(*)::text from ins), '1');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
