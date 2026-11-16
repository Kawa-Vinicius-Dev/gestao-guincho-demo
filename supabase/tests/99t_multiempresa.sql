-- Multiempresa (14/11/2026): duas empresas no mesmo banco, e nenhuma enxerga,
-- altera ou aponta para nada da outra. Roda direto no banco, como quem abre o
-- console do navegador logado na empresa A e tenta alcancar a empresa B.
\set ON_ERROR_STOP on

create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
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
    if sqlstate in ('42501','P0001','23505','23503','23514','22023','P0002') then return 'NEGADO'; end if;
    return 'ERRO:' || sqlstate || ' ' || sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Cenario: empresa A (a nº 1, que ja existia) e empresa B, com os MESMOS nomes,
-- placas e numeros de proposito. Sem login, quem diz a empresa e app.empresa_id.
-- ---------------------------------------------------------------------------
\set A '00000000-0000-0000-0000-000000000001'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'

insert into public.empresas (id, nome, codigo) values (:'B', 'Guincho Beta', 'beta');

set app.empresa_id = '';
insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','gestor@a.local','{"nome":"Gestor A"}',
    '{"empresa_id":"00000000-0000-0000-0000-000000000001","perfil":"ADMINISTRADOR"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','soc@a.local','{"nome":"Socorrista A"}',
    '{"empresa_id":"00000000-0000-0000-0000-000000000001"}'),
 ('bbbbbbbb-0000-0000-0000-000000000001','gestor@b.local','{"nome":"Gestor B"}',
    '{"empresa_id":"bbbbbbbb-0000-0000-0000-000000000000","perfil":"ADMINISTRADOR"}'),
 ('bbbbbbbb-0000-0000-0000-000000000002','soc@b.local','{"nome":"Socorrista B"}',
    '{"empresa_id":"bbbbbbbb-0000-0000-0000-000000000000"}'),
 -- O desenvolvedor: login sem empresa.
 ('dddddddd-0000-0000-0000-000000000001','dev@anaiv.local','{"nome":"Dev"}','{}'),
 -- Quem tenta escolher a propria empresa pelo campo que o usuario controla.
 ('eeeeeeee-0000-0000-0000-000000000001','esperto@x.local',
    '{"nome":"Esperto","perfil":"ADMINISTRADOR","empresa_id":"bbbbbbbb-0000-0000-0000-000000000000"}','{}');
insert into public.desenvolvedores (usuario_id, nome) values ('dddddddd-0000-0000-0000-000000000001','Dev');

select pg_temp.checar('conta sem empresa nao ganha perfil (dev e esperto)',
  (select count(*)::text from public.perfis
    where id in ('dddddddd-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001')), '0');
select pg_temp.checar('perfil nasce na empresa do app_metadata',
  (select string_agg(left(id::text,1) || '=' || left(empresa_id::text,1), ',' order by id) from public.perfis),
  'a=0,a=0,b=b,b=b');

create or replace function pg_temp.povoar(p_letra text, p_gestor uuid, p_soc uuid, p_valor numeric) returns void
language plpgsql as $$
declare v_cat bigint; v_rec bigint; v_vei bigint; v_mot bigint; v_des bigint; v_tur bigint; v_imp bigint; v_cal bigint;
begin
  insert into public.categorias (nome,tipo) values ('Combustível','DESPESA') returning id into v_cat;
  insert into public.categorias (nome,tipo) values ('Serviços de guincho','RECEITA') returning id into v_rec;
  insert into public.veiculos (identificacao,placa,custo_por_km) values ('L01','AAA1A11',2) returning id into v_vei;
  insert into public.contratantes (nome) values ('Porto Seguro');
  insert into public.configuracao_comissao (empresa_id) values (public.empresa_atual()) on conflict do nothing;
  insert into public.motoristas (nome,perfil_id,qra) values ('Socorrista '||p_letra, p_soc, 'QRA1') returning id into v_mot;
  insert into public.despesas (descricao,categoria_id,valor,data_lancamento,criado_por,veiculo_id)
    values ('Diesel '||p_letra, v_cat, p_valor, current_date, p_soc, v_vei) returning id into v_des;
  insert into public.receitas (descricao,valor,data_competencia,status,data_recebimento,categoria_id)
    values ('Faturamento '||p_letra, p_valor * 100, current_date, 'RECEBIDA', current_date, v_rec);
  insert into public.calendario_pagamentos_porto (data_pagamento,descricao) values (current_date,'Ciclo') returning id into v_cal;
  insert into public.ordens_pagamento_porto (numero,valor_total,data_pagamento_programada,calendario_pagamento_id)
    values ('OP-1', p_valor * 10, current_date, v_cal);
  insert into public.importacoes_porto (nome_arquivo,hash_arquivo,status) values ('op.csv','h1','CONFIRMADA') returning id into v_imp;
  insert into public.turnos (motorista_id, veiculo_id, data_turno, hodometro_inicial, criado_por, foto_abertura, exige_checklist)
    values (v_mot, v_vei, current_date, 1000, p_soc, 'turnos/x/abertura.jpg', false) returning id into v_tur;
  insert into public.despesas_recorrentes (descricao,categoria_id,valor,dia_vencimento)
    values ('Internet '||p_letra, v_cat, p_valor, 5);
  insert into public.avaliacoes (nota, nome) values (5, 'Cliente '||p_letra);
  insert into storage.objects (bucket_id,name) values
    ('comprovantes', 'despesas/'||v_des||'/nota.pdf'),
    ('comprovantes', 'turnos/'||v_tur||'/abertura.jpg'),
    ('importacoes-porto', 'porto/'||v_imp||'/op.csv');
