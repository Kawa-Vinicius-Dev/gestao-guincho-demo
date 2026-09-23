-- Uma conta so de comissao, e uma definicao so de "OS paga" e "OS sem valor".
--
-- Antes, a despesa de comissao fazia round(soma x %) e as telas somavam
-- round(cada OS x %). Com 17% e duas OS de R$ 1,03, a despesa dava R$ 0,35 e a
-- tela, R$ 0,36. Aqui todas as portas precisam dar R$ 0,36.
\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}');
insert into public.motoristas (nome) values ('DJALMA');

-- Ids gerados na ordem: OP 1; OS 1 a 4.
insert into public.ordens_pagamento_porto (numero, valor_total, periodo_inicio, periodo_fim, percentual_comissao)
 values ('06438807', 2.06, '2026-09-01', '2026-09-16', 0.17);
insert into public.ordens_servico_porto (numero, numero_normalizado, ordem_pagamento_id, valor_total,
  data_atendimento, motorista_id, sigla_viatura, status_financeiro, valor_manual) values
 ('OS-A', 'OSA', 1, 1.03, '2026-09-02', 1, 'K85', 'RECEBIDO', null),
 -- Paga numa OP, mas com o status antigo desatualizado: paga e ter OP.
 ('OS-B', 'OSB', 1, 1.03, '2026-09-03', 1, 'K85', 'AGUARDANDO_OP', null),
 -- Sem OP e sem valor informado: sem valor.
 ('OS-C', 'OSC', null, 0, '2026-09-04', 1, 'K85', 'AGUARDANDO_OP', null),
 -- Sem OP, com valor informado a mao: tem valor (previsto).
 ('OS-D', 'OSD', null, 0, '2026-09-05', 1, 'K85', 'AGUARDANDO_OP', 250);

\echo '===== A conta de uma OS ====='
select pg_temp.checar('comissao_da_os arredonda por OS',
  public.comissao_da_os(1.03, 1, 1, false)::text, '0.18');
select pg_temp.checar('OS sem comissao vale zero',
  public.comissao_da_os(1.03, 1, 1, true)::text, '0');

\echo '===== Despesa lancada = soma das OS ====='
select public.porto_sincronizar_comissoes();
select pg_temp.checar('a despesa de comissao e a soma das OS (0,36), e nao 17% da soma (0,35)',
  (select valor::text from public.despesas where protocolo like 'COMISSAO-OP-1-%'), '0.36');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== Todas as telas dao o mesmo numero ====='
select pg_temp.checar('Comissoes (resumo do periodo)',
  (public.resumo_comissoes_ops(array[1]::bigint[]) -> 0 ->> 'comissaoBruta'), '0.36');
select pg_temp.checar('Ficha do socorrista',
  (public.comissao_das_ops(array[1]::bigint[], 1) ->> 'comissaoBruta'), '0.36');
select pg_temp.checar('Ordens de servico',
  (public.porto_listar_os('2026-09-01', '2026-09-16', p_por_competencia => true) ->> 'comissaoTotal'), '0.36');
select pg_temp.checar('Visao geral',
  (public.dashboard_financeiro('2026-09-01', '2026-09-16', true) ->> 'comissaoSobreProducao'), '0.36');

\echo '===== OS paga = OS com OP ====='
select pg_temp.checar('a ficha da comissao a OS com OP mesmo com status antigo',
  (select s ->> 'comissaoGerada' from jsonb_array_elements(
     public.detalhe_socorrista_ops(1, array[1]::bigint[]) -> 'servicos') s where s ->> 'numeroOs' = 'OS-B'), '0.18');
select pg_temp.checar('a Visao geral conta a OS com OP como paga',
  (public.dashboard_financeiro('2026-09-01', '2026-09-16', false) ->> 'producaoPaga'), '2.06');

\echo '===== OS sem valor = sem OP e sem valor informado ====='
select pg_temp.checar('a lista de OS marca a sem valor por linha',
  (select string_agg(i ->> 'numero' || '=' || (i ->> 'semValor'), ',' order by i ->> 'numero')
     from jsonb_array_elements(public.porto_listar_os('2026-09-01', '2026-09-16') -> 'itens') i),
  'OS-A=false,OS-B=false,OS-C=true,OS-D=false');
select pg_temp.checar('as Pendencias usam a mesma definicao (valor informado nao e sem valor)',
  (select string_agg(p ->> 'numeroOs', ',' order by p ->> 'numeroOs')
     from jsonb_array_elements(public.porto_pendencias_os('2026-09-01', '2026-09-16', false)) p
    where (p ->> 'semValor')::boolean), 'OS-C');
select pg_temp.checar('e trazem o valor informado da OS-D',
  (select p ->> 'valorTotal' from jsonb_array_elements(public.porto_pendencias_os('2026-09-01', '2026-09-16', false)) p
    where p ->> 'numeroOs' = 'OS-D'), '250.00');
reset role;

\echo 'TODOS OS TESTES PASSARAM'
