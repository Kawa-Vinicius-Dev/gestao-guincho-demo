\set ON_ERROR_STOP on
-- Testes adversariais: tudo aqui roda direto no banco, como quem abre o console
-- do navegador e usa a anon key na mao. A interface nao participa.

-- O rotulo diz o que de fato aconteceu: um caso que esperava PERMITIU nao pode
-- sair impresso como "BLOQUEADO" so porque bateu com o esperado. Foi assim que a
-- primeira rodada quase escondeu um furo de verdade.
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is distinct from esperado then
    raise exception 'FALHOU    | % | esperado=% obtido=%', rotulo, esperado, obtido;
  end if;
  if obtido = 'NEGADO' or esperado = '0' or esperado = '' then
    raise notice 'BLOQUEADO | %', rotulo;
  else
    raise notice 'PERMITIDO | %', rotulo;
  end if;
end $$;

-- Mede o EFEITO: um UPDATE barrado por RLS nao levanta erro, so afeta zero linhas.
create or replace function pg_temp.tentar(sql text) returns text
language plpgsql as $$
declare afetadas bigint;
begin
  execute sql;
  get diagnostics afetadas = row_count;
  if afetadas = 0 then return 'NEGADO'; end if;
  return 'PERMITIU';
exception
  when insufficient_privilege then return 'NEGADO';
  when others then
    if sqlstate in ('42501','P0001','23505','23503','23514','22023','42883') then return 'NEGADO'; end if;
    return 'ERRO:' || sqlstate;
end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','admin@t.local','{"nome":"Admin","perfil":"ADMINISTRADOR"}'),
 ('22222222-2222-2222-2222-222222222222','chefe@t.local','{"nome":"Chefe","perfil":"ADMINISTRADOR"}'),
 ('33333333-3333-3333-3333-333333333333','ana@t.local','{"nome":"Ana","perfil":"FUNCIONARIO"}'),
 ('44444444-4444-4444-4444-444444444444','bruno@t.local','{"nome":"Bruno","perfil":"FUNCIONARIO"}');
insert into public.categorias (nome,tipo) values ('Combustível','DESPESA');
insert into public.veiculos (identificacao,placa,custo_por_km) values ('L168','AAA1A11',2);
insert into public.contratantes (nome) values ('Porto Seguro');
insert into public.motoristas (nome,perfil_id) values
 ('Ana','33333333-3333-3333-3333-333333333333'),('Bruno','44444444-4444-4444-4444-444444444444');
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,criado_por) values
 ('Diesel da Ana',1,100,current_date,'33333333-3333-3333-3333-333333333333'),
 ('Diesel do Bruno',1,200,current_date,'44444444-4444-4444-4444-444444444444');
insert into public.receitas (descricao,valor,data_competencia,status,data_recebimento)
 values ('Faturamento do mes',50000,current_date,'RECEBIDA',current_date);
insert into public.contas_receber (contratante_id,descricao,valor_previsto,data_competencia,vencimento,status)
 values (1,'Fatura Porto',90000,current_date,current_date,'PENDENTE');
insert into public.calendario_pagamentos_porto (data_pagamento,descricao) values (current_date,'Ciclo');
insert into public.ordens_pagamento_porto (numero,valor_total,data_pagamento_programada,calendario_pagamento_id)
 values ('OP-SIGILO',123456,current_date,1);
insert into storage.objects (bucket_id,name) values
 ('comprovantes','despesas/1/nota-ana.pdf'),
 ('comprovantes','despesas/2/nota-bruno.pdf');
insert into storage.buckets (id,name,public) values ('importacoes-porto','importacoes-porto',false)
 on conflict (id) do nothing;
insert into storage.objects (bucket_id,name) values ('importacoes-porto','porto/1/ciclo.csv');

\echo '========== 1. VISITANTE SEM LOGIN =========='
set role anon;
select pg_temp.checar('anon le receitas', pg_temp.tentar('select * from public.receitas'), 'NEGADO');
select pg_temp.checar('anon le despesas', pg_temp.tentar('select * from public.despesas'), 'NEGADO');
select pg_temp.checar('anon le contas a receber', pg_temp.tentar('select * from public.contas_receber'), 'NEGADO');
select pg_temp.checar('anon le perfis (lista de quem tem conta)',
  pg_temp.tentar('select * from public.perfis'), 'NEGADO');
select pg_temp.checar('anon le ordens de pagamento', pg_temp.tentar('select * from public.ordens_pagamento_porto'), 'NEGADO');
select pg_temp.checar('anon chama o dashboard', pg_temp.tentar('select public.dashboard_resumo(current_date,current_date)'), 'NEGADO');
select pg_temp.checar('anon chama o extrato', pg_temp.tentar('select * from public.extrato_financeiro(current_date,current_date)'), 'NEGADO');
select pg_temp.checar('anon aprova despesa', pg_temp.tentar('select public.aprovar_despesa(1)'), 'NEGADO');
select pg_temp.checar('anon insere despesa',
  pg_temp.tentar($q$insert into public.despesas (descricao,categoria_id,valor,data_lancamento,criado_por)
    values ('Invasao',1,1,current_date,'33333333-3333-3333-3333-333333333333')$q$), 'NEGADO');
