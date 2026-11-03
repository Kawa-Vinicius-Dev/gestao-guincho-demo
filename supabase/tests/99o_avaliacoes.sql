-- Avaliacoes: visitante sem login avalia, mas nao le nem escreve direto na
-- tabela; socorrista nao le; administrador le tudo (03/11/2026).
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

create or replace function pg_temp.recusa(rotulo text, comando text, codigo text) returns void
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

\echo '===== Visitante sem login ====='
set role anon;
select public.avaliar(5, '  Maria  ', 'abc1d23', 'Chegou rapido.');
select public.avaliar(3, '', null, '   ');
select pg_temp.recusa('nota fora de 1 a 5', $q$select public.avaliar(6, null, null, null)$q$, '23514');
select pg_temp.recusa('nota vazia', $q$select public.avaliar(null, null, null, null)$q$, '23514');
select pg_temp.recusa('nao le a tabela', $q$select * from public.avaliacoes$q$, '42501');
select pg_temp.recusa('nao grava direto', $q$insert into public.avaliacoes (nota) values (1)$q$, '42501');
select pg_temp.recusa('nao lista', $q$select public.listar_avaliacoes()$q$, '42501');
reset role;

\echo '===== Socorrista ====='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select pg_temp.recusa('socorrista nao lista', $q$select public.listar_avaliacoes()$q$, '42501');

\echo '===== Administrador ====='
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('lista as duas', jsonb_array_length(public.listar_avaliacoes())::text, '2');
select pg_temp.checar('limpa espacos e poe placa em maiuscula',
  (select e->>'nome' || '|' || (e->>'placa') from jsonb_array_elements(public.listar_avaliacoes()) e where (e->>'nota') = '5'),
  'Maria|ABC1D23');
select pg_temp.checar('campos vazios viram nulo',
  (select coalesce(e->>'nome','-') || coalesce(e->>'placa','-') || coalesce(e->>'comentario','-')
     from jsonb_array_elements(public.listar_avaliacoes()) e where (e->>'nota') = '3'),
  '---');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
