-- Sem login, nenhuma das 6 funcoes apontadas pelo verificador responde; logado,
-- as quatro que as telas usam continuam abertas.
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

select pg_temp.checar('anon nao chama nenhuma das 6',
  (select count(*)::text from unnest(array[
    'public.checklist_abre_danos()', 'public.despesa_em_categoria_liberada()',
    'public.km_atual_da_viatura(bigint)', 'public.percentual_da_comissao(bigint, bigint)',
    'public.porto_valor_esperado(text, numeric)', 'public.proxima_parcela(public.despesas_recorrentes)'
  ]) f where has_function_privilege('anon', f, 'execute')), '0');

select pg_temp.checar('logado chama as 4 das telas',
  (select count(*)::text from unnest(array[
    'public.km_atual_da_viatura(bigint)', 'public.percentual_da_comissao(bigint, bigint)',
    'public.porto_valor_esperado(text, numeric)', 'public.proxima_parcela(public.despesas_recorrentes)'
  ]) f where has_function_privilege('authenticated', f, 'execute')), '4');

\echo 'TODOS OS TESTES PASSARAM'
