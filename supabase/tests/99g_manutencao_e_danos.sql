-- Manutencao por km (a partir do odometro dos turnos) e dano do checklist
-- virando pendencia da viatura.
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

\echo '===== O socorrista abre o turno com um dano no checklist ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select public.abrir_turno(1, 148320);
select public.registrar_checklist(1,
  (select jsonb_object_agg(k, 'turnos/1/c-' || k || '.jpg') from unnest(public.fotos_do_checklist()) k),
  '[{"caminho":"turnos/1/c-dano-1.jpg","descricao":"Retrovisor direito quebrado"}]');
select pg_temp.checar('socorrista nao ve as pendencias', (select count(*)::text from public.viatura_danos), '0');

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('o dano vira pendencia da viatura, com quem viu',
  (select descricao || ' | ' || veiculo_id || ' | ' || motorista_id || ' | ' || (resolvido_em is null)
     from public.viatura_danos), 'Retrovisor direito quebrado | 1 | 1 | true');

\echo '===== Manutencao por km ====='
insert into public.manutencao_planos (veiculo_id, item, intervalo_km, ultimo_km) values (1, 'Troca de óleo', 10000, 140000);
select pg_temp.checar('km atual vem do turno e faltam 1.680 km',
  (select km_atual || ' ' || faltam_km from public.manutencao_da_frota()), '148320.00 1680.00');
do $$
begin
  insert into public.manutencao_planos (veiculo_id, item, intervalo_km) values (1, ' troca de ÓLEO', 5000);
  raise exception 'FALHOU  | aceitou o mesmo item duas vezes';
exception when unique_violation then raise notice 'PASSOU  | um item por viatura';
end $$;
update public.manutencao_planos set ultimo_km = 148320, ultima_data = current_date;
select pg_temp.checar('registrar a troca zera a contagem',
  (select faltam_km::text from public.manutencao_da_frota()), '10000.00');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
