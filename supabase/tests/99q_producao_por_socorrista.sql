-- Producao por socorrista: quanto cada um produziu e quanto isso e da media da
-- equipe. Quem so tem despesa no periodo nao puxa a media para baixo.
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
insert into public.categorias (nome,tipo) values ('Alimentação','DESPESA');
insert into public.motoristas (nome) values ('ANA'), ('BRUNO'), ('CARLA'), ('DIOGO');

insert into public.ordens_pagamento_porto (numero, valor_total, periodo_inicio, periodo_fim) values
 ('OP-SET', 0, '2026-09-01', '2026-09-30');

-- ANA 4 servicos (2000), BRUNO 2 (1000), CARLA 1 (500). DIOGO nao fez nenhum.
insert into public.ordens_servico_porto (numero, numero_normalizado, ordem_pagamento_id, valor_total, data_atendimento, motorista_id) values
 ('A1','A1',1,500,'2026-09-02',1),('A2','A2',1,500,'2026-09-03',1),('A3','A3',1,500,'2026-09-04',1),('A4','A4',1,500,'2026-09-05',1),
 ('B1','B1',1,500,'2026-09-06',2),('B2','B2',1,500,'2026-09-07',2),
 ('C1','C1',1,500,'2026-09-08',3);
select public.porto_recalcular_periodos();

-- DIOGO so tem despesa propria no mes: aparece na lista, mas nao entra na media.
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,status,aprovada,
  aprovado_por,aprovado_em,data_pagamento,motorista_id,criado_por,natureza) values
 ('Marmita DIOGO',(select id from public.categorias where nome='Alimentação'),60,'2026-09-09','PAGO',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),'2026-09-09',4,'aaaaaaaa-0000-0000-0000-000000000002','ALIMENTACAO_FUNCIONARIO');

select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);
set role authenticated;

\echo '===== administrador ====='
select pg_temp.checar('ordem: quem mais produziu primeiro',
  (select string_agg(socorrista, ',' order by posicao, socorrista) from public.producao_por_socorrista('2026-09-01','2026-09-30')),
  'ANA,BRUNO,CARLA,DIOGO');
select pg_temp.checar('producao e servicos da ANA',
  (select servicos || '/' || producao from public.producao_por_socorrista('2026-09-01','2026-09-30') where socorrista='ANA'), '4/2000.00');
select pg_temp.checar('ticket medio',
  (select ticket_medio::text from public.producao_por_socorrista('2026-09-01','2026-09-30') where socorrista='BRUNO'), '500.00');
select pg_temp.checar('media da equipe = (2000+1000+500)/3, sem o DIOGO',
  (select distinct media_da_equipe::text from public.producao_por_socorrista('2026-09-01','2026-09-30')), '1166.67');
select pg_temp.checar('% da media: ANA acima, CARLA bem abaixo',
  (select string_agg(socorrista || '=' || pct_da_media, ',' order by posicao) from public.producao_por_socorrista('2026-09-01','2026-09-30') where servicos > 0),
  'ANA=171.43,BRUNO=85.71,CARLA=42.86');
select pg_temp.checar('posicao: 1, 2, 3, 4',
  (select string_agg(posicao::text, ',' order by posicao) from public.producao_por_socorrista('2026-09-01','2026-09-30')), '1,2,3,4');
select pg_temp.checar('quem so tem despesa aparece com producao zero e sem ticket',
  (select producao || '/' || despesas || '/' || (ticket_medio is null) from public.producao_por_socorrista('2026-09-01','2026-09-30') where socorrista='DIOGO'), '0/60.00/true');

\echo '===== periodo vazio ====='
select pg_temp.checar('periodo sem movimento: nenhuma linha',
  (select count(*)::text from public.producao_por_socorrista('2025-01-01','2025-01-31')), '0');

\echo '===== quem nao e administrador nao passa ====='
reset role;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000002',false);
set role authenticated;
do $$ begin
  perform * from public.producao_por_socorrista('2026-09-01','2026-09-30');
  raise exception 'FALHOU  | funcionario leu a producao da equipe';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSOU  | funcionario barrado: %', sqlerrm;
end $$;

\echo '===== sem login nao passa ====='
reset role;
select set_config('request.jwt.claim.sub','',false);
set role anon;
do $$ begin
  perform * from public.producao_por_socorrista('2026-09-01','2026-09-30');
  raise exception 'FALHOU  | anon executou producao_por_socorrista';
exception when insufficient_privilege then
  raise notice 'PASSOU  | anon sem permissao de executar';
end $$;
reset role;
