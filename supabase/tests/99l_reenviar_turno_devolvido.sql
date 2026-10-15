-- Turno devolvido: o socorrista corrige a quilometragem e explica, sem foto
-- nova; a foto do fechamento continua a que ja estava (Kawa, 15/10/2026).
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
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','soc@t.local','{"nome":"Socorrista","perfil":"FUNCIONARIO"}'),
 ('aaaaaaaa-0000-0000-0000-000000000003','outro@t.local','{"nome":"Outro","perfil":"FUNCIONARIO"}');
insert into public.veiculos (identificacao, placa, custo_por_km) values ('L168','ABC1D23',2.50);
insert into public.motoristas (nome,perfil_id,veiculo_id) values
 ('Socorrista','aaaaaaaa-0000-0000-0000-000000000002',1),
 ('Outro','aaaaaaaa-0000-0000-0000-000000000003',1);

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select public.abrir_turno(1, 10000);
select public.registrar_foto_abertura(1, 'turnos/1/abertura.jpg');
select public.registrar_checklist(1,
  (select jsonb_object_agg(k, 'turnos/1/c-' || k || '.jpg') from unnest(public.fotos_do_checklist()) k));
select public.fechar_turno(1, 10500, 'turnos/1/fechamento.jpg', 'Dia normal');

\echo '===== So turno devolvido pode ser reenviado ====='
select pg_temp.recusa('aguardando aprovacao nao e reenvio',
  $q$select public.reenviar_turno_devolvido(1, 10120, 'Digitei errado')$q$);

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select public.devolver_turno(1, 'A foto mostra 10.120, nao 10.500.');
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';

\echo '===== Turno devolvido nao impede abrir o turno do dia ====='
select pg_temp.checar('abre o turno do dia', public.abrir_turno(1, 10600)::text, '2');

\echo '===== Dados obrigatorios ====='
select pg_temp.recusa('sem explicacao', $q$select public.reenviar_turno_devolvido(1, 10120, '  ')$q$);
select pg_temp.recusa('quilometragem menor que a saida', $q$select public.reenviar_turno_devolvido(1, 9000, 'Errei')$q$);
select pg_temp.recusa('foto de outro turno', $q$select public.reenviar_turno_devolvido(1, 10120, 'Errei', 'turnos/2/x.jpg')$q$);

\echo '===== Outro socorrista nao reenvia ====='
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
select pg_temp.recusa('outro nao reenvia', $q$select public.reenviar_turno_devolvido(1, 10120, 'Errei')$q$);
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';

\echo '===== Reenvio sem foto nova ====='
select public.reenviar_turno_devolvido(1, 10120, 'Digitei 10.500 por engano');
reset role;
select pg_temp.checar('volta para aprovacao com o numero corrigido e a foto original',
  (select situacao || ' ' || hodometro_final || ' ' || foto_fechamento from public.turnos where id = 1),
  'AGUARDANDO_APROVACAO 10120.00 turnos/1/fechamento.jpg');
select pg_temp.checar('a explicacao chega ao administrador nas observacoes',
  (select observacoes from public.turnos where id = 1), 'Dia normal · Correção: Digitei 10.500 por engano');

\echo '===== Reenvio com foto nova, se ele tiver ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select public.devolver_turno(1, 'Mande outra foto, se tiver.');
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select public.reenviar_turno_devolvido(1, 10120, 'Tinha outra foto', 'turnos/1/fechamento-2.jpg');
reset role;
select pg_temp.checar('foto nova substitui a anterior',
  (select foto_fechamento from public.turnos where id = 1), 'turnos/1/fechamento-2.jpg');

\echo 'TODOS OS TESTES PASSARAM'
