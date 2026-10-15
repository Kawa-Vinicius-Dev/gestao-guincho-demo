-- Multas: o sistema acha quem estava com a viatura pelo turno, a multa entra
-- na data da infracao, a pagar, no nome dele e com desconto marcado; o mesmo
-- auto nao entra duas vezes; so o administrador lanca (Kawa, 15/10/2026).
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
 ('aaaaaaaa-0000-0000-0000-000000000002','soc@t.local','{"nome":"Socorrista","perfil":"FUNCIONARIO"}');
insert into public.veiculos (identificacao, placa, custo_por_km) values ('L168','ABC1D23',2.50), ('K85','XYZ9A87',2.50);
insert into public.motoristas (nome,perfil_id,veiculo_id) values ('DJALMA','aaaaaaaa-0000-0000-0000-000000000002',1);

-- Turno do Djalma na L168: 10/10/2026 das 07h as 19h (horario de Brasilia).
insert into public.turnos (motorista_id, veiculo_id, data_turno, situacao, aberto_em, hodometro_inicial,
                           fechado_em, hodometro_final, foto_fechamento, criado_por)
values (1, 1, '2026-10-10', 'AGUARDANDO_APROVACAO', '2026-10-10 07:00-03', 10000,
        '2026-10-10 19:00-03', 10200, 'turnos/1/f.jpg', 'aaaaaaaa-0000-0000-0000-000000000002');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
\echo '===== So o administrador ====='
select pg_temp.recusa('socorrista nao consulta quem dirigia',
  $q$select public.quem_estava_na_viatura(1, '2026-10-10', '14:30')$q$, '42501');
select pg_temp.recusa('socorrista nao lanca multa',
  $q$select public.registrar_multa(1, '2026-10-10', '14:30', 195.23, 'A1')$q$, '42501');

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
\echo '===== Quem estava com a viatura ====='
select pg_temp.checar('no meio do turno, acha o Djalma',
  (select string_agg(x ->> 'socorrista', ',') from jsonb_array_elements(public.quem_estava_na_viatura(1, '2026-10-10', '14:30')) x),
  'DJALMA');
select pg_temp.checar('fora do horario do turno, ninguem',
  jsonb_array_length(public.quem_estava_na_viatura(1, '2026-10-10', '20:00'))::text, '0');
select pg_temp.checar('outra viatura, ninguem',
  jsonb_array_length(public.quem_estava_na_viatura(2, '2026-10-10', '14:30'))::text, '0');

\echo '===== Lancar ====='
select pg_temp.recusa('sem auto', $q$select public.registrar_multa(1, '2026-10-10', '14:30', 195.23, ' ')$q$);
select pg_temp.recusa('sem valor', $q$select public.registrar_multa(1, '2026-10-10', '14:30', 0, 'A1')$q$);
select pg_temp.recusa('infracao no futuro', $q$select public.registrar_multa(1, '2100-01-01', '10:00', 195.23, 'A1')$q$);

select public.registrar_multa(1, '2026-10-10', '14:30', 195.23, 'SP123456', '2026-11-20', 1);
reset role;
select pg_temp.checar('despesa da viatura no nome dele, data da infracao, a pagar, aprovada, com desconto',
  (select concat_ws(' | ', c.nome, d.descricao, d.valor, d.data_lancamento, d.vencimento, d.status,
                    d.aprovada, d.veiculo_id, d.motorista_id, d.desconta_comissao, d.protocolo)
     from public.despesas d join public.categorias c on c.id = d.categoria_id),
  'Multas | Multa · auto SP123456 · 10/10/2026 14:30 | 195.23 | 2026-10-10 | 2026-11-20 | PENDENTE | t | 1 | 1 | t | SP123456');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.recusa('o mesmo auto nao entra duas vezes',
  $q$select public.registrar_multa(1, '2026-10-10', '14:30', 195.23, 'sp123456 ')$q$, '23505');

\echo '===== Sem socorrista, fica so na viatura e sem desconto ====='
select public.registrar_multa(2, '2026-10-11', '09:00', 88.38, 'RJ999', null, null, true);
reset role;
select pg_temp.checar('sem socorrista nao ha de quem descontar',
  (select coalesce(motorista_id::text, '-') || ' ' || desconta_comissao from public.despesas where protocolo = 'RJ999'), '- false');
select pg_temp.checar('uma categoria Multas so', (select count(*)::text from public.categorias where lower(nome) = 'multas'), '1');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
\echo '===== Listar ====='
select pg_temp.checar('lista as multas do periodo, com quem dirigia',
  (select string_agg((x ->> 'auto') || ':' || coalesce(x ->> 'socorrista', '-'), ',')
     from jsonb_array_elements(public.listar_multas('2026-10-01', '2026-10-31')) x),
  'RJ999:-,SP123456:DJALMA');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
