# Confirmação da importação Porto por número da OP

## Objetivo

Substituir, exclusivamente na confirmação de `/porto/importacoes`, a escolha de uma OP previamente cadastrada pela digitação obrigatória do número da OP e pela seleção obrigatória do período financeiro. O arquivo confirmado representa uma OP paga e deve alimentar o fluxo financeiro real sem duplicar registros.

## Decisões aprovadas

- A prévia é calculada pelo backend e não grava dados.
- A confirmação revalida a prévia e executa todas as alterações em uma única transação.
- Uma OP inexistente é criada automaticamente; uma OP existente é reutilizada pelo número normalizado.
- O valor de uma OP existente nunca é alterado silenciosamente. Se o valor atual divergir da soma do arquivo, a interface mostra os dois valores e a diferença e exige confirmação explícita.
- Depois da confirmação explícita, a composição da OP é recalculada e o financeiro é sincronizado.
- Uma OS já vinculada a outra OP nunca é reassociada silenciosamente. A prévia lista número da OS, OP atual e nova OP, além de quantidade e valor total a mover, e exige confirmação explícita.
- Após uma reassociação, a OP de destino e cada OP de origem afetada são recalculadas.
- A reimportação deve atualizar os registros ligados à mesma OS, sem criar outra OP, OS, receita, conta a receber ou comissão.

## Interface administrativa

O seletor `Selecione a OP` será removido da confirmação da importação e substituído por um campo de texto `Número da OP`. O valor será tratado como identificador textual obrigatório, removendo espaços nas extremidades, sem exigir ou armazenar URL da Porto.

O botão `Confirmar importação` ficará habilitado somente quando número da OP e período financeiro estiverem preenchidos. Se a prévia apontar divergência financeira ou reassociação, as confirmações explícitas correspondentes também serão necessárias antes da gravação.

Ao alterar o número ou o período, qualquer prévia e autorização anteriores serão invalidadas. A nova prévia mostrará:

- se a OP será criada ou reutilizada;
- valor atual da OP, quando existente;
- soma das linhas únicas do arquivo;
- diferença entre valor atual e soma do arquivo;
- cada OS que pertence a outra OP, com OP atual e nova OP;
- quantidade e valor total das OS que serão movidas.

## Contrato da API

A prévia da importação aceitará `numeroOrdemPagamento` e classificará as linhas usando o número como destino, inclusive quando a OP ainda não existir. A resposta será ampliada com os dados financeiros e de reassociação necessários à tela. A prévia não criará OP nem modificará OS.

A confirmação aceitará:

- `numeroOrdemPagamento`;
- `calendarioPagamentoId`;
- autorização explícita para divergência de valor, acompanhada da justificativa já exigida pelo domínio;
- autorização explícita para reassociações identificadas pela prévia.

O endpoint continuará aceitando o identificador interno da OP nos fluxos administrativos existentes que ainda dependem dele, evitando mudanças fora da importação por arquivo.

## Confirmação transacional

Dentro da mesma transação, o backend deverá:

1. normalizar e validar número e período;
2. recalcular a soma de linhas únicas e as reassociações com o estado atual do banco;
3. rejeitar a operação se alguma divergência ainda não tiver autorização explícita;
4. criar a OP pelo número, se ausente, ou reutilizar a existente;
5. persistir ou atualizar todas as OS do arquivo e vinculá-las à OP de destino;
6. recalcular o valor da OP de destino pela composição resultante;
7. recalcular cada OP de origem que perdeu OS;
8. sincronizar cada OS afetada por meio do `PortoFinanceiroService`, usando a data de atendimento como competência e a data de pagamento do calendário como recebimento;
9. atualizar o recebimento das OPs e concluir a importação.

As contas a receber e receitas continuarão únicas por OS. Ao mover uma OS, seus registros existentes serão atualizados para a nova OP e novo período, em vez de recriados. As comissões continuarão derivadas das OS efetivamente recebidas pela regra oficial, sem uma segunda fonte de cálculo.

O valor final da OP de destino será a soma da composição efetivamente vinculada após a importação. Cada OP de origem terá `valorTotal` e `valorRecebido` recalculados pela soma das OS que permanecerem vinculadas; se não restar nenhuma OS, esses totais serão zero. Os lançamentos das OS remanescentes conservarão seus vínculos e datas, enquanto apenas os lançamentos das OS movidas serão apontados para a nova OP e para o período selecionado.

## Idempotência e concorrência

O número único da OP determina criação ou reutilização. A OS é localizada por seu número, e `ContaReceber` e `Receita` são localizadas por sua relação única com a OS. A confirmação sempre recalcula a situação dentro da transação; portanto, uma prévia obsoleta não autoriza automaticamente uma divergência nova.

Uma reimportação idêntica deve manter as mesmas quantidades de OPs, OS, contas e receitas, atualizando apenas os dados derivados quando necessário.

Não haverá migration, nova tabela, fonte paralela de comissão nem alteração nos cálculos dos dashboards. A mudança reutilizará as entidades e serviços financeiros existentes.

## Tratamento de erros

- Número vazio ou período ausente: requisição inválida e nenhuma gravação.
- Divergência financeira sem autorização/justificativa: resposta de validação contendo valor atual, soma e diferença.
- Reassociação sem autorização: resposta de validação contendo a lista completa das OS afetadas e seus totais.
- Falha durante persistência ou sincronização financeira: rollback integral.

## Testes

O backend deverá cobrir OP nova, reutilização de OP existente, divergência de valor, reassociação, recálculo das duas OPs, sincronização de dashboards e finanças, e reimportação idempotente. O frontend deverá cobrir campo obrigatório, período obrigatório, prévia, apresentação das divergências, confirmações explícitas, payload por número e ausência de URL.

Ao final serão executados todos os testes e builds do backend e frontend, lint e `git diff --check`.
