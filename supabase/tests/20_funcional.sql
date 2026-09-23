\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;

-- Cenario: um mes com receita, despesa, km e producao Porto.
insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','soc@t.local','{"nome":"Socorrista","perfil":"FUNCIONARIO"}'),
 ('aaaaaaaa-0000-0000-0000-000000000003','outro@t.local','{"nome":"Outro","perfil":"ADMINISTRADOR"}');
insert into public.categorias (nome,tipo) values ('Combustível','DESPESA'),('Alimentação','DESPESA'),('Guincho','RECEITA');
insert into public.veiculos (identificacao,placa,custo_por_km,sigla_porto) values ('L168','AAA1A11',2.00,'L168');
insert into public.contratantes (nome) values ('Porto Seguro');
insert into public.motoristas (nome,perfil_id,veiculo_id) values ('Socorrista','aaaaaaaa-0000-0000-0000-000000000002',1);
insert into public.calendario_pagamentos_porto (data_pagamento,descricao,competencia_inicio,competencia_fim)
 values ('2026-09-20','Ciclo set/26','2026-09-01','2026-09-30');

-- Receita recebida 1000; prevista 300
insert into public.receitas (descricao,valor,data_competencia,status,data_recebimento,veiculo_id)
 values ('Servico A',1000,'2026-09-10','RECEBIDA','2026-09-10',1);
insert into public.receitas (descricao,valor,data_competencia,status)
 values ('Servico B',300,'2026-09-15','PREVISTA');
-- Conta atrasada 200
insert into public.contas_receber (contratante_id,descricao,valor_previsto,data_competencia,vencimento,status)
 values (1,'Fatura',200,'2026-09-05','2026-09-06','ATRASADO');
-- Despesas: 400 paga (viatura), 50 alimentacao paga, 100 aprovada pendente.
-- A categoria vai pelo nome: a sincronizacao de comissao, rodada pelas
-- migrations, cria "Comissao de socorrista" antes, e ela vira a de id 1.
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,status,aprovada,
  aprovado_por,aprovado_em,data_pagamento,veiculo_id,motorista_id,criado_por,natureza)
 values ('Diesel',(select id from public.categorias where nome='Combustível'),400,'2026-09-08','PAGO',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),
         '2026-09-08',1,1,'aaaaaaaa-0000-0000-0000-000000000002','GERAL'),
        ('Marmita',(select id from public.categorias where nome='Alimentação'),50,'2026-09-09','PAGO',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),
         '2026-09-09',1,1,'aaaaaaaa-0000-0000-0000-000000000002','ALIMENTACAO_FUNCIONARIO'),
        ('Pneu',(select id from public.categorias where nome='Combustível'),100,'2026-09-11','PENDENTE',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),
         null,1,null,'aaaaaaaa-0000-0000-0000-000000000001','GERAL');
-- Km: 1000 rodados, 800 remunerados -> 200 mortos x 2.00 = 400
insert into public.quilometragens (data_registro,veiculo_id,motorista_id,hodometro_inicial,
  hodometro_final,km_remunerado,custo_por_km)
 values ('2026-09-12',1,1,10000,11000,800,2.00);
-- Porto: OP paga com 2 OSs de 500 (recebidas) + 1 OS de 300 pendente
insert into public.ordens_pagamento_porto (numero,valor_total,situacao_financeira,valor_recebido,
  data_recebimento,calendario_pagamento_id)
 values ('OP-1',1000,'RECEBIDO',1000,'2026-09-20',1);
insert into public.ordens_servico_porto (numero,numero_normalizado,ordem_pagamento_id,valor_total,
  data_atendimento,motorista_id,status_financeiro)
 values ('OS-1','OS1',1,500,'2026-09-03',1,'RECEBIDO'),
        ('OS-2','OS2',1,500,'2026-09-04',1,'RECEBIDO'),
        ('OS-3','OS3',null,300,'2026-09-25',1,'AGUARDANDO_OP');

\echo '========== DASHBOARD =========='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.checar('km_total gerado', (select km_total::text from public.quilometragens), '1000.00');
select pg_temp.checar('km_morto gerado', (select km_morto::text from public.quilometragens), '200.00');
select pg_temp.checar('custo_km_morto gerado', (select custo_km_morto::text from public.quilometragens), '400.00');

