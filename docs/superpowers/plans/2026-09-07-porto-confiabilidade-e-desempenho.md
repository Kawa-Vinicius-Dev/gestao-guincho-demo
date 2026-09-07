# Confiabilidade e desempenho da importação Porto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** confirmar cada importação Porto no máximo uma vez, mesmo sob cliques/requisições concorrentes, e tornar mensuráveis e rápidas a análise, a confirmação e as consultas mais frequentes.

**Architecture:** a própria `Importacao` será a chave de serialização da confirmação: a transação fará `SELECT ... FOR UPDATE` da prévia antes de examinar o status. A interface terá uma trava síncrona em memória além do botão desabilitado. A otimização substitui buscas por linha e filtros `findAll()` por operações em lote e consultas filtradas; métricas HTTP e marcas no browser separam rede, Spring, banco e renderização sem aumentar timeouts.

**Tech Stack:** Java 21, Spring Boot 4, Spring Data JPA, PostgreSQL, Flyway, React 19, TypeScript, Vitest, Testing Library.

## Global Constraints

- Não aumentar timeout como forma de corrigir lentidão.
- `POST /api/porto/importacoes/{id}/confirmar` deve ser idempotente para chamadas simultâneas e posteriores.
- A prévia não persiste OP, OS, conta a receber ou receita; erro deve ser claro e a UI deve liberar nova tentativa.
- Migrations Flyway são a única forma de alterar o esquema; índices e testes devem funcionar em PostgreSQL e H2 de teste.
- Medir login (`POST /api/auth/login`), dashboard (`GET /api/dashboard` e `GET /api/porto/dashboard`), navegação (marcas de rota React), consultas de OP/OS/financeiro, análise (`POST .../avaliar`) e confirmação (`POST .../confirmar`) antes e depois da otimização.

---

### Task 1: Medir a linha de base e expor tempos por requisição

