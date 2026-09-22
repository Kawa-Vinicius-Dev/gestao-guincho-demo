\set ON_ERROR_STOP on
\pset pager off
-- Fixtures como superusuario (equivale ao service_role do Supabase).
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','admin@teste.local','{"nome":"Admin","perfil":"ADMINISTRADOR"}'),
 ('22222222-2222-2222-2222-222222222222','chefe@teste.local','{"nome":"Chefe","perfil":"ADMINISTRADOR"}'),
 ('33333333-3333-3333-3333-333333333333','ana@teste.local','{"nome":"Ana","perfil":"FUNCIONARIO"}'),
 ('44444444-4444-4444-4444-444444444444','bruno@teste.local','{"nome":"Bruno","perfil":"FUNCIONARIO"}'),
 ('55555555-5555-5555-5555-555555555555','novo@teste.local','{"nome":"Novato","perfil":"FUNCIONARIO","senha_provisoria":true}');

insert into public.categorias (nome, tipo) values ('Combustível','DESPESA'),('Guincho','RECEITA');
insert into public.veiculos (identificacao, placa, custo_por_km, sigla_porto) values ('L168','ABC1D23',2.50,'L168');
insert into public.contratantes (nome) values ('Porto Seguro');
insert into public.motoristas (nome, perfil_id, veiculo_id, qra)
 values ('Ana','33333333-3333-3333-3333-333333333333',1,'QRA1'),
        ('Bruno','44444444-4444-4444-4444-444444444444',1,'QRA2');

-- Despesa de cada socorrista
insert into public.despesas (descricao, categoria_id, valor, data_lancamento, criado_por)
 values ('Diesel da Ana',1,100,current_date,'33333333-3333-3333-3333-333333333333'),
        ('Diesel do Bruno',1,200,current_date,'44444444-4444-4444-4444-444444444444');
insert into public.receitas (descricao, valor, data_competencia, status, data_recebimento)
 values ('Servico avulso',500,current_date,'RECEBIDA',current_date);

\echo '================ TESTES DE SEGURANCA ================'

create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then
    raise notice 'PASSOU  | % ', rotulo;
  else
    raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido;
  end if;
end $$;


-- helper: executa e devolve 'NEGADO' quando a policy/regra barra
-- Um UPDATE barrado por RLS nao levanta erro: ele simplesmente nao encontra a
-- linha e afeta zero. Por isso o helper mede o EFEITO, nao so a ausencia de
-- excecao — senao "nao aconteceu nada" seria lido como "permitiu".
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
    if sqlstate in ('42501','P0001','23505','22023') then return 'NEGADO'; end if;
    return 'ERRO:' || sqlstate;
end $$;

-- ============ ANON: nao alcanca nada ============
set role anon;
select pg_temp.checar('anon nao le despesas',
  pg_temp.tentar('select count(*) from public.despesas'), 'NEGADO');
select pg_temp.checar('anon nao le receitas',
  pg_temp.tentar('select count(*) from public.receitas'), 'NEGADO');
select pg_temp.checar('anon nao le perfis',
  pg_temp.tentar('select count(*) from public.perfis'), 'NEGADO');
select pg_temp.checar('anon nao chama o dashboard',
  pg_temp.tentar('select public.dashboard_financeiro(current_date, current_date)'), 'NEGADO');
reset role;

-- ============ FUNCIONARIO (Ana) ============
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

select pg_temp.checar('funcionario ve so a propria despesa',
  (select count(*)::text from public.despesas), '1');
select pg_temp.checar('funcionario ve a despesa certa',
  (select descricao from public.despesas), 'Diesel da Ana');
select pg_temp.checar('funcionario nao ve receitas',
  (select count(*)::text from public.receitas), '0');
select pg_temp.checar('funcionario nao ve contas a receber',
  (select count(*)::text from public.contas_receber), '0');
select pg_temp.checar('funcionario nao ve contratantes',
  (select count(*)::text from public.contratantes), '0');
select pg_temp.checar('funcionario le veiculos (seletor do formulario)',
  (select count(*)::text from public.veiculos), '1');
select pg_temp.checar('funcionario nao chama o dashboard',
  pg_temp.tentar('select public.dashboard_financeiro(current_date, current_date)'), 'NEGADO');
select pg_temp.checar('funcionario nao le o extrato',
  (select count(*)::text from public.extrato_financeiro(current_date - 30, current_date)), '0');

