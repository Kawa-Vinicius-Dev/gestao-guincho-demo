-- O campo "comprovante" ja existia como referencia textual livre (ex.: numero da nota).
-- Estas colunas guardam o arquivo em si, enviado para um object storage externo:
-- o texto livre continua funcionando para quem so quer anotar uma referencia.
alter table despesas add column comprovante_arquivo text;
alter table despesas add column comprovante_nome_original text;
alter table despesas add column comprovante_content_type text;
alter table despesas add column comprovante_tamanho_bytes bigint;