select pg_temp.checar('anon le arquivos do Storage', pg_temp.tentar('select * from storage.objects'), 'NEGADO');
reset role;

\echo '========== 2. FUNCIONARIO EM OPERACAO DE ADMINISTRADOR =========='
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.checar('funcionario le o faturamento', (select count(*)::text from public.receitas), '0');
select pg_temp.checar('funcionario le contas a receber', (select count(*)::text from public.contas_receber), '0');
select pg_temp.checar('funcionario le ordens de pagamento', (select count(*)::text from public.ordens_pagamento_porto), '0');
select pg_temp.checar('funcionario chama o dashboard',
  pg_temp.tentar('select public.dashboard_resumo(current_date,current_date)'), 'NEGADO');
select pg_temp.checar('funcionario aprova despesa', pg_temp.tentar('select public.aprovar_despesa(2)'), 'NEGADO');
select pg_temp.checar('funcionario paga despesa', pg_temp.tentar('select public.pagar_despesa(2)'), 'NEGADO');
select pg_temp.checar('funcionario recebe conta', pg_temp.tentar('select public.receber_conta(1,90000,current_date)'), 'NEGADO');
select pg_temp.checar('funcionario lanca despesas fixas', pg_temp.tentar($q$select public.lancar_despesas_recorrentes(current_date)$q$), 'NEGADO');
select pg_temp.checar('funcionario cria categoria',
  pg_temp.tentar($q$insert into public.categorias (nome,tipo) values ('Minha','DESPESA')$q$), 'NEGADO');
select pg_temp.checar('funcionario cria contratante',
  pg_temp.tentar($q$insert into public.contratantes (nome) values ('Meu')$q$), 'NEGADO');
select pg_temp.checar('funcionario cria receita',
  pg_temp.tentar($q$insert into public.receitas (descricao,valor,data_competencia,status)
    values ('Inventada',1,current_date,'PREVISTA')$q$), 'NEGADO');
reset role;

\echo '========== 3. TROCA DE ID NA MAO =========='
-- O ataque mais simples: pegar a chamada que a tela faz e mudar o numero.
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

select pg_temp.checar('Ana le a despesa do Bruno trocando o id',
  (select count(*)::text from public.despesas where id = 2), '0');
select pg_temp.checar('Ana edita a despesa do Bruno',
  pg_temp.tentar('update public.despesas set valor = 1 where id = 2'), 'NEGADO');
select pg_temp.checar('Ana apaga a despesa do Bruno',
  pg_temp.tentar('delete from public.despesas where id = 2'), 'NEGADO');
-- Lancar em nome de outro faria a despesa aparecer para o Bruno e, pior, deixaria
-- a Ana aprovar a propria despesa sem cair na regra de segregacao.
select pg_temp.checar('Ana lanca despesa assinando como Bruno',
  pg_temp.tentar($q$insert into public.despesas (descricao,categoria_id,valor,data_lancamento,criado_por)
    values ('Forjada',1,50,current_date,'44444444-4444-4444-4444-444444444444')$q$), 'NEGADO');
select pg_temp.checar('Ana pede a comissao do Bruno pelo id',
  pg_temp.tentar('select public.comissao_das_ops(array[1]::bigint[], 2)'), 'NEGADO');
select pg_temp.checar('Ana muda o proprio perfil para administrador',
  pg_temp.tentar($q$update public.perfis set perfil='ADMINISTRADOR'
    where id='33333333-3333-3333-3333-333333333333'$q$), 'NEGADO');
select pg_temp.checar('Ana se reativa apos ser desativada',
  pg_temp.tentar($q$update public.perfis set ativo=true
    where id='33333333-3333-3333-3333-333333333333'$q$), 'NEGADO');
select pg_temp.checar('Ana se vincula a outro socorrista',
  pg_temp.tentar($q$update public.motoristas set perfil_id='33333333-3333-3333-3333-333333333333'
    where id=2$q$), 'NEGADO');
select pg_temp.checar('Ana le o perfil do administrador',
  (select count(*)::text from public.perfis where perfil='ADMINISTRADOR'), '0');
-- Favoritos sao inofensivos, mas o padrao tem de valer para tudo.
insert into public.favoritos_menu (perfil_id,rota) values ('33333333-3333-3333-3333-333333333333','/despesas');
reset role;
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select pg_temp.checar('Bruno le os favoritos da Ana',
  (select count(*)::text from public.favoritos_menu), '0');
select pg_temp.checar('Bruno escreve nos favoritos da Ana',
  pg_temp.tentar($q$insert into public.favoritos_menu (perfil_id,rota)
    values ('33333333-3333-3333-3333-333333333333','/invadido')$q$), 'NEGADO');
reset role;

