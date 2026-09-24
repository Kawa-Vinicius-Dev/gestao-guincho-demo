-- Registro do atendimento: o socorrista grava o proprio, os arquivos ficam na
-- pasta dele, o administrador ve junto com a OS, e os arquivos saem depois de paga.
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','soc@t.local','{"nome":"Socorrista","perfil":"FUNCIONARIO"}'),
 ('aaaaaaaa-0000-0000-0000-000000000003','outro@t.local','{"nome":"Outro","perfil":"FUNCIONARIO"}');
insert into public.veiculos (identificacao, placa, custo_por_km) values ('L168','ABC1D23',2.50);
insert into public.motoristas (nome,perfil_id,veiculo_id) values
 ('Socorrista','aaaaaaaa-0000-0000-0000-000000000002',1), ('Outro','aaaaaaaa-0000-0000-0000-000000000003',1);

\echo '===== O socorrista registra no local ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select public.abrir_turno(1, 1000);
select pg_temp.checar('registrado, com o turno e a viatura dele',
  (select public.registrar_atendimento('5673329/26', '567332926', now() - interval '1 hour', 'abc-1d23', 'Maria', null)::text), '1');
select pg_temp.checar('placa limpa e maiuscula, turno e viatura ligados',
  (select placa_segurado || ' ' || turno_id || ' ' || veiculo_id from public.atendimentos where id = 1), 'ABC1D23 1 1');
select public.anexar_arquivos_atendimento(1,
  '{"antes":["atendimentos/1/antes-1.jpg"],"depois":["atendimentos/1/depois-1.jpg"]}', 'atendimentos/1/assinatura.png');
do $$
begin
  perform public.anexar_arquivos_atendimento(1, '{"antes":["turnos/9/x.jpg"]}');
  raise exception 'FALHOU  | aceitou arquivo de outra pasta';
exception when invalid_parameter_value then raise notice 'PASSOU  | arquivo fora da pasta recusado';
end $$;
do $$
begin
  perform public.registrar_atendimento('1', '1', now() + interval '2 hours');
  raise exception 'FALHOU  | aceitou chegada no futuro';
exception when invalid_parameter_value then raise notice 'PASSOU  | chegada no futuro recusada';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
select pg_temp.checar('outro socorrista nao ve', (select count(*)::text from public.atendimentos), '0');
do $$
begin
  perform public.anexar_arquivos_atendimento(1, '{"antes":["atendimentos/1/y.jpg"]}');
  raise exception 'FALHOU  | outro socorrista anexou no registro alheio';
exception when invalid_parameter_value then raise notice 'PASSOU  | registro alheio recusado';
end $$;
reset role;

\echo '===== O administrador ve junto com a OS ====='
insert into public.ordens_pagamento_porto (numero, valor_total, periodo_inicio, periodo_fim) values ('OP-A', 205, current_date - 30, current_date);
insert into public.ordens_servico_porto (numero, numero_normalizado, valor_total, data_atendimento, especialidade, motorista_id)
 values ('5673329/26', '567332926', 205, current_date, 'REMOCAO', 1);
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('a OS se junta pelo numero',
  (select (public.atendimentos_registrados(current_date - 1, current_date) -> 0 ->> 'especialidade')), 'REMOCAO');
select pg_temp.checar('recente e sem OP: nada para apagar', public.atendimentos_para_apagar()::text, '[]');
reset role;

\echo '===== Paga numa OP, sem contestacao, passados 15 dias: arquivos saem ====='
update public.ordens_servico_porto set ordem_pagamento_id = 1;
update public.atendimentos set chegada_em = now() - interval '20 days';
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('as 3 imagens saem',
  (select jsonb_array_length(public.atendimentos_para_apagar() -> 0 -> 'caminhos')::text), '3');
select public.marcar_atendimentos_apagados(array[1]::bigint[]);
select pg_temp.checar('marcado, nao volta', public.atendimentos_para_apagar()::text, '[]');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
