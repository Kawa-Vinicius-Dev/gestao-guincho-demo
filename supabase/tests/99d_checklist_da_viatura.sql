-- Checklist da viatura: 8 fotos obrigatorias para fechar, caminhos so no banco,
-- e as fotos saem do Storage na aprovacao ou 7 dias depois.
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','soc@t.local','{"nome":"Socorrista","perfil":"FUNCIONARIO"}');
insert into public.veiculos (identificacao, placa, custo_por_km) values ('L168','ABC1D23',2.50);
insert into public.motoristas (nome,perfil_id,veiculo_id) values ('Socorrista','aaaaaaaa-0000-0000-0000-000000000002',1);

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select public.abrir_turno(1, 1000);
select public.registrar_foto_abertura(1, 'turnos/1/abertura-1.jpg');

\echo '===== Sem checklist o turno nao fecha ====='
do $$
begin
  perform public.fechar_turno(1, 1100, 'turnos/1/fechamento-1.jpg');
  raise exception 'FALHOU  | fechou sem checklist';
exception when invalid_parameter_value then raise notice 'PASSOU  | sem checklist nao fecha';
end $$;

\echo '===== Faltando uma foto, o checklist e recusado ====='
do $$
begin
  perform public.registrar_checklist(1, jsonb_build_object('frente','turnos/1/c-frente.jpg'));
  raise exception 'FALHOU  | aceitou checklist incompleto';
exception when invalid_parameter_value then raise notice 'PASSOU  | checklist incompleto recusado';
end $$;

\echo '===== Foto de outro turno e recusada ====='
do $$
begin
  perform public.registrar_checklist(1, (select jsonb_object_agg(k, 'turnos/9/c-' || k || '.jpg')
    from unnest(public.fotos_do_checklist()) k));
  raise exception 'FALHOU  | aceitou foto de outra pasta';
exception when invalid_parameter_value then raise notice 'PASSOU  | foto de outra pasta recusada';
end $$;

\echo '===== Checklist completo, com um dano ====='
select public.registrar_checklist(1,
  (select jsonb_object_agg(k, 'turnos/1/c-' || k || '.jpg') from unnest(public.fotos_do_checklist()) k),
  '[{"caminho":"turnos/1/c-dano-1.jpg","descricao":"Risco na porta direita"}]');
select pg_temp.checar('8 fotos gravadas',
  (select count(*)::text from public.turnos t, jsonb_each(t.checklist -> 'fotos') where t.id = 1), '8');
select pg_temp.checar('o dano fica com a descricao',
  (select checklist -> 'danos' -> 0 ->> 'descricao' from public.turnos where id = 1), 'Risco na porta direita');
select public.fechar_turno(1, 1100, 'turnos/1/fechamento-1.jpg');
select pg_temp.checar('com checklist, fecha',
  (select situacao::text from public.turnos where id = 1), 'AGUARDANDO_APROVACAO');

\echo '===== Apagar: so aprovado ou com mais de 7 dias ====='
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('aguardando e recente: nada para apagar',
  public.checklists_para_apagar()::text, '[]');
select pg_temp.checar('8 dias depois: as 9 fotos (8 + dano) saem',
  (select jsonb_array_length(public.checklists_para_apagar(current_date + 8) -> 0 -> 'caminhos')::text), '9');
select public.marcar_checklists_apagados(array[1]::bigint[]);
select pg_temp.checar('depois de marcado, nao volta',
  public.checklists_para_apagar(current_date + 8)::text, '[]');
reset role;

\echo '===== Turno aberto antes da migration fecha sem checklist ====='
-- O turno 1 ja nao esta aberto, entao o socorrista pode ter outro.
insert into public.turnos (motorista_id, veiculo_id, data_turno, hodometro_inicial, criado_por, foto_abertura, exige_checklist)
 values (1, 1, current_date, 1100, 'aaaaaaaa-0000-0000-0000-000000000002', 'turnos/2/abertura-1.jpg', false);
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select public.fechar_turno(2, 1150, 'turnos/2/fechamento-1.jpg');
select pg_temp.checar('turno antigo fecha sem checklist',
  (select situacao::text from public.turnos where id = 2), 'AGUARDANDO_APROVACAO');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
