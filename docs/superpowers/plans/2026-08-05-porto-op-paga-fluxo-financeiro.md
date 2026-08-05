# Fluxo financeiro de OP paga Porto — plano de implementação

**Objetivo:** fazer a confirmação de `OS_VINCULADAS` representar receita recebida por OS, usando competência do atendimento e recebimento do calendário Porto, sem alterar `SERVICOS_AGUARDANDO_LANCAMENTO`.

**Arquitetura:** manter `PortoImportacaoService` como transação e orquestrador, concentrar a sincronização idempotente em um serviço financeiro Porto, persistir vínculos explícitos por OS/OP/importação e deixar dashboard/DRE consumirem as entidades financeiras existentes.

## 1. Especificar calendário e persistência com TDD

- Alterar testes Porto em `backend/src/test/java/com/anaiv/fluxogestao/porto/` para cobrir as duas quinzenas, ausência de período e vínculos financeiros.
- Criar `backend/src/main/resources/db/migration/common/V9__porto_fluxo_financeiro.sql` com período de competência no calendário, FKs, índices e unicidade por OS em contas/receitas.
- Alterar entidades, DTOs e repositories de calendário, `ContaReceber` e `Receita`.
- Rodar: `cd backend; ./mvnw -Dtest=PortoFluxoFinanceiroApiIntegrationTest test` (deve falhar antes e passar depois).

## 2. Implementar sincronização financeira transacional

- Criar `backend/src/main/java/com/anaiv/fluxogestao/service/PortoFinanceiroService.java`.
- Alterar `PortoImportacaoService`, `PortoService`, `OrdemPagamentoPorto` e `OrdemServicoPorto` para validar todos os períodos antes de gravar, criar/atualizar uma conta e uma receita por OS e marcar OP/OS recebidas.
- Preservar campos preenchidos e impedir receita total adicional por OP.
- Testar criação, atualização, soma, datas distintas, idempotência e rollback.

## 3. Adicionar backfill protegido e efeitos nos indicadores

- Adicionar ação administrativa autenticada no `PortoController` para completar apenas importações confirmadas de `OS_VINCULADAS`.
- Ajustar somente os filtros financeiros necessários em `DashboardService`/relatórios para separar competência de recebimento e incluir motorista disponível.
- Testar backfill idempotente, dashboard, DRE, relatórios e ausência de finanças em `SERVICOS_AGUARDANDO_LANCAMENTO`.

## 4. Atualizar a experiência de confirmação

- Alterar `frontend/src/api/porto.ts`, tipos e a página/testes de importação Porto para exibir OS/receitas criadas e atualizadas, total recebido, período, data de pagamento, ignorados/erros e recarregar os dados após sucesso.
- Não exibir sucesso quando a API rejeitar a transação.
- Rodar testes focados do frontend.

## 5. Verificar, documentar e entregar

- Atualizar `docs/porto-fluxo-ops-e-pagamentos.md` com a regra de OP paga e backfill.
- Rodar `backend/./mvnw test`, `backend/./mvnw package`, `frontend/npm test`, `frontend/npm run lint`, `frontend/npm run build`, `git diff --check`.
- Criar um único commit `feat: integra importação Porto ao fluxo financeiro`, integrar por fast-forward na `main` somente com árvore limpa e enviar `main` sem force-push.

