-- Alertas do dono: uma linha por tipo com ocorrencia, as definicoes de atraso que
-- o sistema ja usa, so o administrador chama, so le.
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;
create or replace function pg_temp.recusa(rotulo text, comando text, codigo text default '42501') returns void
language plpgsql as $$
begin
  execute comando;
  raise exception 'FALHOU  | % | foi aceito', rotulo;
exception when others then
  if sqlstate = codigo then raise notice 'PASSOU  | % (%)', rotulo, sqlerrm;
  else raise exception 'FALHOU  | % | codigo=% erro=%', rotulo, sqlstate, sqlerrm; end if;
end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','soc@t.local','{"nome":"Socorrista","perfil":"FUNCIONARIO"}');
insert into public.veiculos (identificacao, placa, custo_por_km) values ('L168','ABC1D23',2.50);
insert into public.motoristas (nome,perfil_id,veiculo_id) values ('Socorrista','aaaaaaaa-0000-0000-0000-000000000002',1);
insert into public.categorias (nome,tipo) values ('Aluguel','DESPESA');
insert into public.contratantes (nome) values ('Porto Seguro');

-- hoje (Sao Paulo) como referencia das datas abaixo
select (now() at time zone 'America/Sao_Paulo')::date as hoje \gset

\echo '===== Sem nada atrasado, nao devolve linha ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('banco limpo: nenhum alerta', (select count(*)::text from public.alertas_do_dono()), '0');
reset role;

\echo '===== Dados: um de cada tipo, mais um que NAO conta ====='
insert into public.contas_receber (contratante_id, descricao, valor_previsto, data_competencia, vencimento, status) values
 (1, 'Conta vencida', 1000, :'hoje'::date - 40, :'hoje'::date - 10, 'PENDENTE'),
 (1, 'Conta atrasada marcada', 500, :'hoje'::date - 40, :'hoje'::date - 3, 'ATRASADO'),
 (1, 'Conta no prazo', 700, :'hoje'::date, :'hoje'::date + 5, 'PENDENTE');
insert into public.contas_receber (contratante_id, descricao, valor_previsto, valor_recebido, data_competencia, vencimento, data_recebimento, status)
 values (1, 'Conta ja recebida', 900, 900, :'hoje'::date - 40, :'hoje'::date - 20, :'hoje'::date - 15, 'RECEBIDO');
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,vencimento,status,aprovada,aprovado_por,aprovado_em,criado_por) values
 ('Aluguel vencido',1,3000,:'hoje'::date - 30,:'hoje'::date - 5,'PENDENTE',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),'aaaaaaaa-0000-0000-0000-000000000001'),
 ('Aluguel no prazo',1,3000,:'hoje'::date,:'hoje'::date + 5,'PENDENTE',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),'aaaaaaaa-0000-0000-0000-000000000001');
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,status,aprovada,criado_por) values
 ('Lancada pelo socorrista',1,80,:'hoje'::date - 1,'PENDENTE',false,'aaaaaaaa-0000-0000-0000-000000000002'),
 ('Rejeitada',1,60,:'hoje'::date - 1,'REJEITADO',false,'aaaaaaaa-0000-0000-0000-000000000002');
insert into public.ordens_pagamento_porto (numero, valor_total, data_pagamento_programada, situacao_financeira) values
 ('OP-1', 8000, :'hoje'::date - 7, 'PROGRAMADO'),
 ('OP-3', 5000, :'hoje'::date + 3, 'PROGRAMADO');
insert into public.ordens_pagamento_porto (numero, valor_total, data_pagamento_programada, situacao_financeira, valor_recebido, data_recebimento)
 values ('OP-2', 9000, :'hoje'::date - 7, 'RECEBIDO', 9000, :'hoje'::date - 6);
insert into public.documentos (veiculo_id, tipo, vence_em) values
 (1, 'CRLV', :'hoje'::date - 2), (1, 'Seguro', :'hoje'::date + 10), (1, 'Tacografo', :'hoje'::date + 90);
insert into public.documentos (motorista_id, tipo, vence_em) values (1, 'CNH', :'hoje'::date + 29);

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select public.abrir_turno(1, 10000);
reset role;
update public.turnos set aberto_em = now() - interval '14 hours';

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== Cada tipo, com a conta certa ====='
select pg_temp.checar('contas atrasadas: so as 2 vencidas e nao recebidas',
  (select quantidade || ' ' || valor_total from public.alertas_do_dono() where tipo = 'CONTA_A_RECEBER_ATRASADA'), '2 1500.00');
select pg_temp.checar('despesa vencida: so a aprovada e vencida',
  (select quantidade || ' ' || valor_total from public.alertas_do_dono() where tipo = 'DESPESA_VENCIDA'), '1 3000.00');
select pg_temp.checar('OP atrasada: so a nao recebida e vencida',
  (select quantidade || ' ' || valor_total from public.alertas_do_dono() where tipo = 'OP_ATRASADA'), '1 8000.00');
