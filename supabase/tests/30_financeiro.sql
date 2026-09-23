\set ON_ERROR_STOP on
create or replace function pg_temp.checar(rotulo text, obtido text, esperado text) returns void
language plpgsql as $$
begin
  if obtido is not distinct from esperado then raise notice 'PASSOU  | %', rotulo;
  else raise exception 'FALHOU  | % | esperado=% obtido=%', rotulo, esperado, obtido; end if;
end $$;


insert into auth.users (id,email,raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','dono@t.local','{"nome":"Dono","perfil":"ADMINISTRADOR"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','soc@t.local','{"nome":"Soc","perfil":"FUNCIONARIO"}');
insert into public.categorias (nome,tipo) values ('Combustível','DESPESA'),('Alimentação','DESPESA'),('Guincho','RECEITA');
insert into public.veiculos (identificacao,placa,custo_por_km) values ('L168','AAA1A11',2.00),('L200','BBB2B22',3.00);
insert into public.contratantes (nome) values ('Porto Seguro');
insert into public.motoristas (nome,perfil_id,veiculo_id) values ('Socorrista','aaaaaaaa-0000-0000-0000-000000000002',1);
insert into public.calendario_pagamentos_porto (data_pagamento,descricao,competencia_inicio,competencia_fim)
 values ('2026-09-20','Ciclo set/26','2026-09-01','2026-09-30');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '===== PERIODOS: o recorte precisa excluir o que esta fora ====='
-- Uma receita dentro e uma fora do periodo, mesmo valor.
reset role;
insert into public.receitas (descricao,valor,data_competencia,status,data_recebimento) values
 ('Dentro',1000,'2026-09-15','RECEBIDA','2026-09-15'),
 ('Antes',9999,'2026-08-31','RECEBIDA','2026-08-31'),
 ('Depois',8888,'2026-10-01','RECEBIDA','2026-10-01');
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('receita fora do periodo nao entra',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'receitaRecebida'), '1000.00');
select pg_temp.checar('borda inicial entra (>=)',
  (public.dashboard_financeiro('2026-08-31','2026-09-30') ->> 'receitaRecebida'), '10999.00');
select pg_temp.checar('borda final entra (<=)',
  (public.dashboard_financeiro('2026-09-01','2026-10-01') ->> 'receitaRecebida'), '9888.00');

\echo '===== ATRASO: derivado do vencimento, sem depender de rotina ====='
-- PENDENTE com vencimento no passado: o Java contava como atrasada na leitura.
reset role;
insert into public.contas_receber (contratante_id,descricao,valor_previsto,data_competencia,vencimento,status)
 values (1,'Vencida ontem',700,'2026-09-05','2020-01-01','PENDENTE'),
        (1,'A vencer',300,'2026-09-06','2099-01-01','PENDENTE');
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('conta vencida conta como atraso mesmo com status PENDENTE',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'totalAtrasado'), '700.00');
select pg_temp.checar('a que ainda nao venceu nao conta como atraso',
  ((public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'receitaPrevista')::numeric)::text, '1000.00');

reset role;
\echo '===== DESPESAS: so aprovada entra no resultado ====='
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,status,aprovada,
  aprovado_por,aprovado_em,data_pagamento,veiculo_id,motorista_id,criado_por,natureza) values
 ('Diesel pago',(select id from public.categorias where nome='Combustível'),400,'2026-09-08','PAGO',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),'2026-09-08',1,1,'aaaaaaaa-0000-0000-0000-000000000002','GERAL'),
 ('Marmita paga',(select id from public.categorias where nome='Alimentação'),50,'2026-09-09','PAGO',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),'2026-09-09',1,1,'aaaaaaaa-0000-0000-0000-000000000002','ALIMENTACAO_FUNCIONARIO'),
 ('Pneu aprovado pendente',(select id from public.categorias where nome='Combustível'),100,'2026-09-11','PENDENTE',true,'aaaaaaaa-0000-0000-0000-000000000001',now(),null,1,null,'aaaaaaaa-0000-0000-0000-000000000001','GERAL');
