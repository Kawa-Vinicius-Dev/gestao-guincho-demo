-- Duas OPs no mesmo periodo — o cenario que o socio anunciou e que ja tem
-- tratamento: a Porto paga a mesma quinzena em mais de uma OP (Taxi numa,
-- Guincho noutra). A ficha do socorrista precisa somar as duas, e o gasto
-- marcado pode descontar uma vez so.
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
insert into public.categorias (nome,tipo) values ('Combustível','DESPESA'),('Alimentação','DESPESA');
insert into public.veiculos (identificacao,placa,custo_por_km) values ('L168','AAA1A11',2.00);
insert into public.motoristas (nome,perfil_id,veiculo_id) values ('Anderson','aaaaaaaa-0000-0000-0000-000000000002',1);

-- Duas OPs da MESMA quinzena, como Taxi e Guincho.
insert into public.ordens_pagamento_porto (numero,valor_total,data_pagamento_programada)
 values ('06438807',1000,'2026-10-05'),('06438808',1000,'2026-10-05');

insert into public.ordens_servico_porto
 (numero,numero_normalizado,data_atendimento,valor_total,motorista_id,ordem_pagamento_id,status_financeiro,status_operacional)
 values ('OS-GUINCHO','OSG','2026-09-10',1000,1,1,'RECEBIDO','PROCESSADO'),
        ('OS-TAXI','OST','2026-09-12',1000,1,2,'RECEBIDO','PROCESSADO');

-- Um gasto pessoal marcado, lancado UMA vez, no dia de uma das OS.
insert into public.despesas
 (descricao,categoria_id,valor,data_lancamento,motorista_id,desconta_comissao,status,aprovada,criado_por,data_pagamento)
 values ('Passou no cartão da viatura',2,100,'2026-09-12',1,true,'PAGO',true,
         'aaaaaaaa-0000-0000-0000-000000000001','2026-09-12');

-- Um gasto num dia SEM OS nenhuma, entre as duas OPs. A janela de cada OP vai
-- da primeira a ultima OS dela, entao 11/09 nao pertence a OP alguma e este
-- gasto nao desconta de lugar nenhum. Esta aqui para o comportamento ficar
-- registrado: se um dia virar defeito, o teste mostra onde.
insert into public.despesas
 (descricao,categoria_id,valor,data_lancamento,motorista_id,desconta_comissao,status,aprovada,criado_por,data_pagamento)
 values ('Gasto em dia sem OS',2,70,'2026-09-11',1,true,'PAGO',true,
         'aaaaaaaa-0000-0000-0000-000000000001','2026-09-11');

-- A janela de cada OP e derivada das OS dela, e quem atribui cada desconto a
-- UMA unica OP depende dessas janelas. Na importacao de verdade isto roda
-- sozinho; aqui, que insere direto na tabela, chamamos na mao.
select public.porto_recalcular_periodos();

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== A ficha soma as duas OPs da quinzena ====='
select pg_temp.checar('produção das duas OPs somada',
  (public.comissao_das_ops(array[1,2],1) ->> 'producaoPaga'), '2000.00');
select pg_temp.checar('comissão de 20% sobre as duas',
  (public.comissao_das_ops(array[1,2],1) ->> 'comissaoBruta'), '400.00');

\echo '===== O desconto entra uma vez so, nao uma por OP ====='
-- Era o risco real de ter duas OPs: a mesma janela lida duas vezes descontaria
-- os R$ 100 duas vezes, e o socorrista perderia R$ 100 sem ninguem notar.
select pg_temp.checar('o gasto marcado desconta uma vez',
  (public.comissao_das_ops(array[1,2],1) ->> 'descontos'), '100.00');
select pg_temp.checar('líquido = 400 − 100',
  (public.comissao_das_ops(array[1,2],1) ->> 'liquido'), '300.00');

\echo '===== Uma OP sozinha continua fechando so a dela ====='
select pg_temp.checar('a OP do guincho vê só a produção dela',
  (public.comissao_das_ops(array[1],1) ->> 'producaoPaga'), '1000.00');

\echo '===== A ficha do socorrista tambem soma as duas ====='
select pg_temp.checar('a ficha lista os serviços das duas OPs',
  (select jsonb_array_length(public.detalhe_socorrista_ops(1, array[1,2]) -> 'servicos')::text), '2');
select pg_temp.checar('e o gasto marcado aparece na lista dele',
  (select e ->> 'descontaDaComissao'
     from jsonb_array_elements(public.detalhe_socorrista_ops(1, array[1,2]) -> 'despesas') e
    where e ->> 'descricao' = 'Passou no cartão da viatura'), 'true');

\echo '===== Dia sem OS fica fora de toda janela ====='
select pg_temp.checar('gasto em dia sem OS não desconta de nenhuma OP',
  (public.comissao_das_ops(array[1,2],1) ->> 'descontos'), '100.00');

\echo 'TODOS OS TESTES PASSARAM'