**Files:**
- Create: `backend/src/main/java/com/anaiv/fluxogestao/config/RequestTimingFilter.java`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `frontend/src/api/http.ts`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoApiIntegrationTest.java`
- Test: `frontend/src/porto/PortoImportacoesPage.test.tsx`

**Interfaces:**
- Produces `Server-Timing: app;dur=<milliseconds>` and `X-Request-Id` on every `/api/**` response.
- Produces `window.performance.measure('api:<METHOD> <path>', startMark, endMark)` for every frontend API call.

- [ ] **Step 1: Add the failing HTTP timing test**

```java
mvc.perform(get("/api/porto/dashboard?periodo=MENSAL").header("Authorization", "Bearer "+login()))
    .andExpect(header().string("Server-Timing", containsString("app;dur=")))
    .andExpect(header().exists("X-Request-Id"));
```

- [ ] **Step 2: Run the focused test to verify the missing contract**

Run: `cd backend; .\mvnw.cmd -Dtest=PortoApiIntegrationTest test`

Expected: FAIL because `Server-Timing` is absent.

- [ ] **Step 3: Implement the filter without logging credentials or bodies**

```java
long inicio=System.nanoTime();
String requestId=UUID.randomUUID().toString();
try { chain.doFilter(request,response); }
finally {
  long duracaoMs=TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-inicio);
  response.setHeader("X-Request-Id",requestId);
  response.setHeader("Server-Timing","app;dur="+duracaoMs);
  logger.info("requestId={} method={} path={} status={} durationMs={}",requestId,
      request.getMethod(),request.getRequestURI(),response.getStatus(),duracaoMs);
}
```

- [ ] **Step 4: Add browser performance marks around `fetch`**

```ts
const metric=`api:${init.method??'GET'} ${path}`
const start=`${metric}:start:${crypto.randomUUID()}`
performance.mark(start)
try { return await fetch(apiUrl(path), options) }
finally { performance.measure(metric,start) }
```

- [ ] **Step 5: Re-run the backend test and use DevTools Performance to record each named user flow**

Run: `cd backend; .\mvnw.cmd -Dtest=PortoApiIntegrationTest test`

Expected: PASS; record median and p95 of login, initial dashboard, route transition, OP/OS/financial query, OP evaluation, OP confirmation and the remaining API calls observed in the browser waterfall in `docs/desenvolvimento.md`, with environment, record count and `X-Request-Id`.

### Task 2: Serialize confirmation and make duplicate submission harmless

**Files:**
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/repository/ImportacaoRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoImportacaoService.java`
- Modify: `frontend/src/pages/PortoImportacoesPage.tsx`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoApiIntegrationTest.java`
- Test: `frontend/src/porto/PortoImportacoesPage.test.tsx`

**Interfaces:**
- Adds `Optional<Importacao> findByIdForUpdate(Long id)`.
- A second confirmation returns the existing confirmation response with zero new records; it never emits a database constraint error.

- [ ] **Step 1: Write a concurrency regression test**

```java
ExecutorService pool=Executors.newFixedThreadPool(2);
List<Future<ResultActions>> chamadas=pool.invokeAll(List.of(
  () -> confirmar(id,token,corpo), () -> confirmar(id,token,corpo)));
for(Future<ResultActions> chamada:chamadas) chamada.get().andExpect(status().isOk());
assertThat(jdbc.queryForObject("select count(*) from ordens_servico_porto where numero='OS-CONC-1'",Integer.class)).isEqualTo(1);
assertThat(jdbc.queryForObject("select count(*) from receitas where ordem_servico_porto_id is not null",Integer.class)).isEqualTo(1);
```

- [ ] **Step 2: Run the test to reproduce the race**

Run: `cd backend; .\mvnw.cmd -Dtest=PortoFluxoFinanceiroApiIntegrationTest test`

Expected: FAIL intermittently or produce a duplicate-key/transaction error before the lock is added.

- [ ] **Step 3: Lock the importation row before reading its status**

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("select i from Importacao i where i.id=:id")
Optional<Importacao> findByIdForUpdate(@Param("id") Long id);

private Importacao obterParaConfirmacao(Long id) {
  return importacoes.findByIdForUpdate(id)
      .orElseThrow(()->new RecursoNaoEncontradoException("Importação Porto não encontrada."));
}
```

Replace the first line of `confirmar` with `Importacao imp=obterParaConfirmacao(id);` and preserve the existing `CONFIRMADA` early return.

- [ ] **Step 4: Make the UI lock immediate, not only state-driven**

```ts
const confirmacaoEmCurso=useRef(false)
async function confirmar(){
  if(confirmacaoEmCurso.current||!previa) return
  confirmacaoEmCurso.current=true; setCarregando(true); setErro('')
  try { /* existing confirmation request */ }
  finally { confirmacaoEmCurso.current=false; setCarregando(false) }
}
```

- [ ] **Step 5: Add the double-click UI test and rerun both suites**

```ts
await user.dblClick(screen.getByRole('button',{name:/confirmar importação/i}))
expect(confirmacao).toHaveBeenCalledTimes(1)
```

Run: `cd frontend; npm test -- PortoImportacoesPage.test.tsx`

Expected: PASS with one HTTP confirmation.

### Task 3: Remove N+1 queries from analysis and financial synchronization

**Files:**
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/repository/OrdemServicoPortoRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/repository/RegistroImportadoPortoRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/repository/ContaReceberRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/repository/ReceitaRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoImportacaoService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoFinanceiroService.java`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoFluxoFinanceiroApiIntegrationTest.java`

**Interfaces:**
- Adds `findByNumeroIn(Collection<String> numeros)`, `findByHashRegistroIn(Collection<String> hashes)`, `findByOrdemServicoPortoIn(Collection<OrdemServicoPorto> oss)` to load all relevant rows before the per-line loop.
- `sincronizarLote(List<OrdemServicoPorto>, OrdemPagamentoPorto, Importacao, CalendarioPagamentoPorto)` returns the same totals as the current per-OS method.

- [ ] **Step 1: Add a 244-OS integration fixture assertion**

```java
confirmar(token,id,"""{"numeroOrdemPagamento":"06422281","calendarioPagamentoId":1}""");
assertThat(jdbc.queryForObject("select count(*) from receitas r join ordens_servico_porto os on r.ordem_servico_porto_id=os.id where os.ordem_pagamento_id=?",Integer.class,opId)).isEqualTo(244);
```

- [ ] **Step 2: Record the pre-refactor `Server-Timing` and PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` for every SQL query that scans OP, OS, receita or conta tables**

