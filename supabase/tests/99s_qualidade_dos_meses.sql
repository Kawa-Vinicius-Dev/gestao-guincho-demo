-- Qualidade dos meses: o mes com bem menos servicos que os outros e marcado parcial.
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
insert into public.motoristas (nome) values ('ANA');
insert into public.ordens_pagamento_porto (numero, valor_total, periodo_inicio, periodo_fim) values
 ('OP-JUL',0,'2026-07-01','2026-07-31'),('OP-AGO',0,'2026-08-01','2026-08-31'),
 ('OP-SET',0,'2026-09-01','2026-09-30'),('OP-OUT',0,'2026-10-01','2026-10-31');
-- jul 4, ago 4, set 4 servicos; out so 1 (faltou importar o resto).
insert into public.ordens_servico_porto (numero, numero_normalizado, ordem_pagamento_id, valor_total, data_atendimento, motorista_id)
select 'S'||g||'-'||m, 'S'||g||'-'||m, m, 100, ('2026-0'||(6+m)||'-0'||g)::date, 1
from generate_series(1,4) g, generate_series(1,3) m;
insert into public.ordens_servico_porto (numero, numero_normalizado, ordem_pagamento_id, valor_total, data_atendimento, motorista_id)
 values ('O1','O1',4,100,'2026-10-03',1);
select public.porto_recalcular_periodos();

select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);
set role authenticated;

\echo '===== administrador ====='
select pg_temp.checar('contagem por mes',
  (select string_agg(mes||'='||servicos, ',' order by mes) from public.qualidade_dos_meses(4,'2026-11-05')), '2026-07=4,2026-08=4,2026-09=4,2026-10=1');
select pg_temp.checar('outubro e parcial (1 contra media 4)',
  (select parcial::text from public.qualidade_dos_meses(4,'2026-11-05') where mes='2026-10'), 'true');
select pg_temp.checar('meses cheios nao sao parciais',
  (select count(*)::text from public.qualidade_dos_meses(4,'2026-11-05') where parcial), '1');
select pg_temp.checar('% do outubro em relacao aos outros',
  (select pct_dos_outros::text from public.qualidade_dos_meses(4,'2026-11-05') where mes='2026-10'), '25.00');
select pg_temp.checar('olhando so ate setembro nada e parcial',
  (select count(*)::text from public.qualidade_dos_meses(3,'2026-10-01') where parcial), '0');
select pg_temp.checar('um mes so: nao ha com o que comparar',
  (select parcial::text from public.qualidade_dos_meses(1,'2026-11-05')), 'false');
do $$ begin
  perform * from public.qualidade_dos_meses(0);
  raise exception 'FALHOU  | aceitou 0 meses';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSOU  | p_meses invalido recusado';
end $$;

\echo '===== quem nao e administrador nao passa ====='
reset role;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000002',false);
set role authenticated;
do $$ begin
  perform * from public.qualidade_dos_meses(4,'2026-11-05');
  raise exception 'FALHOU  | funcionario leu a qualidade dos meses';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSOU  | funcionario barrado';
end $$;

\echo '===== sem login nao passa ====='
reset role;
select set_config('request.jwt.claim.sub','',false);
set role anon;
do $$ begin
  perform * from public.qualidade_dos_meses(4,'2026-11-05');
  raise exception 'FALHOU  | anon executou qualidade_dos_meses';
exception when insufficient_privilege then
  raise notice 'PASSOU  | anon sem permissao de executar';
end $$;
reset role;
