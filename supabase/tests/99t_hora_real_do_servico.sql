-- Hora real do toque (fila offline): o servico enviado depois guarda a hora em
-- que o socorrista tocou, dentro de limites; sem o parametro, nada muda (now()).
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;
create or replace function pg_temp.recusa(rotulo text, comando text, codigo text default '22023') returns void
language plpgsql as $$
begin
  execute comando;
  raise exception 'FALHOU  | % | foi aceito', rotulo;
exception when others then
  if sqlstate = codigo then raise notice 'PASSOU  | % (%)', rotulo, sqlerrm;
  else raise exception 'FALHOU  | % | codigo=% erro=%', rotulo, sqlstate, sqlerrm; end if;
end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000002','soc@t.local','{"nome":"Socorrista","perfil":"FUNCIONARIO"}');
insert into public.veiculos (identificacao, placa, custo_por_km) values ('L168','ABC1D23',2.50);
insert into public.motoristas (nome,perfil_id,veiculo_id) values ('Socorrista','aaaaaaaa-0000-0000-0000-000000000002',1);

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select public.abrir_turno(1, 10000);

\echo '===== Sem o parametro, vale a hora do banco ====='
select pg_temp.checar('inicia sem hora informada',
  public.iniciar_servico_do_turno('111-26', '11126', 10000, null, null, null, 'NEGADA')::text, '1');
select pg_temp.checar('iniciado_em e agora (ate 1 min)',
  (select (abs(extract(epoch from now() - iniciado_em)) < 60)::text from public.servicos_do_turno where id = 1), 'true');
select public.registrar_foto_inicio_servico(1, 'turnos/1/servico-1-inicio.jpg');
select public.finalizar_servico_do_turno(1, 10010, 'turnos/1/servico-1-fim.jpg', null, null, null, 'NEGADA');
select pg_temp.checar('finalizado_em e agora (ate 1 min)',
  (select (abs(extract(epoch from now() - finalizado_em)) < 60)::text from public.servicos_do_turno where id = 1), 'true');

\echo '===== Com a hora do toque, vale a hora do celular ====='
select pg_temp.recusa('antes do turno e recusado',
  $q$select public.iniciar_servico_do_turno('222-26', '22226', 10010, null, null, null, 'NEGADA', now() - interval '3 hours')$q$);
select pg_temp.recusa('no futuro e recusado',
  $q$select public.iniciar_servico_do_turno('222-26', '22226', 10010, null, null, null, 'NEGADA', now() + interval '2 hours')$q$);

-- O turno e as horas acima foram criados agora; recua a abertura para poder
-- testar um toque de 40 minutos atras.
reset role;
update public.turnos set aberto_em = now() - interval '5 hours' where id = 1;
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';

select pg_temp.checar('inicia com a hora do toque',
  public.iniciar_servico_do_turno('222-26', '22226', 10010, null, null, null, 'NEGADA', now() - interval '40 minutes')::text, '2');
select pg_temp.checar('iniciado_em e o do toque (39 a 41 min atras)',
  (select (extract(epoch from now() - iniciado_em) between 39*60 and 41*60)::text from public.servicos_do_turno where id = 2), 'true');
select public.registrar_foto_inicio_servico(2, 'turnos/1/servico-2-inicio.jpg');
select pg_temp.recusa('fim antes do inicio do servico e recusado',
  $q$select public.finalizar_servico_do_turno(2, 10020, 'turnos/1/servico-2-fim.jpg', null, null, null, 'NEGADA', now() - interval '2 hours')$q$);
select pg_temp.recusa('fim no futuro e recusado',
  $q$select public.finalizar_servico_do_turno(2, 10020, 'turnos/1/servico-2-fim.jpg', null, null, null, 'NEGADA', now() + interval '1 hour')$q$);
select pg_temp.checar('finaliza com a hora do toque',
  public.finalizar_servico_do_turno(2, 10020, 'turnos/1/servico-2-fim.jpg', null, null, null, 'NEGADA', now() - interval '10 minutes')::text, '10.00');
select pg_temp.checar('finalizado_em e o do toque (9 a 11 min atras)',
  (select (extract(epoch from now() - finalizado_em) between 9*60 and 11*60)::text from public.servicos_do_turno where id = 2), 'true');

\echo '===== Folga de 5 minutos para diferenca de relogio ====='
select pg_temp.checar('relogio 2 min adiantado e aceito (vira agora)',
  public.iniciar_servico_do_turno('333-26', '33326', 10020, null, null, null, 'NEGADA', now() + interval '2 minutes')::text, '3');
select pg_temp.checar('hora gravada nunca fica no futuro',
  (select (iniciado_em <= now())::text from public.servicos_do_turno where id = 3), 'true');

\echo '===== A hora_do_toque nao fica exposta a quem nao e usuario logado ====='
reset role;
select pg_temp.checar('anon nao executa',
  has_function_privilege('anon', 'public.hora_do_toque(timestamptz, timestamptz)', 'execute')::text, 'false');
select pg_temp.checar('so existe uma assinatura de iniciar_servico_do_turno',
  (select count(*)::text from pg_proc where proname = 'iniciar_servico_do_turno'), '1');
select pg_temp.checar('so existe uma assinatura de finalizar_servico_do_turno',
  (select count(*)::text from pg_proc where proname = 'finalizar_servico_do_turno'), '1');

\echo 'TODOS OS TESTES PASSARAM'
