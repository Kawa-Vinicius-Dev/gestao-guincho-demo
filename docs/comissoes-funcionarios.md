# Comissões dos funcionários

## Fonte do cálculo

A comissão é derivada das ordens de serviço Porto vinculadas ao motorista e marcadas como recebidas dentro de uma OP recebida. O fechamento é o `CalendarioPagamentoPorto` associado à OP; a data do atendimento permanece apenas como referência operacional e não define o período da comissão.

```text
OP recebida + calendário financeiro
  -> OS recebidas e sem duplicidade
  -> produção paga por motorista
  -> comissão bruta = produção paga × 20%
  -> líquido = comissão bruta - alimentação aprovada
```

O cálculo não persiste um total paralelo. Ele pode ser auditado pelas OS, OPs e alimentações exibidas no detalhe. Reprocessar a importação atualiza os lançamentos financeiros identificados pela OS e não cria nova comissão.

## Identificação do funcionário

A importação tenta resolver o motorista primeiro por QRA. Quando não há correspondência, usa igualdade de nome normalizado como fallback somente se houver um único candidato ativo. Casos ausentes ou ambíguos permanecem sem motorista até associação administrativa explícita.

O funcionário autenticado é relacionado ao `Motorista` por `Motorista.usuario`. O registro de alimentação ignora qualquer identificador de motorista vindo do cliente e sempre usa esse vínculo.

## Alimentação

A alimentação é criada como despesa pendente de natureza `ALIMENTACAO_FUNCIONARIO`. Ela aparece separadamente como pendente, mas somente despesas aprovadas reduzem o fechamento oficial. O líquido pode ser negativo.

## Endpoints

- `GET /api/comissoes/periodos`: períodos disponíveis para usuários autenticados.
- `GET /api/minha-comissao?calendarioPagamentoId=`: comissão do funcionário autenticado.
- `POST /api/minha-comissao/alimentacoes`: alimentação do funcionário autenticado.
- `GET /api/comissoes/resumo?calendarioPagamentoId=`: resumo administrativo.
- `GET /api/comissoes/{motoristaId}?calendarioPagamentoId=`: auditoria administrativa.
- `GET /api/equipe/{motoristaId}/detalhes?calendarioPagamentoId=`: ficha administrativa com cadastro, histórico operacional, viaturas utilizadas e a mesma composição oficial de comissão e alimentação.
- `GET /api/comissoes/relatorio.csv?calendarioPagamentoId=`: relatório administrativo.

O detalhe administrativo é restrito a `ADMINISTRADOR`. O histórico do período une, sem duplicar, as OS efetivamente pagas no fechamento selecionado às OS identificadas para o funcionário cuja data de atendimento pertence à competência selecionada. Assim, uma OS executada mas ainda sem OP paga aparece com comissão aguardando pagamento; os 20% continuam vindo somente do cálculo oficial das OS pagas. As viaturas exibidas são as registradas nessas OS, e não um vínculo de “veículo atual”.

## Integração financeira

Antes desta correção, o backend já registrava receitas Porto, mas o dashboard React lia o `DemoContext`/`localStorage`; além disso, o período era inferido pelas datas antigas de atendimento das OS. A integração agora usa exclusivamente o endpoint financeiro real e o calendário selecionado para a OP.

Ao confirmar uma composição de OP paga, o período financeiro precisa estar associado à OP ou ser informado pelo administrador. Cada OS válida sincroniza a mesma `ContaReceber` e a mesma `Receita` pelos vínculos Porto existentes, com status recebido e data financeira do calendário. O dashboard e a DRE consomem `/api/dashboard`, portanto usam a data de recebimento e não a data antiga do atendimento.

Receitas manuais podem ser editadas e excluídas por administradores. Receitas vinculadas a conta a receber, importação, OP ou OS Porto são protegidas no backend e não oferecem essas ações na interface.
