-- Km do servico pelo odometro (Kawa, 15/10/2026): iniciar com OS, km e foto;
-- finalizar com km e foto; o km do servico e final - inicial; um servico por
-- vez; nao finaliza duas vezes; o odometro nao volta; o lancamento antigo pelo
-- GPS continua valendo; so o administrador consulta os turnos.
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

-- Espera que o comando falhe com o codigo dado.
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
insert into public.veiculos (identificacao, placa, custo_por_km) values ('L168','ABC1D23',2.50), ('K85','XYZ9A87',2.50);
insert into public.motoristas (nome,perfil_id,veiculo_id) values
 ('Socorrista','aaaaaaaa-0000-0000-0000-000000000002',1),
 ('Outro','aaaaaaaa-0000-0000-0000-000000000003',2);

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';

\echo '===== Sem turno aberto nao inicia ====='
select pg_temp.recusa('sem turno', $q$select public.iniciar_servico_do_turno('111-26', '11126', 10000, null, null, null, 'NEGADA')$q$);

select public.abrir_turno(1, 10000);

\echo '===== Dados obrigatorios do inicio ====='
select pg_temp.recusa('sem numero da OS', $q$select public.iniciar_servico_do_turno('', '', 10000, null, null, null, 'NEGADA')$q$);
select pg_temp.recusa('sem km', $q$select public.iniciar_servico_do_turno('111-26', '11126', null, null, null, null, 'NEGADA')$q$);
select pg_temp.recusa('sem local e sem motivo', $q$select public.iniciar_servico_do_turno('111-26', '11126', 10000)$q$);
select pg_temp.recusa('coordenada pela metade', $q$select public.iniciar_servico_do_turno('111-26', '11126', 10000, -23.5, null)$q$);
select pg_temp.recusa('km antes do inicio do turno', $q$select public.iniciar_servico_do_turno('111-26', '11126', 9990, null, null, null, 'NEGADA')$q$);

\echo '===== Servico 1: 10.000 -> 10.015 ====='
select pg_temp.checar('inicia com local',
  public.iniciar_servico_do_turno('111-26', '11126', 10000, -23.550520, -46.633308, 12)::text, '1');
select pg_temp.recusa('nao inicia outro com um em andamento',
  $q$select public.iniciar_servico_do_turno('222-26', '22226', 10015, null, null, null, 'NEGADA')$q$);
select pg_temp.recusa('nao finaliza sem a foto do inicio',
  $q$select public.finalizar_servico_do_turno(1, 10015, 'turnos/1/servico-1-fim.jpg', null, null, null, 'INDISPONIVEL')$q$);
select pg_temp.recusa('foto de outro turno nao vale',
  $q$select public.registrar_foto_inicio_servico(1, 'turnos/99/servico-1-inicio.jpg')$q$);
select public.registrar_foto_inicio_servico(1, 'turnos/1/servico-1-inicio.jpg');
select pg_temp.recusa('km final menor que o inicial',
  $q$select public.finalizar_servico_do_turno(1, 9999, 'turnos/1/servico-1-fim.jpg', null, null, null, 'INDISPONIVEL')$q$);
select pg_temp.recusa('nao finaliza sem foto',
  $q$select public.finalizar_servico_do_turno(1, 10015, '', null, null, null, 'INDISPONIVEL')$q$);

\echo '===== Outro socorrista nao finaliza ====='
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
select pg_temp.recusa('outro nao finaliza',
  $q$select public.finalizar_servico_do_turno(1, 10015, 'turnos/1/servico-1-fim.jpg', null, null, null, 'NEGADA')$q$);
select pg_temp.checar('outro nao ve', (select count(*)::text from public.servicos_do_turno), '0');
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';

select pg_temp.checar('finaliza: 15 km',
  public.finalizar_servico_do_turno(1, 10015, 'turnos/1/servico-1-fim.jpg', null, null, null, 'INDISPONIVEL')::text, '15.00');
select pg_temp.recusa('nao finaliza duas vezes',
  $q$select public.finalizar_servico_do_turno(1, 10020, 'turnos/1/servico-1-fim.jpg', null, null, null, 'INDISPONIVEL')$q$);
