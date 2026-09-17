-- Duas OPs no mesmo período: o cenário que o sócio anunciou.
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','soc@t.local','{"nome":"Soc","perfil":"FUNCIONARIO"}'),
 ('aaaaaaaa-0000-0000-0000-000000000003','soc2@t.local','{"nome":"Soc2","perfil":"FUNCIONARIO"}');
insert into public.categorias (nome,tipo) values ('Combustível','DESPESA'),('Alimentação','DESPESA');
insert into public.veiculos (identificacao,placa,custo_por_km) values ('L168','AAA1A11',2.00);
insert into public.motoristas (nome,perfil_id,veiculo_id) values
 ('Anderson','aaaaaaaa-0000-0000-0000-000000000002',1),
 ('Bruno','aaaaaaaa-0000-0000-0000-000000000003',1);

insert into public.ordens_pagamento_porto (numero,valor_total,periodo_inicio,periodo_fim,data_pagamento_programada)
 values ('OP-A',1000,'2026-09-01','2026-09-15','2026-10-05'),
        ('OP-B',1000,'2026-09-16','2026-09-30','2026-10-20');

insert into public.ordens_servico_porto (numero,numero_normalizado,data_atendimento,valor_total,motorista_id,ordem_pagamento_id,status_financeiro,status_operacional)
 values ('OS-A','OSA','2026-09-10',1000,1,1,'RECEBIDO','PROCESSADO'),
        ('OS-B','OSB','2026-09-20',1000,1,2,'RECEBIDO','PROCESSADO'),
        ('OS-C','OSC','2026-09-21',1000,2,2,'RECEBIDO','PROCESSADO');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== Cada OP fecha a sua, sem misturar ====='
select pg_temp.checar('a OP-A vê só a produção dela',
  (public.comissao_da_op(1,1) ->> 'producaoPaga'), '1000.00');
select pg_temp.checar('a OP-B vê só a produção dela',
  (public.comissao_da_op(2,1) ->> 'producaoPaga'), '1000.00');

\echo '===== Pagar comissao em duas OPs, e a dois socorristas ====='
-- O segundo pagamento de comissão sempre falhava: a busca da categoria usava
-- 'comissao' e a criação gravava 'Comissão', então toda vez tentava criar de
-- novo e batia no índice único. Com uma OP e um socorrista por vez ninguém via.
select public.pagar_comissao_op(1,1,'2026-10-05','PIX','OP-A · Anderson');
select public.pagar_comissao_op(1,2,'2026-10-20','PIX','OP-B · Anderson');
select public.pagar_comissao_op(2,2,'2026-10-20','PIX','OP-B · Bruno');
select pg_temp.checar('os três pagamentos entraram',
  (select count(*)::text from public.pagamentos_comissao), '3');
select pg_temp.checar('e usaram uma categoria só, não três',
  (select count(*)::text from public.categorias
    where lower(btrim(nome)) in ('comissão de socorrista','comissao de socorrista')), '1');

-- Pagar a mesma OP ao mesmo socorrista duas vezes continua barrado.
do $$ begin
  perform public.pagar_comissao_op(1,1,'2026-10-06','PIX','de novo');
  raise exception 'VAZOU | pagou a mesma OP duas vezes';
exception when unique_violation then raise notice 'BLOQUEADO | a mesma OP não paga duas vezes ao mesmo socorrista';
end $$;

\echo 'TODOS OS TESTES PASSARAM'