end $$;

insert into storage.buckets (id,name,public) values ('importacoes-porto','importacoes-porto',false) on conflict (id) do nothing;

set app.empresa_id = :'A';
select pg_temp.povoar('A','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002', 111);
set app.empresa_id = :'B';
-- Mesma placa, mesma categoria, mesmo QRA, mesma OP, mesmo hash: unico e por empresa.
select pg_temp.povoar('B','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002', 777);
set app.empresa_id = :'A';
select pg_temp.checar('dentro da mesma empresa a placa continua unica',
  pg_temp.tentar($q$insert into public.veiculos (identificacao,placa,custo_por_km) values ('L02','aaa1a11',2)$q$), 'NEGADO');
set app.empresa_id = '';

-- ---------------------------------------------------------------------------
\echo '===== 1. Estrutura: nenhuma tabela ou funcao ficou de fora ====='
-- ---------------------------------------------------------------------------
select pg_temp.checar('toda tabela de dados tem empresa_id obrigatorio',
  coalesce((select string_agg(c.relname, ',' order by c.relname) from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and c.relname not in ('empresas','desenvolvedores')
      and not exists (select 1 from pg_attribute a
                       where a.attrelid = c.oid and a.attname = 'empresa_id' and a.attnotnull)), ''), '');

select pg_temp.checar('toda tabela de dados tem RLS e a policy restritiva da empresa',
  coalesce((select string_agg(c.relname, ',' order by c.relname) from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and c.relname not in ('empresas','desenvolvedores')
      and (not c.relrowsecurity or not exists (
            select 1 from pg_policy p
             where p.polrelid = c.oid and p.polname = 'mesma_empresa' and not p.polpermissive))), ''), '');

select pg_temp.checar('toda funcao SECURITY DEFINER roda sob o papel que obedece a empresa',
  coalesce((select string_agg(p.proname, ',' order by p.proname) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.proowner <> 'funcoes_internas'::regrole
      and p.proname <> all (public.funcoes_fora_do_executor())), ''), '');

select pg_temp.checar('o papel das funcoes nao ignora RLS nem e superusuario',
  (select (rolbypassrls or rolsuper)::text from pg_roles where rolname = 'funcoes_internas'), 'false');

select pg_temp.checar('nenhuma tabela de dados forca RLS de um jeito e o dono de outro',
  (select count(*)::text from pg_class c where c.relnamespace = 'public'::regnamespace
     and c.relkind = 'r' and c.relowner = 'funcoes_internas'::regrole), '0');

-- ---------------------------------------------------------------------------
\echo '===== 2. Gestor da empresa A nao le nada da empresa B ====='
-- ---------------------------------------------------------------------------
select set_config('teste.despesa_b', (select id::text from public.despesas where descricao = 'Diesel B'), false);
select set_config('teste.veiculo_b', (select id::text from public.veiculos where empresa_id = :'B'), false);
select set_config('teste.categoria_a', (select id::text from public.categorias where empresa_id = :'A' and nome = 'Combustível'), false);
select set_config('teste.categoria_b', (select id::text from public.categorias where empresa_id = :'B' and nome = 'Combustível'), false);
select set_config('teste.motorista_b', (select id::text from public.motoristas where empresa_id = :'B'), false);


