-- O painel diario da Porto identifica a viatura pelo codigo dela ("L25", "K85", "L168"),
-- que nao e o identificador da frota do cliente ("VTR-01"). Sao dois nomes para o mesmo
-- caminhao, e so quem opera sabe qual e qual.
--
-- Este campo guarda esse de-para, declarado uma vez por veiculo. Diferente do socorrista,
-- o codigo da viatura e estavel: L25 e sempre o mesmo caminhao, entao da para resolver
-- automatico sem chute. O socorrista continua sendo escolhido por uma pessoa, porque o
-- painel corta o nome em 20 caracteres e a equipe tem pai e filho homonimos.
--
-- Fica nulo por padrao: veiculo que nunca apareceu no painel da Porto nao precisa de codigo.
alter table veiculos add column sigla_porto text;

-- Indice para a importacao resolver o codigo sem varrer a tabela a cada linha do dia.
create index veiculos_sigla_porto_idx on veiculos(sigla_porto);
