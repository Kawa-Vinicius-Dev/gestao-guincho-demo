-- OS que veio com nome sai do Auxiliar (Kawa, 15/10/2026): "JEFERSON MARTINS DA"
-- e do Jeferson pai, que e o unico ativo; sem nome continua no Auxiliar.
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

insert into public.motoristas (nome, ativo) values
 ('JEFERSON MARTINS DA SILVA', true),
 ('JEFERSON MARTINS DA SILVA FILHO', false),
 ('AUXILIAR', true),
 ('ANA SOUZA', true),
 ('ANA SOUZA LIMA', true);

insert into public.ordens_servico_porto (numero, numero_normalizado, valor_total, data_atendimento, socorrista, motorista_id)
select n, n, 100, '2026-10-01', s, (select id from public.motoristas where nome = 'AUXILIAR')
  from (values ('J1', 'JEFERSON MARTINS DA'),
               ('J2', ''),
               ('J3', 'ANA SOUZ'),
               ('J4', 'JEFERSON MARTINS DA SILVA FILHO')) v(n, s);

\ir ../migrations/20261015170000_auxiliar_devolve_os_com_nome.sql

create or replace function pg_temp.dono(p text) returns text language sql as $$
  select m.nome from public.ordens_servico_porto os join public.motoristas m on m.id = os.motorista_id
   where os.numero = p $$;

select pg_temp.checar('nome cortado vai para o unico ativo', pg_temp.dono('J1'), 'JEFERSON MARTINS DA SILVA');
select pg_temp.checar('sem nome continua no Auxiliar', pg_temp.dono('J2'), 'AUXILIAR');
select pg_temp.checar('dois ativos: continua no Auxiliar', pg_temp.dono('J3'), 'AUXILIAR');
select pg_temp.checar('nome inteiro vale mesmo desativado', pg_temp.dono('J4'), 'JEFERSON MARTINS DA SILVA FILHO');

\ir ../migrations/20261015170000_auxiliar_devolve_os_com_nome.sql
select pg_temp.checar('rodar de novo nao muda nada', pg_temp.dono('J3'), 'AUXILIAR');

\echo 'TODOS OS TESTES PASSARAM'