Run: `docker compose up -d postgres; cd backend; .\mvnw.cmd -Dspring-boot.run.profiles=local spring-boot:run`

Expected: a written baseline containing duration and query plan; do not apply an index until the plan shows the predicate it serves.

- [ ] **Step 3: Implement set-based preload maps**

```java
Map<String,OrdemServicoPorto> porNumero=oss.findByNumeroIn(numeros).stream()
    .collect(Collectors.toMap(OrdemServicoPorto::getNumero,Function.identity()));
Set<String> processadas=new HashSet<>(registros.findByHashRegistroIn(chaves).stream()
    .map(RegistroImportadoPorto::getHashRegistro).toList());
```

Pass these maps to contextualization and synchronization instead of invoking `findByNumero`, `existsByHashRegistro`, `findByOrdemServicoPorto`, and lookup of Porto/category/vehicle inside each iteration.

- [ ] **Step 4: Add only the indexes validated by Task 3's plans**

Create `backend/src/main/resources/db/migration/common/V12__porto_consultas_em_lote.sql` with indexes such as:

```sql
create index ordens_servico_porto_numero_idx on ordens_servico_porto(numero);
create index registros_importados_porto_hash_idx on registros_importados_porto(hash_registro);
```

Do not duplicate a unique index already present in `V5__modulo_porto.sql`; omit any redundant statement after inspecting `\d` and the query plan.

- [ ] **Step 5: Re-run the fixture and compare the recorded p95**

Run: `cd backend; .\mvnw.cmd -Dtest=PortoFluxoFinanceiroApiIntegrationTest test`

Expected: same rows and totals, lower query count/latency, no timeout changes.

### Task 4: Query the dashboard in the database and improve progress feedback

**Files:**
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/repository/ContaReceberRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/repository/ReceitaRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/repository/DespesaRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/repository/QuilometragemRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/DashboardService.java`
- Modify: `frontend/src/pages/PortoImportacoesPage.tsx`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoDashboardPeriodoApiIntegrationTest.java`
- Test: `frontend/src/porto/PortoImportacoesPage.test.tsx`

**Interfaces:**
- Repository methods accept `inicio`, `fim` and optional filters; they must not call `findAll()` then filter a business dashboard in Java.
- The import screen exposes `role="status"` for `Analisando arquivo`, `Validando número da OP e período`, and `Confirmando importação`; success/error remains visible after completion.

- [ ] **Step 1: Write a dashboard regression test for a Porto receipt dated in the selected month**

```java
mvc.perform(get("/api/dashboard?inicio=2026-08-01&fim=2026-08-31").header("Authorization","Bearer "+token))
  .andExpect(jsonPath("$.receitaRecebida").value(1000.00));
```

- [ ] **Step 2: Replace entity-wide loads with date-filtered repository methods**

```java
List<Receita> findByStatusNotAndDataRecebimentoBetween(StatusReceita status,LocalDate inicio,LocalDate fim);
List<Despesa> findByDataPagamentoBetween(LocalDate inicio,LocalDate fim);
```

Use the correct financial date in each query, preserve `RECEBIDA`/`PAGO` semantics, and batch-load linked vehicle identifiers needed by the response.

- [ ] **Step 3: Render each processing state and an actionable error**

```tsx
{carregando?<span role="status">{previa?'Confirmando importação…':'Analisando arquivo…'}</span>:null}
{erro?<div className="form-alert" role="alert">{erro}<button onClick={()=>void confirmar()}>Tentar novamente</button></div>:null}
```

Only show retry when a valid preview remains; never retry automatically after a mutation request.

- [ ] **Step 4: Run regression checks**

Run: `cd backend; .\mvnw.cmd test; cd ..\frontend; npm test; npm run lint; npm run build`

Expected: all pass, with recorded before/after timings attached to the pull request or release note.
