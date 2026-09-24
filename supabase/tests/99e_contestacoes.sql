-- Contestacoes: glosa depois de 1 OP seguinte, pagamento a menos pela tabela,
-- e o caso que a Porto acaba pagando fecha sozinho.
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
-- Duas quinzenas com OP: 1 a 15 e 16 a 30 de setembro.
insert into public.ordens_pagamento_porto (numero, valor_total, periodo_inicio, periodo_fim) values
 ('OP-A', 355, '2026-09-01', '2026-09-15'),
 ('OP-B', 0, '2026-09-16', '2026-09-30');
insert into public.ordens_servico_porto (numero, numero_normalizado, ordem_pagamento_id, valor_total,
  data_atendimento, motorista_id, especialidade) values
 ('OS-X', 'OSX', null, 0, '2026-09-05', 1, 'REMOCAO'),   -- nao veio na OP-A nem na OP-B: glosa
 ('OS-Y', 'OSY', null, 0, '2026-09-20', 1, 'REMOCAO'),   -- nao veio na OP-B, mas a seguinte ainda nao chegou
 ('OS-Z', 'OSZ', 1, 150, '2026-09-06', 1, 'remocao '),   -- paga a menos (tabela 205)
 ('OS-W', 'OSW', 1, 205, '2026-09-07', 1, 'REMOCAO');    -- paga certo

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select public.porto_salvar_preco('Remocao', 205);

\echo '===== Deteccao ====='
select pg_temp.checar('dois casos novos', public.porto_detectar_contestacoes('2026-10-05')::text, '2');
select pg_temp.checar('OS-X vira glosa (nao paga)',
  (select tipo || ' ' || valor_esperado || ' ' || valor_pago from public.porto_contestacoes c
     join public.ordens_servico_porto os on os.id = c.os_id where os.numero = 'OS-X'), 'NAO_PAGA 205.00 0.00');
select pg_temp.checar('OS-Y ainda espera a OP seguinte',
  (select count(*)::text from public.porto_contestacoes c
     join public.ordens_servico_porto os on os.id = c.os_id where os.numero = 'OS-Y'), '0');
select pg_temp.checar('OS-Z paga a menos, pela tabela (sem ligar para maiuscula e espaco)',
  (select tipo || ' ' || valor_esperado || ' ' || valor_pago from public.porto_contestacoes c
     join public.ordens_servico_porto os on os.id = c.os_id where os.numero = 'OS-Z'), 'PAGA_A_MENOS 205.00 150.00');
select pg_temp.checar('prazo de 30 dias', (select max(prazo)::text from public.porto_contestacoes), '2026-11-04');
select pg_temp.checar('rodar de novo nao duplica', public.porto_detectar_contestacoes('2026-10-05')::text, '0');

\echo '===== Acompanhamento ====='
update public.porto_contestacoes set situacao = 'CONTESTADA', protocolo = 'PRT-1'
 where os_id = (select id from public.ordens_servico_porto where numero = 'OS-X');
select pg_temp.checar('contestada ganha a data',
  (select (contestada_em is not null)::text from public.porto_contestacoes where protocolo = 'PRT-1'), 'true');
reset role;

\echo '===== A Porto paga depois: fecha sozinho ====='
update public.ordens_servico_porto set ordem_pagamento_id = 2, valor_total = 205 where numero = 'OS-X';
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select public.porto_detectar_contestacoes('2026-10-05');
select pg_temp.checar('aceita, com o valor recuperado e a OP',
  (select situacao || ' ' || valor_recuperado || ' ' || (resolvida_em is not null) || ' ' || (observacao like '%OP-B%')
     from public.porto_contestacoes where protocolo = 'PRT-1'), 'ACEITA 205.00 true true');

\echo '===== Perdida zera o recuperado ====='
update public.porto_contestacoes set situacao = 'PERDIDA'
 where os_id = (select id from public.ordens_servico_porto where numero = 'OS-Z');
select pg_temp.checar('perdida',
  (select situacao || ' ' || valor_recuperado from public.porto_contestacoes c
     join public.ordens_servico_porto os on os.id = c.os_id where os.numero = 'OS-Z'), 'PERDIDA 0.00');

\echo '===== Tabela corrigida some com o caso que ninguem mexeu ====='
update public.porto_contestacoes set situacao = 'A_CONTESTAR'
 where os_id = (select id from public.ordens_servico_porto where numero = 'OS-Z');
select public.porto_salvar_preco(' REMOCAO', 150);
select pg_temp.checar('continua uma linha so na tabela', (select count(*)::text from public.porto_tabela_precos), '1');
select public.porto_detectar_contestacoes('2026-10-05');
select pg_temp.checar('sem diferenca, sem caso',
  (select count(*)::text from public.porto_contestacoes c
     join public.ordens_servico_porto os on os.id = c.os_id where os.numero = 'OS-Z'), '0');

\echo '===== Especialidades vistas ====='
select pg_temp.checar('uma especialidade, quatro OS, valor da tabela',
  (select especialidade || ' ' || servicos || ' ' || valor_tabela from public.porto_especialidades_vistas()), 'REMOCAO 4 150.00');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