-- Nao aprovada: nao pode entrar em lugar nenhum do resultado.
insert into public.despesas (descricao,categoria_id,valor,data_lancamento,status,aprovada,veiculo_id,criado_por)
 values ('Aguardando aprovacao',(select id from public.categorias where nome='Combustível'),5000,'2026-09-12','PENDENTE',false,1,'aaaaaaaa-0000-0000-0000-000000000002');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('despesa nao aprovada fica fora das pagas',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'despesasPagas'), '450.00');
select pg_temp.checar('despesa nao aprovada fica fora das previstas',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'despesasPrevistas'), '100.00');
select pg_temp.checar('despesa nao aprovada nao entra no custo da viatura',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') -> 'resultadoPorVeiculo' -> 0 ->> 'despesas'),
  '450.00');

\echo '===== ACUMULADOS E INDICADORES ====='
select pg_temp.checar('saldoRealizado = recebida - pagas',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'saldoRealizado'), '550.00');
select pg_temp.checar('saldoProjetado = recebida + prevista - pagas - previstas',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'saldoProjetado'), '1450.00');

reset role;
\echo '===== KM: colunas geradas e custo congelado ====='
insert into public.quilometragens (data_registro,veiculo_id,motorista_id,hodometro_inicial,
  hodometro_final,km_remunerado,custo_por_km) values ('2026-09-12',1,1,10000,11000,800,2.00);
-- Muda o custo do veiculo depois do registro: o que ja aconteceu nao pode mudar.
update public.veiculos set custo_por_km = 99 where id = 1;
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('custo do km morto usa o valor congelado no registro',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'custoKmMorto'), '400.00');
select pg_temp.checar('km morto = total - remunerado',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'kmMorto'), '200.00');

reset role;
\echo '===== PRODUCAO E COMISSAO ====='
insert into public.ordens_pagamento_porto (numero,valor_total,situacao_financeira,valor_recebido,
  data_recebimento,data_pagamento_programada,calendario_pagamento_id)
 values ('OP-1',1000,'RECEBIDO',980,'2026-09-20','2026-09-20',1),
        ('OP-2',500,'PROGRAMADO',null,null,'2026-09-25',1);
insert into public.ordens_servico_porto (numero,numero_normalizado,ordem_pagamento_id,valor_total,
  data_atendimento,motorista_id,status_financeiro) values
 ('OS-1','OS1',1,500,'2026-09-03',1,'RECEBIDO'),
 ('OS-2','OS2',1,500,'2026-09-04',1,'RECEBIDO'),
 ('OS-3','OS3',null,300,'2026-09-25',1,'AGUARDANDO_OP');
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('producao paga soma so as recebidas',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'producaoPaga'), '1000.00');
select pg_temp.checar('comissao sobre producao = 20%',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'comissaoSobreProducao'), '200.00');
select pg_temp.checar('producao pendente nao entra na paga',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'producaoPendente'), '300.00');

-- OS cancelada nao e "pendente": ela nao vai virar dinheiro nunca.
reset role;
insert into public.ordens_servico_porto (numero,numero_normalizado,valor_total,data_atendimento,
  motorista_id,status_financeiro,status_operacional)
 values ('OS-4','OS4',777,'2026-09-26',1,'AGUARDANDO_OP','CANCELADO');
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.checar('OS cancelada fica fora da producao pendente',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'producaoPendente'), '300.00');
-- Decidido (Kawa, 22/09/2026): OS cancelada sai da producao e dos paineis,
-- inclusive da contagem de servicos do periodo.
select pg_temp.checar('e sai da contagem de servicos do periodo',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'servicosDoPeriodo'), '3');

\echo '===== COMISSAO A PAGAR: some quando o ciclo e repassado ====='
select pg_temp.checar('antes do repasse, a comissao esta devida',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'comissaoAPagar'), '200.00');