create or replace function pg_temp.vazamentos(p_outra uuid) returns text
language plpgsql as $$
declare t text; n bigint; achou text := '';
begin
  for t in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
              and c.relname not in ('empresas','desenvolvedores') order by 1
  loop
    begin
      execute format('select count(*) from public.%I where empresa_id = $1', t) into n using p_outra;
    exception when insufficient_privilege then n := 0;
    end;
    if n > 0 then achou := achou || t || '(' || n || ') '; end if;
  end loop;
  return achou;
end $$;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('gestor A: zero linhas da empresa B em todas as tabelas', pg_temp.vazamentos(:'B'), '');
select pg_temp.checar('gestor A ve as proprias despesas', (select count(*)::text from public.despesas), '1');
select pg_temp.checar('gestor A ve so os usuarios da empresa dele', (select count(*)::text from public.perfis), '2');
select pg_temp.checar('gestor A le so a propria empresa', (select string_agg(codigo, ',') from public.empresas), 'jms');
select pg_temp.checar('view de OPs conciliadas so traz as dele',
  (select count(*)::text from public.porto_ops_conciliadas), '1');

select pg_temp.checar('dashboard de A nao soma a receita de B (77700)',
  (public.dashboard_resumo(current_date, current_date, false)::text like '%77700%')::text, 'false');
select pg_temp.checar('dashboard de A traz a receita de A (11100)',
  (public.dashboard_resumo(current_date, current_date, false)::text like '%11100%')::text, 'true');
select pg_temp.checar('extrato de A nao traz lancamento de B',
  (select count(*)::text from public.extrato_financeiro(current_date, current_date) where descricao like '% B'), '0');
select pg_temp.checar('lucro por viatura de A nao lista a viatura de B',
  (select count(*)::text from public.lucro_por_viatura(current_date, current_date, false)
    where veiculo_id::text = current_setting('teste.veiculo_b')), '0');
select pg_temp.checar('producao por socorrista de A nao lista o socorrista B',
  (select count(*)::text from public.producao_por_socorrista(current_date, current_date, false)
    where socorrista like '% B'), '0');
select pg_temp.checar('resumo de OPs de A nao traz o valor da OP de B (7770)',
  (public.porto_resumo_ops(current_date, current_date)::text like '%7770%')::text, 'false');
select pg_temp.checar('fila de aprovacoes de A nao traz a despesa de B',
  (public.fila_de_aprovacoes(current_date, current_date)::text like '%Diesel B%')::text, 'false');
select pg_temp.checar('avaliacoes de A nao trazem o cliente de B',
  (public.listar_avaliacoes()::text like '%Cliente B%')::text, 'false');
select pg_temp.checar('avaliacoes de A trazem o cliente de A',
  (public.listar_avaliacoes()::text like '%Cliente A%')::text, 'true');

select pg_temp.checar('gestor A ve os 3 arquivos da empresa dele e nenhum de B',
  (select count(*)::text from storage.objects), '3');
reset role;

-- ---------------------------------------------------------------------------
\echo '===== 3. Gestor da empresa A nao escreve na empresa B ====='
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('gravar veiculo carimbado como da empresa B',
  pg_temp.tentar($q$insert into public.veiculos (identificacao,placa,custo_por_km,empresa_id)
    values ('X','ZZZ9Z99',1,'bbbbbbbb-0000-0000-0000-000000000000')$q$), 'NEGADO');
