-- O administrador lanca a despesa num passo; o funcionario continua passando
-- pela aprovacao. A segregacao de funcoes nao some — ela passa a valer onde
-- protege alguma coisa.
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

-- Espera uma recusa: o que importa e que a escrita NAO aconteceu.
create or replace function pg_temp.barrado(rotulo text, sql text) returns void
language plpgsql as $$
begin
  execute sql;
  raise exception 'VAZOU   | % | a operacao deveria ter sido recusada', rotulo;
exception
  when insufficient_privilege or invalid_parameter_value or check_violation
    or raise_exception then raise notice 'BLOQUEADO | %', rotulo;
end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','soc@t.local','{"nome":"Soc","perfil":"FUNCIONARIO"}');
insert into public.categorias (nome,tipo) values ('Combustível','DESPESA'),('Alimentação','DESPESA');
insert into public.veiculos (identificacao,placa,custo_por_km) values ('L168','AAA1A11',2.00);
insert into public.motoristas (nome,perfil_id,veiculo_id) values
 ('Anderson','aaaaaaaa-0000-0000-0000-000000000002',1);

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== Administrador: um passo, e o registro fica honesto ====='
select pg_temp.checar('nasce aprovada',
  (select aprovada::text from public.registrar_despesa_aprovada(
     'Diesel',1,250,'2026-09-10',null,'PIX',1,null,null,null,'GERAL',true,null)), 'true');
select pg_temp.checar('nasce paga quando o formulário disse "Paga"',
  (select status::text from public.registrar_despesa_aprovada(
     'Diesel 2',1,90,'2026-09-11',null,'PIX',1,null,null,null,'GERAL',true,null)), 'PAGO');
-- Sem data de pagamento informada, vale a do lancamento: e o dia em que o
-- dinheiro saiu, e a constraint despesas_paga_tem_data exige uma data.
select pg_temp.checar('paga sem data usa a data do lançamento',
  (select data_pagamento::text from public.registrar_despesa_aprovada(
     'Diesel 3',1,10,'2026-09-12',null,null,1,null,null,null,'GERAL',true,null)), '2026-09-12');
select pg_temp.checar('"Pendente" continua pendente, só que já aprovada',
  (select status || '/' || aprovada::text from public.registrar_despesa_aprovada(
     'Peça',1,400,'2026-09-13',null,null,1,null,null,null,'GERAL',false,null)), 'PENDENTE/true');
-- A auditoria precisa saber de quem foi a decisao. Foi dele: ele lancou e ele
-- aprovou, e a coluna diz isso em vez de ficar nula.
select pg_temp.checar('aprovado_por guarda quem lançou',
  (select (aprovado_por = criado_por)::text from public.registrar_despesa_aprovada(
     'Pedágio',1,12,'2026-09-14',null,null,null,null,null,null,'GERAL',true,null)), 'true');
select pg_temp.checar('alimentação do socorrista não leva viatura',
  (select coalesce(veiculo_id::text,'sem viatura') from public.registrar_despesa_aprovada(
     'Almoço',2,50,'2026-09-15',null,null,1,1,null,null,'ALIMENTACAO_FUNCIONARIO',true,null)), 'sem viatura');
select pg_temp.checar('e é marcada como alimentação',
  (select natureza::text from public.despesas where descricao = 'Almoço'), 'ALIMENTACAO_FUNCIONARIO');

\echo '===== O funcionario continua passando pela aprovacao ====='
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
-- Onde a regra protege alguma coisa, ela continua inteira: quem nao responde
-- pelo caixa nao carimba o proprio gasto.
select pg_temp.barrado('funcionário não lança despesa já aprovada',
  $$select public.registrar_despesa_aprovada('Minha peça',1,999,'2026-09-16',
      null,null,null,null,null,null,'GERAL',true,null)$$);
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,status,aprovada,criado_por)
 values ('Gasto do socorrista',1,80,'2026-09-16','PENDENTE',false,'aaaaaaaa-0000-0000-0000-000000000002');
