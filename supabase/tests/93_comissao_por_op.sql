-- A % da comissao muda por OP e o padrao da empresa e editavel.
--
-- Kawa, 22/09/2026: "em certas OPs ele usa 17%, as vezes usa 20%". A % da OP
-- vale para todos daquela OP e passa por cima da taxa do socorrista; o padrao
-- muda o que ainda nao fechou.
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
insert into public.motoristas (nome,perfil_id) values ('Anderson','aaaaaaaa-0000-0000-0000-000000000002'), ('Djalma',null);

insert into public.ordens_pagamento_porto (numero,valor_total,data_pagamento_programada)
 values ('OP-A',2000,'2026-10-05');
insert into public.ordens_servico_porto
 (numero,numero_normalizado,data_atendimento,valor_total,motorista_id,ordem_pagamento_id,status_financeiro,status_operacional)
 values ('OS-1','OS1','2026-09-10',1000,1,1,'RECEBIDO','PROCESSADO'),
        ('OS-2','OS2','2026-09-11',1000,2,1,'RECEBIDO','PROCESSADO');
select public.porto_recalcular_periodos();
select public.porto_sincronizar_comissoes();

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== Sem % na OP, vale o padrao (20%) ====='
select pg_temp.checar('comissao do Anderson na OP e 200',
  (select valor::text from public.despesas where protocolo = 'COMISSAO-OP-1-1'), '200.00');

\echo '===== OP a 17% vale para todos daquela OP ====='
select public.definir_percentual_da_op(1, 0.17);
select pg_temp.checar('Anderson passa a 170',
  (select valor::text from public.despesas where protocolo = 'COMISSAO-OP-1-1'), '170.00');
select pg_temp.checar('Djalma tambem',
  (select valor::text from public.despesas where protocolo = 'COMISSAO-OP-1-2'), '170.00');
select pg_temp.checar('a lista de Comissoes usa a % da OP',
  (select (e ->> 'comissaoBruta') from jsonb_array_elements(public.resumo_comissoes_ops(array[1]::bigint[])) e
    where (e ->> 'motoristaId')::int = 1), '170.00');
select pg_temp.checar('a tela de OS usa a % da OP',
  (public.porto_listar_os(p_inicio => '2026-01-01', p_fim => '2026-12-31', p_limite => 100, p_deslocamento => 0) ->> 'comissaoTotal'), '340.00');

\echo '===== A % da OP passa por cima da % do socorrista ====='
select public.definir_percentual_do_socorrista(1, 0.15);
select pg_temp.checar('Anderson continua 170 nesta OP',
  (select valor::text from public.despesas where protocolo = 'COMISSAO-OP-1-1'), '170.00');

\echo '===== Tirar a % da OP volta a valer a taxa de cada um ====='
select public.definir_percentual_da_op(1, null);
select pg_temp.checar('Djalma volta a 200 (taxa congelada da epoca)',
  (select valor::text from public.despesas where protocolo = 'COMISSAO-OP-1-2'), '200.00');

\echo '===== Limites e permissao ====='
do $$ begin
  perform public.definir_percentual_da_op(1, 0.25);
  raise exception 'FALHOU  | aceitou 25%% na OP';
exception when invalid_parameter_value then raise notice 'PASSOU  | OP acima de 20%% e recusada'; end $$;
do $$ begin
  perform public.definir_percentual_padrao(0.21);
  raise exception 'FALHOU  | aceitou padrao de 21%%';
exception when invalid_parameter_value then raise notice 'PASSOU  | padrao acima de 20%% e recusado'; end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
do $$ begin
  perform public.definir_percentual_da_op(1, 0.10);
  raise exception 'FALHOU  | socorrista mudou a %% da OP';
exception when insufficient_privilege or raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSOU  | socorrista nao muda a %% da OP';
end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== Padrao editavel muda so o que nao fechou ====='
select public.definir_percentual_padrao(0.18);
reset role;
insert into public.ordens_pagamento_porto (numero,valor_total,data_pagamento_programada)
 values ('OP-B',1000,'2026-10-20');
insert into public.ordens_servico_porto
 (numero,numero_normalizado,data_atendimento,valor_total,motorista_id,ordem_pagamento_id,status_financeiro,status_operacional)
 values ('OS-3','OS3','2026-09-20',1000,2,2,'RECEBIDO','PROCESSADO');
select public.porto_recalcular_periodos();
select public.porto_sincronizar_comissoes();
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('o padrao ficou 18%',
  (select public.percentual_comissao()::text), '0.1800');
select pg_temp.checar('a OP-A que ja fechou continua 200',
  (select valor::text from public.despesas where protocolo = 'COMISSAO-OP-1-2'), '200.00');
select pg_temp.checar('a OP-B, nova, nasce a 18%',
  (select valor::text from public.despesas where protocolo = 'COMISSAO-OP-2-2'), '180.00');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