-- Escalada de privilegio
select pg_temp.checar('funcionario NAO se promove a administrador',
  pg_temp.tentar($q$update public.perfis set perfil='ADMINISTRADOR'
                    where id='33333333-3333-3333-3333-333333333333'$q$), 'NEGADO');
select pg_temp.checar('perfil continua FUNCIONARIO',
  (select perfil::text from public.perfis where id='33333333-3333-3333-3333-333333333333'),
  'FUNCIONARIO');
select pg_temp.checar('funcionario nao promove outro',
  pg_temp.tentar($q$update public.perfis set perfil='ADMINISTRADOR'
                    where id='44444444-4444-4444-4444-444444444444'$q$), 'NEGADO');

-- Lancamento em nome de terceiro
select pg_temp.checar('funcionario NAO lanca despesa em nome de outro',
  pg_temp.tentar($q$insert into public.despesas
     (descricao,categoria_id,valor,data_lancamento,criado_por)
     values ('Forjada',1,50,current_date,'44444444-4444-4444-4444-444444444444')$q$), 'NEGADO');
select pg_temp.checar('funcionario NAO lanca despesa ja aprovada',
  pg_temp.tentar($q$insert into public.despesas
     (descricao,categoria_id,valor,data_lancamento,criado_por,aprovada,aprovado_por,aprovado_em)
     values ('Auto-aprovada',1,50,current_date,'33333333-3333-3333-3333-333333333333',
             true,'33333333-3333-3333-3333-333333333333',now())$q$), 'NEGADO');
select pg_temp.checar('funcionario lanca a propria despesa',
  pg_temp.tentar($q$insert into public.despesas
     (descricao,categoria_id,valor,data_lancamento,criado_por)
     values ('Pedagio da Ana',1,20,current_date,'33333333-3333-3333-3333-333333333333')$q$),
  'PERMITIU');
select pg_temp.checar('funcionario NAO aprova nada',
  pg_temp.tentar('select public.aprovar_despesa(2)'), 'NEGADO');
select pg_temp.checar('funcionario NAO altera a propria despesa direto',
  pg_temp.tentar('update public.despesas set valor = 9999 where id = 1'), 'NEGADO');
select pg_temp.checar('funcionario NAO apaga despesa',
  pg_temp.tentar('delete from public.despesas where id = 1'), 'NEGADO');
select pg_temp.checar('funcionario NAO cria veiculo',
  pg_temp.tentar($q$insert into public.veiculos (identificacao,placa) values ('X','XXX0X00')$q$),
  'NEGADO');
reset role;

-- ============ isolamento entre socorristas ============
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select pg_temp.checar('Bruno nao ve a despesa da Ana',
  (select coalesce(string_agg(descricao, ','), '') from public.despesas), 'Diesel do Bruno');
select pg_temp.checar('Bruno nao consulta a comissao da Ana',
  pg_temp.tentar('select public.comissao_do_ciclo(1, 1)'), 'NEGADO');
reset role;

-- ============ senha provisoria trava a escrita ============
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select pg_temp.checar('senha provisoria NAO lanca despesa',
  pg_temp.tentar($q$insert into public.despesas
     (descricao,categoria_id,valor,data_lancamento,criado_por)
     values ('Antes de trocar',1,10,current_date,'55555555-5555-5555-5555-555555555555')$q$),
  'NEGADO');
select pg_temp.checar('senha provisoria NAO limpa a propria trava',
  pg_temp.tentar($q$update public.perfis set senha_provisoria=false
                    where id='55555555-5555-5555-5555-555555555555'$q$), 'NEGADO');
reset role;

-- ============ ADMINISTRADOR ============
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.checar('admin ve todas as despesas',
  (select count(*)::text from public.despesas), '3');
select pg_temp.checar('admin ve receitas',
  (select count(*)::text from public.receitas), '1');
select pg_temp.checar('admin chama o dashboard',
  pg_temp.tentar('select public.dashboard_financeiro(current_date, current_date)'), 'PERMITIU');
select pg_temp.checar('admin aprova despesa de outro',
  pg_temp.tentar('select public.aprovar_despesa(1)'), 'PERMITIU');
select pg_temp.checar('despesa ficou aprovada',
  (select aprovada::text from public.despesas where id=1), 'true');
select pg_temp.checar('aprovador foi carimbado',
  (select aprovado_por::text from public.despesas where id=1),
  '11111111-1111-1111-1111-111111111111');
