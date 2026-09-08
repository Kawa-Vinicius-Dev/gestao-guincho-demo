-- A Porto nunca preenche a sigla da viatura no relatorio de OS: nas 275 linhas do arquivo real
-- ela veio vazia em todas. A viatura passa a vir do cadastro do funcionario, alcancada pela
-- cadeia OS -> QRA -> funcionario -> viatura.
alter table motoristas add column veiculo_id bigint references veiculos(id);