select pg_temp.checar('fotos separadas, local do inicio e motivo do fim',
  (select foto_inicio || ' ' || foto_fim || ' ' || inicio_latitude || ' ' || coalesce(fim_latitude::text, '-') || ' ' || fim_sem_local
     from public.servicos_do_turno where id = 1),
  'turnos/1/servico-1-inicio.jpg turnos/1/servico-1-fim.jpg -23.550520 - INDISPONIVEL');

\echo '===== Servicos 2 e 3, como no exemplo ====='
select pg_temp.recusa('o odometro nao volta para antes do ultimo servico',
  $q$select public.iniciar_servico_do_turno('222-26', '22226', 10010, null, null, null, 'NEGADA')$q$);
select pg_temp.recusa('a mesma OS de novo no turno',
  $q$select public.iniciar_servico_do_turno('111-26', '11126', 10015, null, null, null, 'NEGADA')$q$, '23505');
select public.iniciar_servico_do_turno('222-26', '22226', 10015, null, null, null, 'NEGADA');
select public.registrar_foto_inicio_servico(2, 'turnos/1/servico-2-inicio.jpg');
select public.finalizar_servico_do_turno(2, 10045, 'turnos/1/servico-2-fim.jpg', null, null, null, 'NEGADA');
select public.iniciar_servico_do_turno('333-26', '33326', 10045, null, null, null, 'NEGADA');
select public.registrar_foto_inicio_servico(3, 'turnos/1/servico-3-inicio.jpg');
select public.finalizar_servico_do_turno(3, 10100, 'turnos/1/servico-3-fim.jpg', null, null, null, 'NEGADA');
select pg_temp.checar('km de cada servico', (select string_agg(km::text, ',' order by id) from public.servicos_do_turno), '15.0,30.0,55.0');
select pg_temp.checar('km em servico do turno', (select sum(km)::text from public.servicos_do_turno where turno_id = 1), '100.0');

\echo '===== Lancamento antigo pelo GPS continua valendo ====='
select public.lancar_servico_do_turno('444-26', '44426', 12);
select pg_temp.checar('linha antiga so com km',
  (select km || ' ' || coalesce(km_inicial::text, '-') from public.servicos_do_turno where numero_normalizado = '44426'), '12.0 -');
select public.remover_servico_do_turno((select id from public.servicos_do_turno where numero_normalizado = '44426'));

\echo '===== Fecha o turno em 10.120 ====='
select public.registrar_foto_abertura(1, 'turnos/1/abertura.jpg');
select public.registrar_checklist(1,
  (select jsonb_object_agg(k, 'turnos/1/c-' || k || '.jpg') from unnest(public.fotos_do_checklist()) k));
select public.fechar_turno(1, 10120, 'turnos/1/fechamento.jpg');

\echo '===== A trava esta no banco, nao so na funcao ====='
reset role;
do $$
begin
  update public.servicos_do_turno set km = 99 where id = 1;
  raise exception 'FALHOU  | aceitou km diferente de final - inicial';
exception when check_violation then raise notice 'PASSOU  | km = final - inicial na tabela';
end $$;
set role authenticated;

\echo '===== Consulta do administrador ====='
select pg_temp.recusa('socorrista nao consulta', $q$select public.km_dos_turnos('2000-01-01', '2100-01-01')$q$, '42501');
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('turno com inicio, fim e tres servicos',
  (select (t ->> 'kmInicial') || ' ' || (t ->> 'kmFinal') || ' ' || jsonb_array_length(t -> 'servicos') || ' ' || (t ->> 'viatura')
     from jsonb_array_elements(public.km_dos_turnos('2000-01-01', '2100-01-01')) t),
  '10000.00 10120.00 3 L168');
select pg_temp.checar('filtro por viatura',
  jsonb_array_length(public.km_dos_turnos('2000-01-01', '2100-01-01', null, 2))::text, '0');
select pg_temp.checar('filtro por socorrista',
  jsonb_array_length(public.km_dos_turnos('2000-01-01', '2100-01-01', 1))::text, '1');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
