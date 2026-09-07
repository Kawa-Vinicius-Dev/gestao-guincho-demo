# Financeiro, períodos Porto e lançamentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fazer os dashboards Financeiro e Porto iniciarem no mês atual, aceitar apenas dia/quinzena/mês, resolver quinzena pelo calendário financeiro real e oferecer edição/exclusão segura de lançamentos manuais.

**Architecture:** período financeiro Porto será uma resolução do `CalendarioPagamentoPorto`, não um corte de dias do mês. A API recebe uma referência e encontra o ciclo cujo intervalo de competência a contém; se nenhum ciclo a contém, responde com instrução para configurar o calendário. Consultas financeiras usam data de recebimento/pagamento e dashboards consomem as mesmas fontes persistidas. Registros importados Porto continuam imutáveis pelas telas de lançamento.

**Tech Stack:** Spring Boot, JPA, Flyway, PostgreSQL, React, TypeScript, Vitest.

## Global Constraints

- Remover o filtro semanal do Dashboard Porto e de qualquer novo dashboard financeiro.
- Quinzena não pode ser calculada por `1–15`/`16–fim`; o calendário Porto é a fonte da competência e do pagamento.
- A tela abre no mês corrente; usuário pode escolher outro mês ou ciclo.
- Alterar/excluir exige confirmação explícita; somente lançamento manual pode ser removido.
- Dados Porto importados devem atualizar caixa, indicadores, DRE e relatórios no período financeiro da OP, sem contar previsão como recebido.

---

### Task 1: Resolve quinzenas pelo calendário configurado

**Files:**
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/repository/CalendarioPagamentoPortoRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/CalendarioPortoService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoDashboardService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/PortoDtos.java`
- Modify: `frontend/src/pages/PortoDashboardPage.tsx`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoDashboardPeriodoApiIntegrationTest.java`
- Test: `frontend/src/porto/PortoDashboard.test.tsx`

**Interfaces:**
- `Optional<CalendarioPagamentoPorto> findFirstByCompetenciaInicioLessThanEqualAndCompetenciaFimGreaterThanEqualAndAtivoTrue(LocalDate referencia,LocalDate referencia)`.
- `GET /api/porto/dashboard?periodo=QUINZENAL&referencia=2026-08-20` uses that calendar's `competenciaInicio`/`competenciaFim` and returns them in `periodoInicio`/`periodoFim`.

- [ ] **Step 1: Replace the existing 1–15 boundary test with an irregular real-cycle test**

```java
criarCalendario("2026-08-05","2026-08-19","2026-09-02","Ciclo Porto 05–19");
mvc.perform(get("/api/porto/dashboard?periodo=QUINZENAL&referencia=2026-08-18").header("Authorization","Bearer "+token))
  .andExpect(jsonPath("$.periodoInicio").value("2026-08-05"))
  .andExpect(jsonPath("$.periodoFim").value("2026-08-19"));
```

- [ ] **Step 2: Run the focused test**

Run: `cd backend; .\mvnw.cmd -Dtest=PortoDashboardPeriodoApiIntegrationTest test`

Expected: FAIL because `PortoDashboardService.intervalo` still splits the month by day 15.

- [ ] **Step 3: Implement resolver and explicit missing-calendar response**

```java
CalendarioPagamentoPorto ciclo=calendario.encontrarPorCompetencia(referencia)
  .orElseThrow(()->new IllegalArgumentException("Não há ciclo financeiro Porto configurado para "+referencia+"."));
return new Intervalo(ciclo.getCompetenciaInicio(),ciclo.getCompetenciaFim());
```

- [ ] **Step 4: Remove weekly UI/API option and render selected cycle label**

```tsx
<option value="DIARIO">Dia</option><option value="QUINZENAL">Quinzena</option><option value="MENSAL">Mês</option>
```

Keep `PERSONALIZADO` only if product retains it; otherwise remove it from both contract and screen in this task.

- [ ] **Step 5: Re-run backend and UI tests**

Run: `cd backend; .\mvnw.cmd -Dtest=PortoDashboardPeriodoApiIntegrationTest test; cd ..\frontend; npm test -- PortoDashboard.test.tsx`

Expected: PASS with no weekly selector and an irregular configured cycle.

### Task 2: Make financial and Porto dashboards use the current period and official data

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/pages/PortoDashboardPage.tsx`
- Modify: `frontend/src/pages/LancamentosPage.tsx`
- Modify: `frontend/src/pages/ReceitasPage.tsx`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/DashboardService.java`
- Test: `frontend/src/porto/PortoFinanceiroIntegration.test.tsx`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoFluxoFinanceiroApiIntegrationTest.java`

**Interfaces:**
- Frontend computes `YYYY-MM` with local date parts, not `toISOString()` (which can choose the previous UTC day in Brazil).
- Dashboard request always carries first/last local day of the currently displayed month.

- [ ] **Step 1: Write an integration test that imports an OP and reads it in both dashboards during its payment cycle**

```java
confirmar(token,importacao,"""{"numeroOrdemPagamento":"OP-SET","calendarioPagamentoId":cicloSetembro}""");
mvc.perform(get("/api/dashboard?inicio=2026-09-01&fim=2026-09-30").header("Authorization","Bearer "+token))
  .andExpect(jsonPath("$.receitaRecebida").value(350.00));
