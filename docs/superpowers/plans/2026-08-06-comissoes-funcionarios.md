# Plano curto — comissões dos funcionários

**Objetivo:** integrar comissões e alimentação ao pagamento real das OPs Porto, corrigir a Visão Geral e permitir manutenção segura de receitas manuais, preservando o monólito Spring/React atual.

## 1. Fixar os contratos com testes de integração (RED)

- Criar `backend/src/test/java/com/anaiv/fluxogestao/comissao/ComissaoApiIntegrationTest.java` para período financeiro explícito, OS antigas, múltiplas OPs, 20%, alimentação própria/aprovada, saldo negativo, autorização, vínculo por QRA/nome e idempotência.
- Ajustar `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoFluxoFinanceiroApiIntegrationTest.java` para reproduzir o bug da Visão Geral, exigir ciclo da OP em vez da data das OS e provar que programado não entra no caixa.
- Criar `backend/src/test/java/com/anaiv/fluxogestao/financeiro/ReceitaManualApiIntegrationTest.java` para edição/exclusão, recálculo e bloqueio de receita Porto.
- Criar/ajustar testes React em `frontend/src/comissao/ComissoesPage.test.tsx`, `frontend/src/financeiro/ReceitasPage.test.tsx`, `frontend/src/porto/PortoImportacoesPage.test.tsx` e `frontend/src/porto/PortoFinanceiroIntegration.test.tsx`.
- Executar testes focados e confirmar as falhas antes da implementação.

## 2. Corrigir período financeiro e vínculo auditável da OS

- Criar `backend/src/main/resources/db/migration/common/V10__comissoes_funcionarios.sql` com `ordens_servico_porto.motorista_id`, `motoristas.qra`, natureza de despesa e índices/FKs necessários, sem alterar migrations anteriores.
- Alterar `CalendarioPortoService`, `PortoFinanceiroService`, `PortoImportacaoService`, `PortoService`, entidades `Motorista`, `OrdemServicoPorto`, `Despesa`, repositories e DTOs Porto/Cadastro.
- A confirmação usará o calendário já associado à OP ou `calendarioPagamentoId` informado pelo administrador; datas de atendimento não definirão nem bloquearão o ciclo financeiro.
- Resolver motorista por QRA único e, como fallback, nome normalizado único; casos ambíguos permanecerão sem vínculo e poderão ser associados por endpoint administrativo.
- Rodar os testes focados até GREEN.

## 3. Implementar cálculo derivado, alimentação e relatório

- Criar `ComissaoService`, `ComissaoController` e `ComissaoDtos`, usando OP recebida + calendário + OS única como fonte da comissão, sem persistir total calculado.
- Adicionar queries em `OrdemServicoPortoRepository`, `DespesaRepository`, `MotoristaRepository` e `CalendarioPagamentoPortoRepository`.
- Criar endpoints autenticados para períodos, visão própria, resumo administrativo, associação pendente de OS, alimentação própria e CSV de comissões; funcionário nunca envia o proprietário do lançamento.
- Reutilizar a aprovação existente: alimentação pendente aparece, mas somente aprovada compõe o fechamento oficial.
- Rodar testes de comissão e autorização até GREEN.

## 4. Corrigir financeiro principal e receitas manuais

- Alterar `Receita`, `FinanceiroService`, `FinanceiroController` e `FinanceiroDtos` para expor origem rastreável, editar e excluir apenas receitas manuais por endpoints administrativos.
- Atualizar `frontend/src/pages/ReceitasPage.tsx`, `frontend/src/api/http.ts`, `frontend/src/types/modelos.ts` e a rota `/receitas` para editar no mesmo modal, confirmar exclusão em duas etapas e recarregar os dados dependentes.
- Alterar `frontend/src/pages/DashboardPage.tsx` para usar `/api/dashboard` nos indicadores financeiros reais; manter apenas apoios operacionais da demo onde ainda não existe API equivalente.
- Provar por API e tela que uma OP paga soma no recebimento pela data financeira, reprocessamento não duplica e OP programada não altera caixa.

## 5. Entregar telas de comissão e ação sticky da importação

- Criar `frontend/src/api/comissoes.ts`, `frontend/src/pages/MinhaComissaoPage.tsx` e `frontend/src/pages/ComissoesPage.tsx`; atualizar `App.tsx`, `Layout.tsx`, `types/modelos.ts` e `styles.css`.
- Alterar `frontend/src/pages/PortoImportacoesPage.tsx` e `frontend/src/api/porto.ts` para selecionar calendário financeiro e exibir barra sticky no topo da prévia com OP, período, totais, cancelar e confirmar, responsiva no mobile.
- Manter erros/divergências bloqueando confirmação e preservar a tabela para auditoria; usar `content-visibility` nas linhas longas.
- Rodar os testes React focados até GREEN.

## 6. Documentar e verificar a entrega completa

- Atualizar `docs/porto-fluxo-ops-e-pagamentos.md`, `docs/regras-de-negocio.md` e `docs/arquitetura.md` com período da OP, cálculo derivado, segurança da alimentação e causa raiz da Visão Geral.
- Executar `backend/.\mvnw.cmd test` e `backend/.\mvnw.cmd package`.
- Executar `frontend/npm test -- --run`, `frontend/npm run lint` e `frontend/npm run build`.
- Executar `git diff --check`, `git status --short --branch` e revisar `git diff --stat`; não fazer push nem alterar stashes.
