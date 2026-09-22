-- Tirar a comissao de uma OS que ja esta paga numa OP.
--
-- O caso que Kawa descreveu: a OS caiu no nome do socorrista, entrou na OP, foi
-- paga, e so depois alguem viu que nao cabia comissao nela. A marca tem que
-- baixar o dinheiro dele sem apagar que foi ele quem rodou o servico.
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

insert into public.ordens_pagamento_porto (numero,valor_total,data_pagamento_programada)
 values ('06438807',1000,'2026-10-05');
-- Duas OS de 500 na mesma OP: 20% de 1000 = 200 de comissao.
insert into public.ordens_servico_porto
 (numero,numero_normalizado,data_atendimento,valor_total,motorista_id,ordem_pagamento_id,status_financeiro,status_operacional)
 values ('OS-A','OSA','2026-09-10',500,1,1,'RECEBIDO','PROCESSADO'),
        ('OS-B','OSB','2026-09-12',500,1,1,'RECEBIDO','PROCESSADO');
select public.porto_recalcular_periodos();
select public.porto_sincronizar_comissoes();

\echo '===== Antes: as duas OS geram comissao ====='
select pg_temp.checar('comissao bruta da OP e 200',
  (public.comissao_das_ops(array[1]::bigint[],1) ->> 'comissaoBruta'), '200.00');
select pg_temp.checar('a despesa de comissao lancada e 200',
  (select sum(valor)::text from public.despesas where protocolo like 'COMISSAO-OP-%'), '200.00');

\echo '===== Tirar a comissao da OS-B, que ja esta paga ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select public.porto_definir_comissao_da_os(
  (select id from public.ordens_servico_porto where numero='OS-B'), true);
reset role;

select pg_temp.checar('comissao bruta cai para 100',
  (public.comissao_das_ops(array[1]::bigint[],1) ->> 'comissaoBruta'), '100.00');
select pg_temp.checar('o liquido acompanha',
  (public.comissao_das_ops(array[1]::bigint[],1) ->> 'liquido'), '100.00');
-- O ponto inteiro da marca: o servico nao sai da producao nem do nome dele.
select pg_temp.checar('a producao paga continua 1000',
  (public.comissao_das_ops(array[1]::bigint[],1) ->> 'producaoPaga'), '1000.00');
select pg_temp.checar('a OS continua no nome do socorrista',
  (select motorista_id::text from public.ordens_servico_porto where numero='OS-B'), '1');
select pg_temp.checar('a despesa de comissao foi refeita para 100',
  (select sum(valor)::text from public.despesas where protocolo like 'COMISSAO-OP-%'), '100.00');

\echo '===== Devolver a comissao desfaz ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select public.porto_definir_comissao_da_os(
  (select id from public.ordens_servico_porto where numero='OS-B'), false);
reset role;
select pg_temp.checar('comissao bruta volta a 200',
  (public.comissao_das_ops(array[1]::bigint[],1) ->> 'comissaoBruta'), '200.00');

\echo '===== So o administrador tira ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
do $$
begin
  perform public.porto_definir_comissao_da_os(
    (select id from public.ordens_servico_porto where numero='OS-B'), true);
  raise exception 'FALHOU  | socorrista conseguiu tirar a propria comissao';
exception
  when insufficient_privilege or raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'PASSOU  | socorrista nao tira comissao';
end $$;
reset role;
select pg_temp.checar('e a comissao continua intacta',
  (public.comissao_das_ops(array[1]::bigint[],1) ->> 'comissaoBruta'), '200.00');

\echo 'TODOS OS TESTES PASSARAM'
