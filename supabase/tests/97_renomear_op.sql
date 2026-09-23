-- Editar o numero da OP: troca o numero, acerta a descricao das comissoes que a
-- OP lancou no Extrato, registra no historico e recusa numero repetido.
--
-- Kawa, 23/09/2026: "nos detalhes da OP, uma opcao de edicao para editar o
-- numero da OP".
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
insert into public.ordens_pagamento_porto (numero, valor_total) values ('06433184', 1000), ('06438808', 500);
insert into public.categorias (nome,tipo) values ('Mecânico','DESPESA');
-- Comissao lancada pela OP 1 (protocolo com o id) e uma despesa comum que cita o numero.
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,data_pagamento,criado_por,status,aprovada,protocolo)
 values ('QEBSON — comissão da OP 06433184',(select id from public.categorias where nome='Mecânico'),200,'2026-08-28','2026-08-28',
         'aaaaaaaa-0000-0000-0000-000000000001','PAGO',true,'COMISSAO-OP-1-2'),
        ('Peça citada na OP 06433184',(select id from public.categorias where nome='Mecânico'),50,'2026-08-28','2026-08-28',
         'aaaaaaaa-0000-0000-0000-000000000001','PAGO',true,null);

\echo '===== Administrador troca o numero ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select public.porto_renomear_op(1, ' 06433999 ');
select pg_temp.checar('o numero muda, sem espacos',
  (select numero from public.ordens_pagamento_porto where id = 1), '06433999');
select pg_temp.checar('a comissao da OP passa a mostrar o numero novo',
  (select descricao from public.despesas where protocolo = 'COMISSAO-OP-1-2'), 'QEBSON — comissão da OP 06433999');
select pg_temp.checar('despesa que nao e comissao da OP fica como esta',
  (select descricao from public.despesas where protocolo is null), 'Peça citada na OP 06433184');
select pg_temp.checar('fica no historico da OP',
  (select descricao from public.historico_porto where ordem_pagamento_id = 1 and evento = 'NUMERO_ALTERADO'),
  'Número da OP alterado de 06433184 para 06433999.');

\echo '===== Numero repetido e recusado ====='
do $$ begin
  perform public.porto_renomear_op(1, '06438808');
  raise exception 'FALHOU  | aceitou numero repetido';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  if sqlerrm <> 'Já existe uma OP com o número 06438808.' then raise exception 'FALHOU  | mensagem: %', sqlerrm; end if;
  raise notice 'PASSOU  | numero repetido e recusado, em portugues';
end $$;
reset role;

\echo '===== Socorrista nao troca numero de OP ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
do $$ begin
  perform public.porto_renomear_op(2, 'X1');
  raise exception 'FALHOU  | socorrista trocou o numero';
exception when insufficient_privilege or raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'PASSOU  | socorrista e recusado';
end $$;
reset role;
select pg_temp.checar('a OP 2 continua com o numero dela',
  (select numero from public.ordens_pagamento_porto where id = 2), '06438808');