select pg_temp.checar('mover o proprio veiculo para a empresa B',
  pg_temp.tentar($q$update public.veiculos set empresa_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 'NEGADO');
select pg_temp.checar('alterar a despesa de B pelo id',
  pg_temp.tentar(format('update public.despesas set valor = 1 where id = %s', current_setting('teste.despesa_b'))), 'NEGADO');
select pg_temp.checar('apagar a despesa de B pelo id',
  pg_temp.tentar(format('delete from public.despesas where id = %s', current_setting('teste.despesa_b'))), 'NEGADO');
select pg_temp.checar('aprovar a despesa de B pela funcao',
  pg_temp.tentar(format('select public.aprovar_despesa(%s)', current_setting('teste.despesa_b'))), 'NEGADO');
select pg_temp.checar('despesa de A apontando para a viatura de B',
  pg_temp.tentar(format($q$insert into public.despesas (descricao,categoria_id,valor,data_lancamento,criado_por,veiculo_id)
    values ('Cruzada',%s,1,current_date,'aaaaaaaa-0000-0000-0000-000000000001',%s)$q$,
    current_setting('teste.categoria_a'), current_setting('teste.veiculo_b'))), 'NEGADO');
select pg_temp.checar('despesa de A na categoria de B',
  pg_temp.tentar(format($q$insert into public.despesas (descricao,categoria_id,valor,data_lancamento,criado_por)
    values ('Cruzada',%s,1,current_date,'aaaaaaaa-0000-0000-0000-000000000001')$q$,
    current_setting('teste.categoria_b'))), 'NEGADO');
select pg_temp.checar('despesa de A em nome de usuario de B',
  pg_temp.tentar(format($q$insert into public.despesas (descricao,categoria_id,valor,data_lancamento,criado_por)
    values ('Cruzada',%s,1,current_date,'bbbbbbbb-0000-0000-0000-000000000002')$q$,
    current_setting('teste.categoria_a'))), 'NEGADO');
select pg_temp.checar('ligar o socorrista de B a uma conta de A',
  pg_temp.tentar(format($q$update public.motoristas set perfil_id = 'aaaaaaaa-0000-0000-0000-000000000002' where id = %s$q$,
    current_setting('teste.motorista_b'))), 'NEGADO');
select pg_temp.checar('desligar o gestor de B',
  pg_temp.tentar($q$update public.perfis set ativo = false where id = 'bbbbbbbb-0000-0000-0000-000000000001'$q$), 'NEGADO');
select pg_temp.checar('mudar a si mesmo para a empresa B',
  pg_temp.tentar($q$update public.perfis set empresa_id = 'bbbbbbbb-0000-0000-0000-000000000000'
    where id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$), 'NEGADO');
select pg_temp.checar('renomear a propria empresa pela tabela',
  pg_temp.tentar($q$update public.empresas set nome = 'Hackeada'$q$), 'NEGADO');
select pg_temp.checar('criar empresa pela tabela',
  pg_temp.tentar($q$insert into public.empresas (nome,codigo) values ('Fantasma','fantasma')$q$), 'NEGADO');
select pg_temp.checar('ler a lista de desenvolvedores',
  pg_temp.tentar($q$select * from public.desenvolvedores$q$), 'NEGADO');
select pg_temp.checar('virar desenvolvedor',
  pg_temp.tentar($q$insert into public.desenvolvedores (usuario_id) values ('aaaaaaaa-0000-0000-0000-000000000001')$q$), 'NEGADO');
select pg_temp.checar('enviar arquivo na pasta da despesa de B',
  pg_temp.tentar(format($q$insert into storage.objects (bucket_id,name) values ('comprovantes','despesas/%s/falso.pdf')$q$,
    current_setting('teste.despesa_b'))), 'NEGADO');
select pg_temp.checar('apagar o comprovante da despesa de B',
  pg_temp.tentar(format($q$delete from storage.objects where name like 'despesas/%s/%%'$q$,
    current_setting('teste.despesa_b'))), 'NEGADO');

-- Comissao padrao: cada empresa tem a sua.
select public.definir_percentual_padrao(0.10);
select pg_temp.checar('A mudou a propria comissao padrao', public.percentual_comissao()::text, '0.1000');
reset role;

set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000001';
select pg_temp.checar('a comissao padrao de B nao mudou', public.percentual_comissao()::text, '0.2000');
select pg_temp.checar('gestor B: zero linhas da empresa A em todas as tabelas', pg_temp.vazamentos(:'A'), '');
select pg_temp.checar('a despesa de B continua inteira',
  (select valor::text || '/' || aprovada::text from public.despesas), '777.00/false');
select pg_temp.checar('dashboard de B traz a receita de B (77700)',
  (public.dashboard_resumo(current_date, current_date, false)::text like '%77700%')::text, 'true');
reset role;

\echo '===== 4. Socorrista: continua vendo so o que e dele, dentro da empresa dele ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select pg_temp.checar('socorrista A: zero linhas da empresa B', pg_temp.vazamentos(:'B'), '');
select pg_temp.checar('socorrista A ve a propria despesa', (select count(*)::text from public.despesas), '1');
select pg_temp.checar('socorrista A nao le receitas', (select count(*)::text from public.receitas), '0');
select pg_temp.checar('socorrista A lanca despesa e ela nasce na empresa A',
  pg_temp.tentar(format($q$insert into public.despesas (descricao,categoria_id,valor,data_lancamento,criado_por)
    values ('Pedagio A',%s,9,current_date,'aaaaaaaa-0000-0000-0000-000000000002')$q$,
    current_setting('teste.categoria_a'))), 'PERMITIU');
reset role;
select pg_temp.checar('a despesa nova ficou na empresa A',
  (select empresa_id::text from public.despesas where descricao = 'Pedagio A'), :'A');

-- ---------------------------------------------------------------------------
\echo '===== 5. Desenvolvedor: cria, conta e bloqueia; nao le dado de cliente ====='
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000001';
select pg_temp.checar('situacao do desenvolvedor', public.situacao_do_acesso(), 'DESENVOLVEDOR');
select pg_temp.checar('desenvolvedor nao le receitas', (select count(*)::text from public.receitas), '0');
select pg_temp.checar('desenvolvedor nao le despesas', (select count(*)::text from public.despesas), '0');
select pg_temp.checar('desenvolvedor nao chama o dashboard',
  pg_temp.tentar($q$select public.dashboard_resumo(current_date, current_date, false)$q$), 'NEGADO');
select pg_temp.checar('desenvolvedor nao le arquivos', (select count(*)::text from storage.objects), '0');
select pg_temp.checar('painel lista as duas empresas com as contagens',
  (select string_agg(codigo || ':' || gestores || '/' || usuarios_ativos || '/' || socorristas || '/' || viaturas, ' '
                     order by codigo) from public.plataforma_empresas()),
  'beta:1/2/1/1 jms:1/2/1/1');
select pg_temp.checar('painel lista os usuarios de uma empresa',
  (select string_agg(email, ',' order by email) from public.plataforma_usuarios(:'B')), 'gestor@b.local,soc@b.local');

select pg_temp.checar('cria empresa e o codigo sai do nome',
  (select codigo from public.plataforma_criar_empresa('Guincho São José')), 'guincho-sao-jose');
select pg_temp.checar('nome repetido e recusado',
  pg_temp.tentar($q$select public.plataforma_criar_empresa('guincho são josé')$q$), 'NEGADO');
select pg_temp.checar('codigo repetido e recusado',
  pg_temp.tentar($q$select public.plataforma_criar_empresa('Outra', 'beta')$q$), 'NEGADO');
reset role;
select pg_temp.checar('empresa nova nasce com categorias, contratante e comissao',
  (select (select count(*) from public.categorias c where c.empresa_id = e.id) || '/' ||
          (select count(*) from public.contratantes c where c.empresa_id = e.id) || '/' ||
          (select count(*) from public.configuracao_comissao c where c.empresa_id = e.id)
     from public.empresas e where e.codigo = 'guincho-sao-jose'), '6/1/1');

\echo '===== 6. So o desenvolvedor usa o painel ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('situacao do gestor', public.situacao_do_acesso(), 'ATIVO');
select pg_temp.checar('gestor nao lista empresas', pg_temp.tentar($q$select * from public.plataforma_empresas()$q$), 'NEGADO');
select pg_temp.checar('gestor nao lista usuarios de outra empresa',
  pg_temp.tentar($q$select * from public.plataforma_usuarios('bbbbbbbb-0000-0000-0000-000000000000')$q$), 'NEGADO');
select pg_temp.checar('gestor nao cria empresa', pg_temp.tentar($q$select public.plataforma_criar_empresa('Minha')$q$), 'NEGADO');
select pg_temp.checar('gestor nao bloqueia a concorrente',
  pg_temp.tentar($q$select public.plataforma_definir_empresa_ativa('bbbbbbbb-0000-0000-0000-000000000000', false)$q$), 'NEGADO');
select pg_temp.checar('gestor nao dispara as fixas de todas as empresas',
  pg_temp.tentar($q$select public.lancar_fixas_de_todas_as_empresas()$q$), 'NEGADO');
reset role;
set role authenticated;
set request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000001';
select pg_temp.checar('quem escreveu a empresa no proprio cadastro nao entra em nada', pg_temp.vazamentos(:'B'), '');
select pg_temp.checar('e a situacao dele e sem acesso', public.situacao_do_acesso(), 'SEM_ACESSO');
reset role;
set role anon;
reset request.jwt.claim.sub;
select pg_temp.checar('visitante nao lista empresas', pg_temp.tentar($q$select * from public.plataforma_empresas()$q$), 'NEGADO');
select pg_temp.checar('visitante nao le a tabela de empresas', pg_temp.tentar($q$select * from public.empresas$q$), 'NEGADO');
select pg_temp.checar('visitante nao cria empresa', pg_temp.tentar($q$select public.plataforma_criar_empresa('Anon')$q$), 'NEGADO');
reset role;

-- ---------------------------------------------------------------------------
\echo '===== 7. Bloquear a empresa tira o acesso de todos dela, e so dela ====='
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000001';
select pg_temp.checar('desenvolvedor bloqueia B',
  (select ativa::text || '/' || motivo_bloqueio from public.plataforma_definir_empresa_ativa(:'B', false, ' Mensalidade em atraso ')),
  'false/Mensalidade em atraso');
reset role;
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000001';
select pg_temp.checar('gestor de empresa bloqueada: situacao', public.situacao_do_acesso(), 'EMPRESA_BLOQUEADA');
select pg_temp.checar('gestor de empresa bloqueada nao e mais administrador', public.e_administrador()::text, 'false');
select pg_temp.checar('gestor de empresa bloqueada nao le despesas', (select count(*)::text from public.despesas), '0');
select pg_temp.checar('gestor de empresa bloqueada nao le o proprio perfil', (select count(*)::text from public.perfis), '0');
select pg_temp.checar('gestor de empresa bloqueada nao chama o dashboard',
  pg_temp.tentar($q$select public.dashboard_resumo(current_date, current_date, false)$q$), 'NEGADO');
select pg_temp.checar('gestor de empresa bloqueada nao grava',
  pg_temp.tentar($q$insert into public.veiculos (identificacao,placa,custo_por_km) values ('L09','BBB2B22',1)$q$), 'NEGADO');
reset role;
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('a empresa A segue normal', (select count(*)::text from public.despesas), '2');
reset role;
set role authenticated;
set request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000001';
select pg_temp.checar('desenvolvedor reativa B',
  (select ativa::text || '/' || coalesce(motivo_bloqueio, '-') from public.plataforma_definir_empresa_ativa(:'B', true)), 'true/-');
reset role;
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000001';
select pg_temp.checar('reativada, B volta com tudo o que tinha', (select count(*)::text from public.despesas), '1');
reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
\echo '===== 8. Avaliacao publica cai na empresa do link ====='
-- ---------------------------------------------------------------------------
set role anon;
select public.avaliar(4, 'Pelo link da Beta', null, null, 'BETA');
select public.avaliar(5, 'Pelo link antigo', null, null);
select pg_temp.checar('a pagina publica le o nome da empresa do link', public.empresa_do_link(' Beta '), 'Guincho Beta');
select pg_temp.checar('codigo inexistente nao devolve nome', coalesce(public.empresa_do_link('nao-existe'), '-'), '-');
select pg_temp.checar('link com codigo inexistente',
  pg_temp.tentar($q$select public.avaliar(5, 'x', null, null, 'nao-existe')$q$), 'NEGADO');
reset role;
select pg_temp.checar('a avaliacao com codigo foi para B',
  (select empresa_id::text from public.avaliacoes where nome = 'Pelo link da Beta'), :'B');
select pg_temp.checar('a avaliacao do link antigo foi para a empresa nº 1',
  (select empresa_id::text from public.avaliacoes where nome = 'Pelo link antigo'), :'A');

-- ---------------------------------------------------------------------------
\echo '===== 9. Despesas fixas automaticas: cada empresa recebe a sua ====='
-- ---------------------------------------------------------------------------
set app.empresa_id = '';
select pg_temp.checar('o agendador lanca uma fixa por empresa',
  public.lancar_fixas_de_todas_as_empresas((date_trunc('month', current_date) + interval '10 days')::date)::text, '2');
select pg_temp.checar('cada fixa caiu na empresa da sua recorrencia',
  (select string_agg(left(d.empresa_id::text, 1) || ':' || d.descricao, ' ' order by d.descricao)
     from public.despesas d where d.despesa_recorrente_id is not null),
  '0:Internet A b:Internet B');
select pg_temp.checar('quem aprovou a fixa de B e o gestor de B',
  (select aprovado_por::text from public.despesas where descricao = 'Internet B'), 'bbbbbbbb-0000-0000-0000-000000000001');
select pg_temp.checar('rodar de novo nao duplica',
  public.lancar_fixas_de_todas_as_empresas((date_trunc('month', current_date) + interval '10 days')::date)::text, '0');

\echo '================ MULTIEMPRESA: TODOS OS TESTES PASSARAM ================'
