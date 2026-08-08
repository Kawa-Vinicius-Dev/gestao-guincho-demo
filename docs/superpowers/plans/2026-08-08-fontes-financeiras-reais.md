# Fontes Financeiras Reais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o estado demo das rotas de produção e fazer dashboard, DRE, extrato, frota, quilometragem e comissões refletirem somente PostgreSQL/API.

**Architecture:** O backend continua com `Receita`, `Despesa`, `Veiculo` e `Quilometragem` como fontes canônicas. Um DTO de leitura agrega receitas e despesas sem criar tabela paralela; uma nova entidade registra pagamentos líquidos de comissão e referencia a despesa real criada. O frontend refaz consultas ao montar cada rota e após mutações.

**Tech Stack:** Spring Boot 4, JPA, Flyway, PostgreSQL/H2, React 19, React Router, Vitest/MSW.

## Global Constraints

- Não limpar novamente nenhum banco.
- Não alterar migrations antigas; usar somente migration nova.
- Não misturar previsão com realizado.
- Comissão calculada pode ser negativa, mas pagamento/despesa somente existe para líquido positivo.
- Não incluir no commit as alterações existentes em `salary-java/` e `exemplodidatico/`.
- Não usar force push.

---

### Task 1: Testes de regressão das fontes reais

**Files:**
- Create: `frontend/src/financeiro/FontesReaisPage.test.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/test/servidor.ts`

- [ ] Escrever teste com `gestao-guincho:demo:v4` preenchido e APIs vazias.
- [ ] Verificar que `/despesas`, `/lancamentos`, `/veiculos` e `/quilometragem` consultam a API e não exibem os valores demo.
- [ ] Executar os testes direcionados e registrar o RED antes da implementação.

### Task 2: Extrato financeiro real e regras de realizado/previsto

**Files:**
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/FinanceiroDtos.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/FinanceiroService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/controller/FinanceiroController.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/Despesa.java`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/financeiro/FluxoFinanceiroApiIntegrationTest.java`

- [ ] Testar `/api/lancamentos` e os exemplos recebida/paga versus prevista/pendente.
- [ ] Implementar agregação de leitura e ação administrativa de pagamento de despesa.
- [ ] Executar o teste direcionado até GREEN.

### Task 3: Pagamento auditável e idempotente de comissão

**Files:**
- Create: `backend/src/main/resources/db/migration/common/V11__pagamentos_comissao.sql`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/entity/PagamentoComissao.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/repository/PagamentoComissaoRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/ComissaoDtos.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/ComissaoService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/controller/ComissaoController.java`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/comissao/ComissaoApiIntegrationTest.java`

- [ ] Testar autorização, líquido pago, alimentação sem duplicidade, negativo sem despesa e repetição idempotente.
- [ ] Persistir pagamento único por funcionário/período e criar uma despesa aprovada/paga somente pelo líquido positivo.
- [ ] Expor estado do pagamento nos DTOs e executar o teste direcionado até GREEN.

### Task 4: Migrar rotas React e remover exposição demo

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Rewrite: `frontend/src/pages/LancamentosPage.tsx`
- Rewrite: `frontend/src/pages/FrotasPage.tsx`
- Rewrite: `frontend/src/pages/QuilometragemPage.tsx`
- Modify: `frontend/src/pages/DespesasPage.tsx`
- Modify: `frontend/src/pages/ComissoesPage.tsx`
- Modify: `frontend/src/api/comissoes.ts`
- Modify: `frontend/src/types/modelos.ts`
- Create: `frontend/src/legacyStorage.ts`

- [ ] Apontar `/despesas` e `/contas-receber` para páginas reais e `/fluxo-caixa` para `FluxoCaixaPage`.
- [ ] Remover `DemoProvider` e desabilitar rotas demo sem backend real.
- [ ] Fazer lançamentos, veículos e quilometragem usarem apenas endpoints reais e recarregarem após mutação.
- [ ] Remover somente as chaves `gestao-guincho:demo:v1` a `v4` e atualizar a identificação do produto.
- [ ] Executar os testes frontend direcionados até GREEN.

### Task 5: Verificação, integração e produção

**Files:**
- Review: all modified files

- [ ] Rodar `./mvnw test` e `./mvnw package` em `backend`.
- [ ] Rodar `npm test`, `npm run lint` e `npm run build` em `frontend`.
- [ ] Rodar `git diff --check` e revisar `useDemo`/`DemoContext` nas rotas expostas.
- [ ] Comitar somente os arquivos desta implementação na `main` e fazer push normal.
- [ ] Verificar deployment Railway `SUCCESS` e fazer smoke test somente de leitura na produção.