\echo '========== 4. ARQUIVOS =========='
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.checar('Ana ve so o comprovante da propria despesa',
  (select coalesce(string_agg(name,','),'') from storage.objects where bucket_id='comprovantes'),
  'despesas/1/nota-ana.pdf');
select pg_temp.checar('Ana le o comprovante do Bruno pelo caminho',
  (select count(*)::text from storage.objects where name='despesas/2/nota-bruno.pdf'), '0');
select pg_temp.checar('Ana apaga o comprovante do Bruno',
  pg_temp.tentar($q$delete from storage.objects where name='despesas/2/nota-bruno.pdf'$q$), 'NEGADO');
select pg_temp.checar('Ana envia arquivo para a pasta do Bruno',
  pg_temp.tentar($q$insert into storage.objects (bucket_id,name)
    values ('comprovantes','despesas/2/plantada.pdf')$q$), 'NEGADO');
-- O relatorio da Porto traz o faturamento do ciclo inteiro.
select pg_temp.checar('Ana le o relatorio da Porto',
  (select count(*)::text from storage.objects where bucket_id='importacoes-porto'), '0');
select pg_temp.checar('Ana escreve no bucket da Porto',
  pg_temp.tentar($q$insert into storage.objects (bucket_id,name)
    values ('importacoes-porto','porto/1/falso.csv')$q$), 'NEGADO');
-- Caminho fora da convencao nao pode virar um curinga que casa com tudo.
select pg_temp.checar('caminho sem id de despesa nao abre acesso',
  pg_temp.tentar($q$insert into storage.objects (bucket_id,name)
    values ('comprovantes','qualquer-coisa.pdf')$q$), 'NEGADO');
select pg_temp.checar('travessia de diretorio no caminho',
  pg_temp.tentar($q$insert into storage.objects (bucket_id,name)
    values ('comprovantes','despesas/../2/burlado.pdf')$q$), 'NEGADO');
reset role;

\echo '========== 5. SEGREGACAO DE FUNCOES =========='
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,criado_por)
 values ('Reembolso do proprio admin',1,9999,current_date,'11111111-1111-1111-1111-111111111111');
-- ATENCAO: o Spring permite que o administrador aprove a propria despesa, e a
-- regra de compatibilidade manda preservar esse comportamento. Nao e uma falha
-- de RLS — e uma regra de negocio frouxa, registrada como divida tecnica. O que
-- o banco garante e que passe SOMENTE pela RPC, que carimba quem aprovou: a
-- verificacao logo abaixo cobre isso.
select pg_temp.checar('administrador aprova o proprio reembolso (regra do Spring)',
  pg_temp.tentar($q$select public.aprovar_despesa(
    (select id from public.despesas where descricao='Reembolso do proprio admin'))$q$), 'PERMITIU');
-- Contornar a regra escrevendo direto na coluna tambem nao pode passar.
-- Contornar a RPC escrevendo direto na coluna: era o furo. Agora as colunas de
-- aprovacao nao estao no GRANT de UPDATE de ninguem.
select pg_temp.checar('administrador se auto-aprova por update direto',
  pg_temp.tentar($q$update public.despesas set aprovada=true,
      aprovado_por='11111111-1111-1111-1111-111111111111', aprovado_em=now()
    where descricao='Reembolso do proprio admin'$q$), 'NEGADO');
select pg_temp.checar('administrador marca despesa como paga por update direto',
  pg_temp.tentar($q$update public.despesas set status='PAGO', data_pagamento=current_date
    where descricao='Diesel da Ana'$q$), 'NEGADO');
select pg_temp.checar('administrador troca quem lancou a despesa',
  pg_temp.tentar($q$update public.despesas set criado_por='22222222-2222-2222-2222-222222222222'
    where descricao='Diesel da Ana'$q$), 'NEGADO');
select pg_temp.checar('administrador aponta um comprovante a mao',
  pg_temp.tentar($q$update public.despesas set comprovante_arquivo='despesas/2/nota-bruno.pdf'
    where descricao='Diesel da Ana'$q$), 'NEGADO');
select pg_temp.checar('administrador baixa a senha provisoria de outro sem troca',
  pg_temp.tentar($q$update public.perfis set senha_provisoria=false
    where id='33333333-3333-3333-3333-333333333333'$q$), 'NEGADO');
select pg_temp.checar('administrador recebe conta por update direto',
  pg_temp.tentar($q$update public.contas_receber set status='RECEBIDO',
      valor_recebido=1, data_recebimento=current_date where id=1$q$), 'NEGADO');
-- O que continua podendo: corrigir cadastro.
select pg_temp.checar('administrador corrige a descricao (deve passar)',
  pg_temp.tentar($q$update public.despesas set descricao='Diesel corrigido'
    where descricao='Diesel da Ana'$q$), 'PERMITIU');
select pg_temp.checar('...mas pagar sem aprovacao valida continua barrado pela constraint',
  pg_temp.tentar($q$update public.despesas set status='PAGO'
    where descricao='Diesel do Bruno'$q$), 'NEGADO');
reset role;