select pg_temp.checar('documento vencido: o CRLV',
  (select quantidade || ' ' || (itens -> 0 ->> 'documento') || ' ' || (itens -> 0 ->> 'diasVencido') from public.alertas_do_dono() where tipo = 'DOCUMENTO_VENCIDO'), '1 CRLV 2');
select pg_temp.checar('documento a vencer em 30 dias: Seguro e CNH (o de 90 dias nao)',
  (select quantidade::text from public.alertas_do_dono() where tipo = 'DOCUMENTO_A_VENCER'), '2');
select pg_temp.checar('a vencer vem do mais proximo: Seguro (10 dias), CNH (29)',
  (select (itens -> 0 ->> 'documento') || ' ' || (itens -> 1 ->> 'documento') from public.alertas_do_dono() where tipo = 'DOCUMENTO_A_VENCER'), 'Seguro CNH');
select pg_temp.checar('dono do documento: viatura ou socorrista',
  (select string_agg(i ->> 'dono', ',' order by i ->> 'documento') from public.alertas_do_dono() a, jsonb_array_elements(a.itens) i where a.tipo = 'DOCUMENTO_A_VENCER'), 'Socorrista,L168');
select pg_temp.checar('janela de documentos configuravel: 100 dias inclui o Tacografo',
  (select quantidade::text from public.alertas_do_dono(100) where tipo = 'DOCUMENTO_A_VENCER'), '3');
select pg_temp.checar('turno aberto ha 14 h (limite 12)',
  (select quantidade || ' ' || (itens -> 0 ->> 'socorrista') from public.alertas_do_dono() where tipo = 'TURNO_ABERTO_HA_MUITO_TEMPO'), '1 Socorrista');
select pg_temp.checar('com limite de 24 h o turno nao conta',
  (select count(*)::text from public.alertas_do_dono(30, 24) where tipo = 'TURNO_ABERTO_HA_MUITO_TEMPO'), '0');
select pg_temp.checar('despesa para aprovar: so a nao aprovada e nao rejeitada',
  (select quantidade || ' ' || valor_total from public.alertas_do_dono() where tipo = 'DESPESA_PARA_APROVAR'), '1 80.00');

\echo '===== Forma da resposta ====='
select pg_temp.checar('urgentes vem antes das atencoes',
  (select string_agg(gravidade, ',' order by ord) from (select gravidade, row_number() over () as ord from public.alertas_do_dono()) x),
  'URGENTE,URGENTE,URGENTE,URGENTE,ATENCAO,ATENCAO,ATENCAO');
select pg_temp.checar('resumo no singular e no plural',
  (select string_agg(resumo, ' | ' order by tipo) from public.alertas_do_dono() where tipo in ('OP_ATRASADA', 'CONTA_A_RECEBER_ATRASADA')),
  '2 contas a receber vencidas | 1 OP com pagamento atrasado');
select pg_temp.recusa('dias de documento negativo', $q$select * from public.alertas_do_dono(-1)$q$, '22023');
select pg_temp.recusa('horas de turno zero', $q$select * from public.alertas_do_dono(30, 0)$q$, '22023');

\echo '===== Limite de 10 exemplos ====='
reset role;
insert into public.contas_receber (contratante_id, descricao, valor_previsto, data_competencia, vencimento, status)
  select 1, 'Atrasada ' || g, 10, :'hoje'::date - 60, :'hoje'::date - 20 - g, 'PENDENTE' from generate_series(1, 14) g;
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('conta 16 atrasadas, mas so 10 exemplos',
  (select quantidade || ' ' || jsonb_array_length(itens) from public.alertas_do_dono() where tipo = 'CONTA_A_RECEBER_ATRASADA'), '16 10');
select pg_temp.checar('exemplos: os mais antigos primeiro (34 dias de atraso)',
  (select itens -> 0 ->> 'diasAtraso' from public.alertas_do_dono() where tipo = 'CONTA_A_RECEBER_ATRASADA'), '34');

\echo '===== Turno esperando aprovacao ====='
reset role;
update public.turnos set situacao = 'AGUARDANDO_APROVACAO', fechado_em = now(), hodometro_final = 10050, foto_fechamento = 'turnos/1/fechamento.jpg';
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('turno fechado esperando aprovacao conta, e sai de "aberto ha muito tempo"',
  (select string_agg(tipo || '=' || quantidade, ',' order by tipo) from public.alertas_do_dono()
    where tipo in ('TURNO_PARA_APROVAR', 'TURNO_ABERTO_HA_MUITO_TEMPO')), 'TURNO_PARA_APROVAR=1');

\echo '===== Quem pode chamar ====='
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select pg_temp.recusa('socorrista nao chama', $q$select * from public.alertas_do_dono()$q$);
reset role;
select pg_temp.checar('anon nao executa',
  has_function_privilege('anon', 'public.alertas_do_dono(integer, integer)', 'execute')::text, 'false');
select pg_temp.checar('nao escreve: a funcao e stable',
  (select provolatile::text from pg_proc where proname = 'alertas_do_dono'), 's');

\echo 'TODOS OS TESTES PASSARAM'
