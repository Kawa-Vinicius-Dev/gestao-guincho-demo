-- Toda despesa ligada a um socorrista aparece na tela dele — e nenhuma delas,
-- fora a alimentacao, passa a descontar da comissao.
--
-- O caso que originou isto: "Almoco de Fulano" lancado com viatura e socorrista
-- preenchidos so aparecia do lado da viatura. O campo de socorrista prometia um
-- vinculo que nenhuma tela mostrava.
--
-- Atualizado para o modelo de 16/09: nenhuma categoria desconta sozinha. O tio
-- paga a alimentacao da equipe; o que sai da comissao e o gasto que o socorrista
-- pediu para tirar do bolso dele, marcado com `desconta_comissao`.
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
insert into public.categorias (nome,tipo) values
 ('Combustível','DESPESA'),('Alimentação','DESPESA'),('Pedágio','DESPESA'),('Guincho','RECEITA');
insert into public.veiculos (identificacao,placa,custo_por_km) values ('L168','AAA1A11',2.00);
insert into public.contratantes (nome) values ('Porto Seguro');
insert into public.motoristas (nome,perfil_id,veiculo_id) values
 ('Anderson','aaaaaaaa-0000-0000-0000-000000000002',1),('Sem despesa',null,1);
insert into public.calendario_pagamentos_porto (data_pagamento,descricao,competencia_inicio,competencia_fim)
 values ('2026-09-20','Ciclo set/26','2026-09-01','2026-09-30');
insert into public.ordens_pagamento_porto (numero,valor_total,periodo_inicio,periodo_fim,calendario_pagamento_id)
 values ('06389821',1000,'2026-09-01','2026-09-30',1);
-- A janela da OP vem das OS dela desde 20260916190000: sem OS nao ha periodo, e
-- nenhuma despesa cai dentro.
insert into public.ordens_servico_porto
 (numero,numero_normalizado,data_atendimento,valor_total,motorista_id,ordem_pagamento_id,status_financeiro,status_operacional)
 values ('OS-1','OS1','2026-09-05',1000,1,1,'RECEBIDO','PROCESSADO'),
        ('OS-2','OS2','2026-09-25',0,1,1,'RECEBIDO','PROCESSADO');

-- Quatro despesas do Anderson dentro da janela da OP, uma fora, e uma de outra
-- pessoa. So a alimentacao desconta.
insert into public.despesas
 (descricao,categoria_id,valor,data_lancamento,motorista_id,veiculo_id,desconta_comissao,status,aprovada,protocolo,criado_por,data_pagamento)
values
 ('Almoço de Fulano',2,50,'2026-09-10',1,null,true,'PAGO',true,null,'aaaaaaaa-0000-0000-0000-000000000001','2026-09-15'),
 ('Pedágio da viagem',3,30,'2026-09-11',1,1,false,'PAGO',true,null,'aaaaaaaa-0000-0000-0000-000000000001','2026-09-15'),
 ('Diesel do plantão',1,200,'2026-09-12',1,1,false,'PENDENTE',false,null,'aaaaaaaa-0000-0000-0000-000000000001',null),
 ('Multa rejeitada',3,90,'2026-09-13',1,null,false,'REJEITADO',false,null,'aaaaaaaa-0000-0000-0000-000000000001',null),
 ('Almoço de agosto',2,40,'2026-08-10',1,null,true,'PAGO',true,null,'aaaaaaaa-0000-0000-0000-000000000001','2026-09-15'),
 ('Comissão paga',1,700,'2026-09-20',1,null,false,'PAGO',true,'COMISSAO-1','aaaaaaaa-0000-0000-0000-000000000001','2026-09-20');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== A tela do socorrista lista toda despesa ligada a ele ====='
select pg_temp.checar('lista as despesas da janela da OP, e so elas',
  (select jsonb_array_length(public.detalhe_socorrista_ops(1, array[1]) -> 'despesas')::text), '3');
select pg_temp.checar('a mais recente vem primeiro',
  (public.detalhe_socorrista_ops(1, array[1]) -> 'despesas' -> 0 ->> 'descricao'), 'Diesel do plantão');
select pg_temp.checar('despesa de outro periodo fica fora',
  (select count(*)::text from jsonb_array_elements(public.detalhe_socorrista_ops(1, array[1]) -> 'despesas') e
    where e ->> 'descricao' = 'Almoço de agosto'), '0');
select pg_temp.checar('rejeitada fica fora',
  (select count(*)::text from jsonb_array_elements(public.detalhe_socorrista_ops(1, array[1]) -> 'despesas') e
    where e ->> 'descricao' = 'Multa rejeitada'), '0');
-- O pagamento da comissao e custo da empresa. Aparecer como custo do socorrista
-- diria o contrario do que o lancamento e.
select pg_temp.checar('o pagamento da própria comissão fica fora',
  (select count(*)::text from jsonb_array_elements(public.detalhe_socorrista_ops(1, array[1]) -> 'despesas') e
    where e ->> 'descricao' = 'Comissão paga'), '0');

\echo '===== Mostrar nao e cobrar: so a alimentacao desconta ====='
select pg_temp.checar('o gasto marcado sai como desconto',
  (select e ->> 'descontaDaComissao' from jsonb_array_elements(public.detalhe_socorrista_ops(1, array[1]) -> 'despesas') e
    where e ->> 'descricao' = 'Almoço de Fulano'), 'true');
select pg_temp.checar('o gasto não marcado aparece sem descontar',
  (select e ->> 'descontaDaComissao' from jsonb_array_elements(public.detalhe_socorrista_ops(1, array[1]) -> 'despesas') e
    where e ->> 'descricao' = 'Pedágio da viagem'), 'false');
-- A garantia que mais importa: nada acima mudou o fechamento. So os R$ 50 da
-- alimentacao saem da comissao; os R$ 230 de pedagio e diesel nao.
select pg_temp.checar('só o gasto marcado entra no desconto da comissão',
  (public.detalhe_socorrista_ops(1, array[1]) -> 'comissao' ->> 'descontos'), '50.00');
select pg_temp.checar('a despesa com viatura aparece com a viatura',
  (select e ->> 'veiculo' from jsonb_array_elements(public.detalhe_socorrista_ops(1, array[1]) -> 'despesas') e
    where e ->> 'descricao' = 'Pedágio da viagem'), 'L168');
select pg_temp.checar('socorrista sem despesa recebe lista vazia, não erro',
  (select jsonb_array_length(public.detalhe_socorrista_ops(2, array[1]) -> 'despesas')::text), '0');

\echo 'TODOS OS TESTES PASSARAM'
