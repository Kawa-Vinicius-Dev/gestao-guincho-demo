-- Regra dos 15 dias (Kawa, 15/10/2026): a OP fica dentro de um mes — a da 1a
-- quinzena comeca no dia 1, a da 2a no dia seguinte ao fim da 1a — e termina no
-- ultimo servico; OS atrasada nao estica o periodo; correcao manual
-- manda; OPs da mesma quinzena dividem o periodo; trecho sem OP vira quinzena
-- de calendario; o socorrista ve o periodo em aberto.
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
insert into public.motoristas (nome, perfil_id) values ('DJALMA', 'aaaaaaaa-0000-0000-0000-000000000002');

-- A Porto declara datas que nao fecham 15 dias; a regra nova ignora.
insert into public.ordens_pagamento_porto (numero, valor_total, periodo_inicio, periodo_fim) values
 ('OP-SET1', 0, '2026-09-01', '2026-09-14'),   -- 1
 ('OP-SET2', 0, '2026-09-17', '2026-09-29'),   -- 2: a do print (17/09 a 29/09)
 ('OP-OUT1', 0, null, null),                   -- 3: correcao manual 01/10 a 15/10
 ('OP-OUT2A', 0, null, null),                  -- 4: mesma quinzena da 5
 ('OP-OUT2B', 0, null, null),                  -- 5
 ('OP-DEZ1', 0, null, null);                   -- 6: depois de um trecho sem OP

insert into public.ordens_servico_porto (numero, numero_normalizado, ordem_pagamento_id, valor_total, data_atendimento, motorista_id) values
 ('A1', 'A1', 1, 100, '2026-09-02', 1),
 ('A2', 'A2', 1, 100, '2026-09-15', 1),        -- ultimo servico da 1: 15/09
 ('A3', 'A3', 1, 100, '2026-06-20', 1),        -- atrasada de junho: nao estica
 ('B1', 'B1', 2, 100, '2026-09-15', 1),        -- veio na OP seguinte
 ('B2', 'B2', 2, 100, '2026-10-01', 1),        -- dia 1 do mes seguinte: ultimo da 2
 ('C1', 'C1', 3, 100, '2026-10-10', 1),
 ('D1', 'D1', 4, 100, '2026-10-30', 1),
 ('E1', 'E1', 5, 100, '2026-10-31', 1),
 ('F1', 'F1', 6, 100, '2026-12-14', 1);

update public.ordens_pagamento_porto set quinzena_inicio = '2026-10-02', quinzena_entrega = '2026-10-15' where id = 3;
select public.porto_recalcular_periodos();

\echo '===== Periodo de cada OP ====='
select pg_temp.checar('primeira OP: quinzena de calendario ate o ultimo servico, sem esticar pela atrasada',
  (select periodo_inicio || ' ' || periodo_fim from public.ordens_pagamento_porto where id = 1), '2026-09-01 2026-09-15');
select pg_temp.checar('2a quinzena: do dia seguinte a 1a ate o ultimo servico, sem passar do fim do mes',
  (select periodo_inicio || ' ' || periodo_fim from public.ordens_pagamento_porto where id = 2), '2026-09-16 2026-09-30');
select pg_temp.checar('correcao manual manda',
  (select periodo_inicio || ' ' || periodo_fim from public.ordens_pagamento_porto where id = 3), '2026-10-02 2026-10-15');
select pg_temp.checar('duas OPs da mesma quinzena dividem o periodo, colado na manual',
  (select string_agg(periodo_inicio || ' ' || periodo_fim, ',' order by id) from public.ordens_pagamento_porto where id in (4, 5)),
  '2026-10-16 2026-10-31,2026-10-16 2026-10-31');
select pg_temp.checar('depois de trecho sem OP: quinzena de calendario do fim',
  (select periodo_inicio || ' ' || periodo_fim from public.ordens_pagamento_porto where id = 6), '2026-12-01 2026-12-14');

\echo '===== A OS fica na OP dela ====='
select pg_temp.checar('a OS atrasada de junho conta na quinzena da OP 1',
  (select competencia_inicio || ' ' || competencia_fim from public.porto_os_situacao() where os_id = 3), '2026-09-01 2026-09-15');
select pg_temp.checar('a OS de 15/09 que veio na OP 2 conta na OP 2',
  (select competencia_fim::text from public.porto_os_situacao() where os_id = 4), '2026-09-30');
select pg_temp.checar('a OS de 01/10 que veio na OP 2 tambem fica nela',
  (select competencia_fim::text from public.porto_os_situacao() where os_id = 5), '2026-09-30');
select pg_temp.checar('o trecho sem OP (novembro) vira quinzenas provisorias',
  (select string_agg(inicio || '/' || fim, ',' order by fim) from public.porto_competencias()
    where not tem_op and fim between '2026-11-01' and '2026-11-30'), '2026-11-01/2026-11-15,2026-11-16/2026-11-30');

\echo '===== Correcao desfeita volta ao calculo ====='
update public.ordens_pagamento_porto set quinzena_inicio = null, quinzena_entrega = null where id = 3;
select public.porto_recalcular_periodos();
select pg_temp.checar('sem a correcao, a OP 3 e a 1a quinzena: do dia 1 ate o ultimo servico',
  (select periodo_inicio || ' ' || periodo_fim from public.ordens_pagamento_porto where id = 3), '2026-10-01 2026-10-10');
select pg_temp.checar('e a seguinte se cola nela',
  (select periodo_inicio::text from public.ordens_pagamento_porto where id = 4), '2026-10-11');

\echo '===== Meus servicos: o periodo em aberto ====='
-- Datas relativas a hoje: a ultima OP fechou ha 10 dias.
delete from public.ordens_servico_porto;
delete from public.ordens_pagamento_porto;
insert into public.ordens_pagamento_porto (numero, valor_total) values ('OP-ULTIMA', 0);
insert into public.ordens_servico_porto (numero, numero_normalizado, ordem_pagamento_id, valor_total, data_atendimento, motorista_id)
select 'H1', 'H1', id, 100, current_date - 10, 1 from public.ordens_pagamento_porto where numero = 'OP-ULTIMA';
insert into public.ordens_servico_porto (numero, numero_normalizado, ordem_pagamento_id, valor_total, data_atendimento, motorista_id) values
 ('H2', 'H2', null, 0, current_date - 12, 1),  -- antes do fim da OP, sem OP: fica de fora
 ('H3', 'H3', null, 0, current_date - 2, 1);   -- periodo em aberto
select public.porto_recalcular_periodos();
-- O socorrista nao enxerga a tabela de OPs: o esperado sai antes de trocar de perfil.
select (periodo_fim + 1)::text as inicio_esperado from public.ordens_pagamento_porto where numero = 'OP-ULTIMA' \gset
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select pg_temp.checar('do dia seguinte a ultima OP ate hoje',
  (select ((x ->> 'inicio')::date = :'inicio_esperado'::date)
          || ' ' || ((x ->> 'fim')::date = current_date)
          || ' ' || jsonb_array_length(x -> 'servicos') || ' ' || (x -> 'servicos' -> 0 ->> 'numeroOs')
     from (select public.meus_servicos_em_aberto() as x) s),
  'true true 1 H3');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