select pg_temp.checar('a despesa dele nasce pendente, como antes',
  (select status || '/' || aprovada::text from public.despesas where descricao = 'Gasto do socorrista'),
  'PENDENTE/false');
select pg_temp.barrado('e ele não aprova o próprio lançamento',
  $$select public.aprovar_despesa((select id from public.despesas where descricao = 'Gasto do socorrista'))$$);

\echo '===== A trava de autoaprovacao segue de pe para todo mundo ====='
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,status,aprovada,criado_por)
 values ('Lançada à mão pelo dono',1,60,'2026-09-17','PENDENTE',false,'aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.barrado('nem o administrador aprova o próprio lançamento por aprovar_despesa',
  $$select public.aprovar_despesa((select id from public.despesas where descricao = 'Lançada à mão pelo dono'))$$);

\echo '===== Alimentacao nunca leva viatura, venha por onde vier ====='
-- A regra na tela resolve o formulario e so ele. Estas sao as outras portas.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

-- Porta 1: despesa fixa. Cadastrada com viatura, lancada todo mes por
-- lancar_despesas_recorrentes, que copia veiculo_id e nunca escreve natureza.
insert into public.despesas_recorrentes
 (descricao,categoria_id,valor,dia_vencimento,veiculo_id,motorista_id,ativo)
 values ('Marmita do plantão',2,300,10,1,1,true);
select public.lancar_despesas_recorrentes('2026-10-01');
select pg_temp.checar('despesa fixa de alimentação não leva viatura',
  (select coalesce(veiculo_id::text,'sem viatura') from public.despesas
    where descricao = 'Marmita do plantão'), 'sem viatura');
select pg_temp.checar('e sai marcada como alimentação do socorrista',
  (select natureza::text from public.despesas where descricao = 'Marmita do plantão'),
  'ALIMENTACAO_FUNCIONARIO');

-- Porta 2: insert direto na tabela, como faz o funcionario pela policy.
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,veiculo_id,motorista_id,status,aprovada,criado_por)
 values ('Lanche na estrada',2,25,'2026-10-02',1,1,'PENDENTE',false,'aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.checar('insert direto de alimentação também perde a viatura',
  (select coalesce(veiculo_id::text,'sem viatura') from public.despesas
    where descricao = 'Lanche na estrada'), 'sem viatura');

-- Porta 3: trocar a categoria de uma despesa que ja existe com viatura.
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,veiculo_id,motorista_id,status,aprovada,criado_por)
 values ('Era diesel',1,80,'2026-10-03',1,1,'PENDENTE',false,'aaaaaaaa-0000-0000-0000-000000000001');
update public.despesas set categoria_id = 2 where descricao = 'Era diesel';
select pg_temp.checar('virar alimentação na correção solta a viatura',
  (select coalesce(veiculo_id::text,'sem viatura') from public.despesas
    where descricao = 'Era diesel'), 'sem viatura');

-- Sem socorrista nao ha de quem descontar: continua GERAL, mas a viatura sai
-- do mesmo jeito. Comida nao e custo de veiculo, com ou sem dono.
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,veiculo_id,status,aprovada,criado_por)
 values ('Café da equipe',2,40,'2026-10-04',1,'PENDENTE',false,'aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.checar('alimentação sem socorrista não vira desconto de ninguém',
  (select natureza::text from public.despesas where descricao = 'Café da equipe'), 'GERAL');
select pg_temp.checar('mas também não vira custo de viatura',
  (select coalesce(veiculo_id::text,'sem viatura') from public.despesas
    where descricao = 'Café da equipe'), 'sem viatura');

-- E o contrario segue valendo: despesa que nao e alimentacao mantem a viatura.
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,veiculo_id,motorista_id,status,aprovada,criado_por)
 values ('Diesel de verdade',1,500,'2026-10-05',1,1,'PENDENTE',false,'aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.checar('despesa comum continua na viatura',
  (select veiculo_id::text from public.despesas where descricao = 'Diesel de verdade'), '1');

\echo 'TODOS OS TESTES PASSARAM'
