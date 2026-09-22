-- A porcentagem e de cada socorrista, com teto de 20%, e nao reescreve o passado.
--
-- Kawa, 22/09/2026: "o cliente quer escolher a porcentagem da comissao do
-- funcionario, o maximo sendo de 20%", e a mudanca vale "so daquele periodo".
-- O que esta suite protege e a segunda metade: baixar a taxa de alguem hoje nao
-- pode mudar o que ele ja recebeu.
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
insert into public.categorias (nome,tipo) values ('Combustível','DESPESA');
insert into public.veiculos (identificacao,placa,custo_por_km) values ('L168','AAA1A11',2.00);
insert into public.motoristas (nome,perfil_id,veiculo_id)
 values ('Anderson','aaaaaaaa-0000-0000-0000-000000000002',1);

-- OP-1 fecha primeiro, valendo os 20% da casa.
insert into public.ordens_pagamento_porto (numero,valor_total,data_pagamento_programada)
 values ('OP-ANTIGA',1000,'2026-10-05');
insert into public.ordens_servico_porto
 (numero,numero_normalizado,data_atendimento,valor_total,motorista_id,ordem_pagamento_id,status_financeiro,status_operacional)
 values ('OS-1','OS1','2026-09-10',1000,1,1,'RECEBIDO','PROCESSADO');
select public.porto_recalcular_periodos();
select public.porto_sincronizar_comissoes();

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== Sem taxa propria, vale o padrao da casa ====='
select pg_temp.checar('comissao da OP antiga e 200 (20%)',
  (public.comissao_das_ops(array[1]::bigint[],1) ->> 'comissaoBruta'), '200.00');
select pg_temp.checar('a taxa ficou congelada no pagamento',
  (select percentual::text from public.pagamentos_comissao where motorista_id=1), '0.2000');

\echo '===== O teto de 20% e recusado ====='
do $$
begin
  perform public.definir_percentual_do_socorrista(1, 0.25);
  raise exception 'FALHOU  | aceitou taxa acima de 20%%';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSOU  | taxa acima de 20%% e recusada';
end $$;

\echo '===== Baixar para 15% nao mexe no que ja fechou ====='
select public.definir_percentual_do_socorrista(1, 0.15);
select pg_temp.checar('a OP antiga continua valendo 200',
  (public.comissao_das_ops(array[1]::bigint[],1) ->> 'comissaoBruta'), '200.00');
select pg_temp.checar('e a despesa dela tambem',
  (select valor::text from public.despesas where protocolo like 'COMISSAO-OP-1-%'), '200.00');

\echo '===== A OP seguinte ja nasce com a taxa nova ====='
reset role;
insert into public.ordens_pagamento_porto (numero,valor_total,data_pagamento_programada)
 values ('OP-NOVA',1000,'2026-11-05');
insert into public.ordens_servico_porto
 (numero,numero_normalizado,data_atendimento,valor_total,motorista_id,ordem_pagamento_id,status_financeiro,status_operacional)
 values ('OS-2','OS2','2026-10-10',1000,1,2,'RECEBIDO','PROCESSADO');
select public.porto_recalcular_periodos();
select public.porto_sincronizar_comissoes();
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.checar('a OP nova rende 150 (15%)',
  (public.comissao_das_ops(array[2]::bigint[],1) ->> 'comissaoBruta'), '150.00');
select pg_temp.checar('e a antiga continua em 200',
  (public.comissao_das_ops(array[1]::bigint[],1) ->> 'comissaoBruta'), '200.00');

\echo '===== Tirar comissao de uma OS antiga usa a taxa da epoca ====='
-- O recalculo continua acertando o valor; o que ele nao faz e trocar a regra
-- que valia quando aquela OP fechou.
select public.porto_definir_comissao_da_os(
  (select id from public.ordens_servico_porto where numero='OS-1'), true);
select pg_temp.checar('sem a OS, a OP antiga zera',
  (public.comissao_das_ops(array[1]::bigint[],1) ->> 'comissaoBruta'), '0.00');
select public.porto_definir_comissao_da_os(
  (select id from public.ordens_servico_porto where numero='OS-1'), false);
select pg_temp.checar('e ao devolver volta a 200, nao a 150',
  (public.comissao_das_ops(array[1]::bigint[],1) ->> 'comissaoBruta'), '200.00');

\echo '===== So o administrador muda a taxa ====='
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
do $$
begin
  perform public.definir_percentual_do_socorrista(1, 0.05);
  raise exception 'FALHOU  | socorrista mudou a propria taxa';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSOU  | socorrista nao muda a propria taxa';
end $$;

\echo 'TODOS OS TESTES PASSARAM'
