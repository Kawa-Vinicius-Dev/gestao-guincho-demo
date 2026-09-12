-- O painel diario da Porto mostra o numero da OS como "5632135/26"; o relatorio
-- financeiro mostra a MESMA OS como "01/5632135-26". Sao strings diferentes, entao
-- a busca por numero exato nao reconhece uma na outra e a segunda importacao criaria
-- uma OS duplicada em vez de completar a que ja existe.
-- Esta coluna guarda o que os dois formatos tem em comum: os 7 digitos do nucleo
-- seguidos dos 2 do ano. O prefixo de 2 digitos ("01/", "04/", "05/") e so formatacao
-- do relatorio financeiro - conferido nas 275 OS reais, o nucleo nao colide.
alter table ordens_servico_porto add column numero_normalizado text;

-- Toda OS existente veio do relatorio financeiro, no formato fixo NN/NNNNNNN-NN
-- (13 caracteres, conferido: as 275 linhas seguem o mesmo molde).
-- Uso substr em vez de expressao regular porque o H2 dos testes e o Postgres de
-- producao divergem no dialeto de regex, e substr se comporta igual nos dois.
update ordens_servico_porto
   set numero_normalizado = substr(numero, 4, 7) || substr(numero, 12, 2)
 where length(numero) = 13
   and substr(numero, 3, 1) = '/'
   and substr(numero, 11, 1) = '-';

-- Indice nao-unico de proposito: o nucleo nao colide nos dados de hoje, mas uma
-- colisao futura deve virar uma OS nao reconciliada (tratada como caso ambiguo no
-- codigo), nunca uma falha de importacao no meio do fechamento financeiro.
create index ordens_servico_porto_numero_normalizado_idx
    on ordens_servico_porto(numero_normalizado);