-- Repassar a comissao do ciclo: a divida daquele ciclo tem de zerar.
reset role;
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
-- O repasse manual (pagar_comissao) saiu com o fluxo antigo: a comissao hoje
-- entra sozinha quando a OP fecha (Kawa, 16/09/2026). As checagens abaixo so
-- precisam da despesa de comissao paga, com o protocolo de comissao.
-- A categoria de comissao ja existe: as migrations a criam.
select public.registrar_despesa_aprovada('Comissão do ciclo',
  (select id from public.categorias where nome = 'Comissão de socorrista'), 150, '2026-09-21',
  p_motorista_id => 1, p_protocolo => 'COMISSAO-1-1', p_paga => true, p_data_pagamento => '2026-09-21');

-- O repasse vira despesa paga e entra no caixa; mas nao pode ser contado como
-- custo da pessoa de novo, senao a comissao apareceria duas vezes no custo dela.
-- A marmita (50) foi para a viatura desde 20260916170000 ("nao e adiantamento
-- ao socorrista"), como a suite 20 registra: o custo proprio dele fica em 0.
select pg_temp.checar('o repasse nao dobra o custo do socorrista',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') -> 'resultadoPorSocorrista' -> 0 ->> 'despesas'),
  '0');

\echo '===== POR CATEGORIA: participacao soma 100 ====='
-- Combustivel 400, repasse de comissao 150, alimentacao 50.
select pg_temp.checar('a maior categoria vem primeiro',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') -> 'despesasPorCategoria' -> 0 ->> 'categoria'),
  'Combustível');
select pg_temp.checar('o repasse de comissao entra nas despesas pagas',
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'despesasPagas'), '600.00');
select pg_temp.checar('as participacoes somam 100%',
  (select round(sum((x ->> 'participacao')::numeric))::text
   from jsonb_array_elements(public.dashboard_financeiro('2026-09-01','2026-09-30')
        -> 'despesasPorCategoria') x), '100');

\echo '===== TRAJETORIA: fecha com o total pago sem outra chamada ====='
select pg_temp.checar('a serie diaria vem dentro do resumo da tela',
  (public.dashboard_resumo('2026-09-01','2026-09-30')
    -> 'financeiro' -> 'despesasAcumuladasPorDia' -> 0 ->> 'data'), '2026-09-08');
select pg_temp.checar('o ultimo acumulado fecha com despesas pagas',
  (select item ->> 'acumulado'
   from jsonb_array_elements(public.dashboard_resumo('2026-09-01','2026-09-30')
        -> 'financeiro' -> 'despesasAcumuladasPorDia') with ordinality as serie(item,posicao)
   order by posicao desc limit 1),
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'despesasPagas'));

\echo '===== CHAMADA UNICA ====='
-- O bloco "porto" saiu em 20260923200000: a Visao geral nunca o leu.
select pg_temp.checar('dashboard_resumo traz o bloco financeiro',
  (select string_agg(k, ',' order by k) from jsonb_object_keys(
     public.dashboard_resumo('2026-09-01','2026-09-30')) k), 'financeiro');
select pg_temp.checar('e os numeros batem com as funcoes separadas',
  (public.dashboard_resumo('2026-09-01','2026-09-30') -> 'financeiro' ->> 'saldoRealizado'),
  (public.dashboard_financeiro('2026-09-01','2026-09-30') ->> 'saldoRealizado'));

\echo '===== EXTRATO ====='
select pg_temp.checar('extrato traz receita e despesa juntas, mais recente primeiro',
  (select tipo from public.extrato_financeiro('2026-09-01','2026-09-30') limit 1), 'DESPESA');
select pg_temp.checar('realizado marca o que ja acontesceu',
  (select count(*)::text from public.extrato_financeiro('2026-09-01','2026-09-30') where realizado), '4');

\echo '===== PERIODO VAZIO: zeros, nao nulos ====='
select pg_temp.checar('periodo sem movimento devolve zero',
  (public.dashboard_financeiro('2020-01-01','2020-01-31') ->> 'saldoRealizado'), '0');
select pg_temp.checar('e listas vazias, nao null',
  (public.dashboard_financeiro('2020-01-01','2020-01-31') ->> 'resultadoPorVeiculo'), '[]');
reset role;

\echo '===== FINANCEIRO OK ====='
