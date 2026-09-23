-- "OS paga" acompanha a OP em qualquer gravacao, e a Visao geral diz a receita
-- das OS canceladas (tirar comissao cancela a OS; a Porto ja pagou).
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}');
insert into public.motoristas (nome) values ('DJALMA');
-- Ids gerados na ordem: OP 1; OS 1 e 2.
insert into public.ordens_pagamento_porto (numero, valor_total, periodo_inicio, periodo_fim)
 values ('06438807', 300, '2026-09-01', '2026-09-16');

\echo '===== Status pela OP ====='
-- Gravada "aguardando" mas com OP: o status acompanha a OP.
insert into public.ordens_servico_porto (numero, numero_normalizado, ordem_pagamento_id, valor_total,
  data_atendimento, motorista_id, status_financeiro) values
 ('OS-A', 'OSA', 1, 200, '2026-09-07', 1, 'AGUARDANDO_OP'),
 ('OS-B', 'OSB', null, 0, '2026-09-08', 1, 'AGUARDANDO_OP');
select pg_temp.checar('OS com OP fica recebida, mesmo gravada como aguardando',
  (select status_financeiro::text from public.ordens_servico_porto where numero = 'OS-A'), 'RECEBIDO');
update public.ordens_servico_porto set ordem_pagamento_id = 1 where numero = 'OS-B';
select pg_temp.checar('ganhar OP muda o status sozinho',
  (select status_financeiro::text from public.ordens_servico_porto where numero = 'OS-B'), 'RECEBIDO');
update public.ordens_servico_porto set ordem_pagamento_id = null where numero = 'OS-B';
select pg_temp.checar('perder a OP volta para aguardando',
  (select status_financeiro::text from public.ordens_servico_porto where numero = 'OS-B'), 'AGUARDANDO_OP');

\echo '===== Receita de OS cancelada, a parte ====='
insert into public.receitas (descricao, valor, data_competencia, status, data_recebimento, ordem_servico_porto_id)
 values ('OS-A', 200, '2026-09-16', 'RECEBIDA', '2026-09-16', 1);
update public.ordens_servico_porto set status_operacional = 'CANCELADO', sem_comissao = true where numero = 'OS-A';
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('a receita da OS cancelada continua no caixa',
  (public.dashboard_financeiro('2026-09-01', '2026-09-16', true) ->> 'receitaRecebida'), '200.00');
select pg_temp.checar('e a Visao geral diz de onde ela vem',
  (public.dashboard_financeiro('2026-09-01', '2026-09-16', true) ->> 'receitaOsCanceladas'), '200.00');
select pg_temp.checar('quantas OS canceladas',
  (public.dashboard_financeiro('2026-09-01', '2026-09-16', true) ->> 'osCanceladasComReceita'), '1');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
