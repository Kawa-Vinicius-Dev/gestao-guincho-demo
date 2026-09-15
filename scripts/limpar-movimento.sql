-- Zera o MOVIMENTO e preserva os CADASTROS.
--
-- Apaga tudo que entra por importacao ou lancamento — ordens da Porto, receitas,
-- despesas, contas, quilometragem, comissoes e o rastro das importacoes — e
-- mantem o que custa a recadastrar: usuarios, veiculos, socorristas, categorias,
-- contratantes e o calendario de pagamentos da Porto.
--
-- Depois disso o sistema volta a aceitar os mesmos arquivos: o controle que
-- impede reimportar (registros_importados_porto) sai junto.
--
-- COMO RODAR: SQL Editor do Supabase, de uma vez. Roda dentro de uma transacao:
-- se qualquer linha falhar, nada e apagado.
--
-- NAO TEM VOLTA. Confira o backup em gestao-adm-backups antes.

begin;

-- Antes: o que existe hoje.
select 'ANTES' as momento,
  (select count(*) from ordens_servico_porto)  as os_porto,
  (select count(*) from ordens_pagamento_porto) as ops_porto,
  (select count(*) from receitas)               as receitas,
  (select count(*) from despesas)               as despesas,
  (select count(*) from contas_receber)         as contas;

-- A ordem importa: filho antes de pai, senao a chave estrangeira barra.
delete from pagamentos_comissao;
delete from itens_importacao;
delete from registros_importados_porto;
delete from historico_porto;
delete from justificativas_conciliacao_porto;
delete from pendencias_financeiras_porto;

-- Receita e conta apontam para a OS e para a OP: saem antes delas.
delete from receitas;
delete from contas_receber;

delete from ordens_servico_porto;
delete from ordens_pagamento_porto;

delete from despesas;
delete from despesas_recorrentes;
delete from quilometragens;

-- O arquivo importado some junto com o que ele gerou.
delete from importacoes;

-- Depois: tudo zerado, cadastros de pe.
select 'DEPOIS' as momento,
  (select count(*) from ordens_servico_porto)   as os_porto,
  (select count(*) from receitas)               as receitas,
  (select count(*) from despesas)               as despesas,
  (select count(*) from veiculos)               as veiculos_mantidos,
  (select count(*) from motoristas)             as socorristas_mantidos,
  (select count(*) from calendario_pagamentos_porto) as ciclos_mantidos;

commit;