```

- [ ] **Step 2: Build local date helpers**

```ts
export const hojeLocal=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export const mesAtualLocal=()=>hojeLocal().slice(0,7)
```

Use them in the four pages named above and retain their existing month picker behavior.

- [ ] **Step 3: Validate the data pipeline when a card is zero**

```text
API response has receipts? -> query/date filter wrong if UI zero
API response zero but receitas table has payment-cycle rows? -> dashboard query wrong
No rows in receitas/contas for confirmed OP? -> import financial synchronization wrong
```

Add this as a test matrix to `docs/porto-fluxo-ops-e-pagamentos.md`, with one endpoint/query assertion per row; do not label a zero card as a frontend bug without the three checks.

- [ ] **Step 4: Run end-to-end financial regression**

Run: `cd backend; .\mvnw.cmd -Dtest=PortoFluxoFinanceiroApiIntegrationTest test; cd ..\frontend; npm test -- PortoFinanceiroIntegration.test.tsx`

Expected: PASS; imported OP values appear in the correct payment month and not in a historical service month.

### Task 3: Complete safe edit/delete actions for manual entries and audit cost per km

**Files:**
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/controller/FinanceiroController.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/FinanceiroService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/Despesa.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/EnumsFinanceiros.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/QuilometragemService.java`
- Modify: `frontend/src/pages/LancamentosPage.tsx`
- Modify: `frontend/src/pages/ReceitasPage.tsx`
- Modify: `docs/regras-de-negocio.md`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/financeiro/ReceitaManualApiIntegrationTest.java`
- Test: `frontend/src/financeiro/ReceitasPage.test.tsx`

**Interfaces:**
- Keep existing `PUT /api/receitas/{id}` and `DELETE /api/receitas/{id}`; add `PUT /api/despesas/{id}` and `DELETE /api/despesas/{id}` for `origem_lancamento=MANUAL` only.
- `Quilometragem` stores the `custoPorKm` snapshot used in `custoKmMorto`; changing a vehicle default must not silently rewrite history.

- [ ] **Step 1: Add assertions that imported revenue cannot be deleted and manual revenue requires confirmation in the UI**

```java
mvc.perform(delete("/api/receitas/{id}",receitaPortoId).header("Authorization","Bearer "+token))
  .andExpect(status().isBadRequest());
```

```ts
await user.click(screen.getByRole('button',{name:/excluir/i}))
expect(screen.getByRole('dialog',{name:/excluir receita/i})).toBeInTheDocument()
```

- [ ] **Step 2: Audit existing cost-per-km behavior before changing formulas**

```sql
select q.id,q.data_registro,v.identificacao,q.km_morto,q.custo_por_km,q.custo_km_morto
from quilometragens q join veiculos v on v.id=q.veiculo_id order by q.data_registro desc;
```

Document the observed storage (`veiculos.custo_por_km`, snapshot in `quilometragens`), use (`QuilometragemService.criar`) and formula (`km_morto * custo_por_km`) in `docs/regras-de-negocio.md`.

- [ ] **Step 3: Add edit/delete paths for expenses tagged as manual**

Create `V14__origem_lancamento_despesas.sql`:

```sql
alter table despesas add column origem_lancamento text not null default 'MANUAL';
alter table despesas add constraint despesas_origem_lancamento_ck check (origem_lancamento in ('MANUAL','ALIMENTACAO_FUNCIONARIO','COMISSAO'));
update despesas set origem_lancamento='ALIMENTACAO_FUNCIONARIO' where natureza='ALIMENTACAO_FUNCIONARIO';
```

Tag the expense created by commission payment as `COMISSAO`, and reject both imported/system origins in the update/delete service methods:

```java
if(despesa.getOrigemLancamento()!=OrigemLancamento.MANUAL)
  throw new IllegalArgumentException("Somente lançamentos manuais podem ser alterados ou excluídos.");
```

For every added destructive endpoint, require an explicit UI modal with item description/value and test that Cancel makes no request.

- [ ] **Step 4: Run complete verification**

Run: `cd backend; .\mvnw.cmd test; cd ..\frontend; npm test; npm run lint; npm run build; git diff --check`

Expected: PASS; formulas remain unchanged until their audit is approved, while existing manual revenue edit/delete stays protected and tested.