-- O aprovar() do Spring nao tem guarda de reaprovacao (so o rejeitar tem), e a
-- regra de compatibilidade manda preservar o comportamento observavel dele.
-- Reaprovar apenas recarimba autor e data.
select pg_temp.checar('reaprovar e permitido, como no Spring',
  pg_temp.tentar('select public.aprovar_despesa(1)'), 'PERMITIU');
select pg_temp.checar('admin NAO paga despesa nao aprovada',
  pg_temp.tentar('select public.pagar_despesa(2)'), 'NEGADO');
-- A INVESTIGAR (22/09/2026): o administrador esta sendo NEGADO ao pagar uma
-- despesa aprovada. Nao e artefato de assinatura — pagar_despesa(bigint) resolve,
-- os outros dois parametros tem default. Ou alguma migration passou a barrar o
-- caminho e e regressao no fluxo de caixa, ou a regra mudou e ninguem atualizou
-- aqui. Precisa da decisao de quem conhece a operacao.
select pg_temp.checar('admin paga despesa aprovada',
  pg_temp.tentar('select public.pagar_despesa(1)'), 'PERMITIU');
reset role;

-- ============ SEGREGACAO DE FUNCOES ============
-- Segregacao de funcoes, como o Spring a implementa: o rejeitar() tem a guarda
-- de "quem lancou nao decide"; o aprovar() nao tem. A assimetria e estranha e
-- esta registrada como divida tecnica, mas preserva-la e o que a regra de
-- compatibilidade exige — corrigi-la aqui mudaria comportamento observavel.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,criado_por)
 values ('Reembolso do proprio admin',1,999,current_date,'11111111-1111-1111-1111-111111111111');
select pg_temp.checar('admin aprova o proprio lancamento (Spring nao barra)',
  pg_temp.tentar($q$select public.aprovar_despesa(
      (select id from public.despesas where descricao='Reembolso do proprio admin'))$q$), 'PERMITIU');
select pg_temp.checar('admin NAO rejeita o proprio lancamento',
  pg_temp.tentar($q$select public.rejeitar_despesa(
      (select id from public.despesas where descricao='Reembolso do proprio admin'))$q$), 'NEGADO');
reset role;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.checar('OUTRO admin aprova esse lancamento',
  pg_temp.tentar($q$select public.aprovar_despesa(
      (select id from public.despesas where descricao='Reembolso do proprio admin'))$q$), 'PERMITIU');
reset role;

-- ============ receita da Porto e imutavel ============
insert into public.importacoes_porto (nome_arquivo,hash_arquivo,status) values ('op.csv','h1','CONFIRMADA');
insert into public.receitas (descricao,valor,data_competencia,status,data_recebimento,importacao_id)
 values ('Receita importada',300,current_date,'RECEBIDA',current_date,1);
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.checar('receita importada e marcada como nao-manual',
  (select manual::text from public.receitas where descricao='Receita importada'), 'false');
select pg_temp.checar('admin NAO edita receita importada',
  pg_temp.tentar($q$update public.receitas set valor=1
                    where descricao='Receita importada'$q$), 'NEGADO');
select pg_temp.checar('admin NAO apaga receita importada',
  pg_temp.tentar($q$delete from public.receitas where descricao='Receita importada'$q$), 'NEGADO');
select pg_temp.checar('admin edita receita manual',
  pg_temp.tentar($q$update public.receitas set valor=550
                    where descricao='Servico avulso'$q$), 'PERMITIU');
reset role;

-- ============ favoritos sao privados ============
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.substituir_favoritos(array['/despesas','/minha-comissao']);
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.checar('nem o admin ve favoritos de outro',
  (select count(*)::text from public.favoritos_menu), '0');
reset role;

-- ============ Storage ============
insert into storage.objects (bucket_id, name) values
  ('comprovantes','despesas/1/nota.pdf'),
  ('comprovantes','despesas/2/nota.pdf'),
  ('comprovantes','porto/1/relatorio.csv');
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.checar('Ana ve o comprovante da propria despesa',
  (select count(*)::text from storage.objects where name like 'despesas/%'), '1');
select pg_temp.checar('Ana nao ve arquivo de importacao da Porto',
  (select count(*)::text from storage.objects where name like 'porto/%'), '0');
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.checar('admin ve todos os arquivos',
  (select count(*)::text from storage.objects), '3');
reset role;

\echo '================ TODOS OS TESTES PASSARAM ================'