create temp view d as select public.dashboard_financeiro('2026-09-01','2026-09-30') as j;
select pg_temp.checar('receitaRecebida', (select (j->>'receitaRecebida') from d), '1000.00');
select pg_temp.checar('receitaPrevista (300 manual + 200 conta)', (select (j->>'receitaPrevista') from d), '500.00');
select pg_temp.checar('totalAtrasado', (select (j->>'totalAtrasado') from d), '200.00');
select pg_temp.checar('despesasPagas (400+50)', (select (j->>'despesasPagas') from d), '450.00');
select pg_temp.checar('despesasPrevistas', (select (j->>'despesasPrevistas') from d), '100.00');
select pg_temp.checar('saldoRealizado 1000-450', (select (j->>'saldoRealizado') from d), '550.00');
select pg_temp.checar('saldoProjetado', (select (j->>'saldoProjetado') from d), '950.00');
select pg_temp.checar('kmMorto', (select (j->>'kmMorto') from d), '200.00');
select pg_temp.checar('custoKmMorto', (select (j->>'custoKmMorto') from d), '400.00');
select pg_temp.checar('producaoPaga (2x500)', (select (j->>'producaoPaga') from d), '1000.00');
select pg_temp.checar('comissaoSobreProducao 20%', (select (j->>'comissaoSobreProducao') from d), '200.00');
select pg_temp.checar('producaoPendente', (select (j->>'producaoPendente') from d), '300.00');
select pg_temp.checar('servicosDoPeriodo', (select (j->>'servicosDoPeriodo') from d), '3');
select pg_temp.checar('servicosPendentes', (select (j->>'servicosPendentes') from d), '1');
select pg_temp.checar('comissaoAPagar (ciclo sem repasse)', (select (j->>'comissaoAPagar') from d), '200.00');

-- Resultado por veiculo: alimentacao ENTRA no custo da viatura (450 = 400 + 50).
-- A regra era o contrario ate 20260916170000, que a inverteu de proposito: o
-- cartao que a equipe usa e vinculado a viatura, entao a refeicao comprada nele
-- e custo daquela viatura, como o diesel. O teste ficou na premissa antiga.
select pg_temp.checar('veiculo: despesas com alimentacao',
  (select j->'resultadoPorVeiculo'->0->>'despesas' from d), '450.00');
select pg_temp.checar('veiculo: receitas',
  (select j->'resultadoPorVeiculo'->0->>'receitas' from d), '1000.00');
select pg_temp.checar('veiculo: resultado',
  (select j->'resultadoPorVeiculo'->0->>'resultado' from d), '550.00');

-- Socorrista: nenhuma despesa propria. A alimentacao era a unica que contava
-- aqui, e 20260916170000 a mandou para a viatura — "nao e adiantamento ao
-- socorrista, e nao tem por que sair do liquido dele". O que desconta dele
-- continua sendo o gasto marcado com desconta_comissao, que este caso nao tem.
select pg_temp.checar('socorrista: sem despesa propria',
  (select j->'resultadoPorSocorrista'->0->>'despesas' from d), '0');
select pg_temp.checar('socorrista: producao',
  (select j->'resultadoPorSocorrista'->0->>'producao' from d), '1000.00');
select pg_temp.checar('socorrista: custoTotal e so a comissao',
  (select j->'resultadoPorSocorrista'->0->>'custoTotal' from d), '200.00');

-- Categorias ordenadas pela maior
select pg_temp.checar('categoria maior primeiro',
  (select j->'despesasPorCategoria'->0->>'categoria' from d), 'Combustível');
select pg_temp.checar('participacao da maior (400/450)',
  (select j->'despesasPorCategoria'->0->>'participacao' from d), '88.89');

\echo '========== EXTRATO =========='
select pg_temp.checar('extrato traz receitas e despesas',
  (select count(*)::text from public.extrato_financeiro('2026-09-01','2026-09-30')), '5');

\echo '========== COMISSAO =========='
select pg_temp.checar('comissao bruta 20% de 1000',
  (public.comissao_do_ciclo(1,1) ->> 'comissaoBruta'), '200.00');
select pg_temp.checar('alimentacao aprovada desconta',
  (public.comissao_do_ciclo(1,1) ->> 'alimentacaoAprovada'), '50.00');
select pg_temp.checar('liquido 200-50',
  (public.comissao_do_ciclo(1,1) ->> 'liquido'), '150.00');
select pg_temp.checar('servicos do ciclo',
  jsonb_array_length((public.comissao_do_ciclo(1,1)) -> 'servicos')::text, '2');
reset role;

\echo '========== PAGAMENTO DE COMISSAO =========='
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
select pg_temp.checar('pagar comissao cria o repasse',
  (select valor_pago::text from public.pagar_comissao(1,1,'2026-09-21')), '150.00');
select pg_temp.checar('repasse virou despesa paga',
  (select status::text from public.despesas
    where protocolo = 'COMISSAO-1-1'), 'PAGO');
do $$
begin
  perform public.pagar_comissao(1,1,'2026-09-22');
  raise exception 'FALHOU  | pagou o mesmo ciclo duas vezes';
exception
  when unique_violation then raise notice 'PASSOU  | nao paga o mesmo ciclo duas vezes';
end $$;
reset role;
\echo '========== FUNCIONAL OK =========='
