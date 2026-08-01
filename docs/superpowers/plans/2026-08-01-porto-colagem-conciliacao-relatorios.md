# Porto: Colagem, Conciliação, Quantificação e Relatórios - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o fluxo Porto baseado em dados persistidos, com colagem tabulada, OPs contabilizadas uma vez por número, conciliação OP a OP, filtros e exportações gerenciais em XLSX/PDF.

**Architecture:** O backend Spring Boot permanece como fonte da verdade e expõe APIs administrativas autenticadas para prévia, confirmação, consultas e downloads. JPA/Flyway guardam estados operacionais e financeiros separados; métricas e conciliação são calculadas a partir de OPs e OS persistidas. O React consome exclusivamente essas APIs, sem `DemoContext` ou armazenamento local para dados Porto.

**Tech Stack:** Java 21, Spring Boot, Spring Security, JPA, Flyway, H2/PostgreSQL, PDFBox, Apache POI OOXML, React, TypeScript, Vitest, Testing Library e MSW.

## Global Constraints

- Branch local: `feat/porto-colagem-conciliacao-relatorios`.
- Não usar subagentes, dados reais, banco cloud, scraping ou integração automática com a Porto.
- Não fazer merge, push ou deploy.
- Não registrar conteúdo colado, nomes, QRA ou token em logs.
- Usar TDD por limites públicos: MockMvc/H2, arquivos reabertos e comportamento React/MSW.
- OP é única por número; OS é única por número; OS vinculada nunca aumenta a quantidade de OPs.
- Realizado, programado e recebido permanecem grandezas separadas e não alteram automaticamente a DRE.

---

### Task 1: Evoluir o domínio Porto e a persistência

**Files:**
- Create: `backend/src/main/resources/db/migration/common/V6__conciliacao_relatorios_porto.sql`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/entity/JustificativaConciliacaoPorto.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/repository/JustificativaConciliacaoPortoRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/EnumsFinanceiros.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/OrdemServicoPorto.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/PendenciaFinanceiraPorto.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/repository/OrdemPagamentoPortoRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/repository/OrdemServicoPortoRepository.java`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoApiIntegrationTest.java`

**Interfaces:**
- Produces: `StatusOperacionalPorto`, `StatusFinanceiroPorto`, `StatusConciliacaoPorto`, `TipoRelatorioPorto.SERVICOS_GERAIS`; campos de origem/data/status/devolução em OS; justificativas auditáveis.

- [ ] **Step 1: Write the failing migration/domain tests**

Adicionar teste MockMvc/H2 que exige V6, estados separados e devolução finalizada sem pendência aberta.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw -Dtest=PortoApiIntegrationTest test`

- [ ] **Step 3: Write minimal migration and entities**

Adicionar colunas `status_operacional`, `status_financeiro`, `origem_importacao`, `data_importacao`, `data_devolucao`, `data_finalizacao_devolucao`; criar `justificativas_conciliacao_porto`; manter FKs sem cascata destrutiva.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./mvnw -Dtest=PortoApiIntegrationTest test`

- [ ] **Step 5: Commit**

```bash
git add backend/src/main backend/src/test
git commit -m "feat: evolui dominio financeiro Porto"
```

### Task 2: Importar colagem e quantificar OPs de forma idempotente

**Files:**
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoCsvParser.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoImportacaoService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/controller/PortoController.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/PortoDtos.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/PortoImportacaoDtos.java`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoCsvParserTest.java`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoApiIntegrationTest.java`

**Interfaces:**
- Consumes: estados da Task 1.
- Produces: `POST /api/porto/importacoes/previa-conteudo` com `{conteudo}`; prévia com `linhasAnalisadas`, `opsUnicas`, `novas`, `atualizadas`, `existentes`, `duplicidades`, `errosQuantidade`, `valorTotal`; confirmação com contagens novas/atualizadas/ignoradas.

- [ ] **Step 1: Write failing parser and API tests**

Cobrir texto tabulado, BOM/aspas, data com hora, opcionais vazios, formato incompatível, nenhuma persistência antes da confirmação, bloqueio atômico por erro, retomada/cancelamento, reimportação, atualização sem apagar campo e OP duplicada no arquivo.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./mvnw -Dtest=PortoCsvParserTest,PortoApiIntegrationTest test`

- [ ] **Step 3: Implement one vertical slice at a time**

Normalizar o hash do conteúdo, aceitar `.txt/.csv`, classificar `SERVICOS_GERAIS`, contextualizar linhas como `IMPORTAR`, `ATUALIZAR`, `IGNORAR`, `DIVERGENCIA` ou `ERRO`, e persistir somente na confirmação transacional.

- [ ] **Step 4: Run tests after each slice**

Run: `cd backend && ./mvnw -Dtest=PortoCsvParserTest,PortoApiIntegrationTest test`

- [ ] **Step 5: Commit**

```bash
git add backend/src/main backend/src/test
git commit -m "feat: adiciona importacao Porto por colagem"
```

### Task 3: Calcular conciliação, filtros, detalhes e dashboard

**Files:**
- Create: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoConsultaService.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/dto/PortoConsultaDtos.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/controller/PortoController.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/OrdemPagamentoPorto.java`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoConsultaApiIntegrationTest.java`

**Interfaces:**
- Produces: `GET /api/porto/dashboard`, `GET /api/porto/ordens-pagamento`, `GET /api/porto/ordens-pagamento/{id}`, `GET /api/porto/ordens-servico`, `POST /api/porto/ordens-pagamento/{id}/justificativas`.
- Produces: `PortoFiltros`, `ResumoOrdensPagamento`, `DashboardPortoResponse`, `DetalheOrdemPagamentoResponse`.

- [ ] **Step 1: Write failing query API tests**

Usar exemplo literal de 2 OPs e várias OS para provar contagem única, sem composição, conciliada, abaixo, acima, tolerância de R$ 0,01, recebida divergente, vencida, valor médio sem divisão por zero e recálculo por filtros.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw -Dtest=PortoConsultaApiIntegrationTest test`

- [ ] **Step 3: Implement query service and endpoints**

Calcular `diferencaComposicao = valorPrevisto - somaServicos` OP a OP; derivar status com tolerância `0.01`; aplicar o mesmo predicado de filtros à lista, resumo, dashboard e detalhes.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./mvnw -Dtest=PortoConsultaApiIntegrationTest test`

- [ ] **Step 5: Commit**

```bash
git add backend/src/main backend/src/test
git commit -m "feat: adiciona conciliacao e indicadores Porto"
```

### Task 4: Gerar XLSX e PDF autenticados a partir dos dados persistidos

**Files:**
- Modify: `backend/pom.xml`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoRelatorioService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/controller/PortoController.java`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoRelatorioApiIntegrationTest.java`

**Interfaces:**
- Consumes: filtros e respostas calculadas da Task 3.
- Produces: `GET /api/porto/relatorios.xlsx` e `GET /api/porto/relatorios.pdf`, ambos com os mesmos query params de `PortoFiltros`.

- [ ] **Step 1: Verify dependency decision**

Manter PDFBox existente para PDF; adicionar somente Apache POI OOXML para XLSX, documentando versão/licença Apache-2.0.

- [ ] **Step 2: Write failing export tests**

Reabrir o XLSX com POI e exigir sete abas, uma linha por OP, OS na aba de serviços, datas/números tipados, filtros/freeze pane e neutralização de `= + - @`; reabrir/extrair o PDF com PDFBox e exigir indicadores filtrados e quantidade correta de OP/OS.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && ./mvnw -Dtest=PortoRelatorioApiIntegrationTest test`

- [ ] **Step 4: Implement exports and rerun**

Criar workbook profissional com `Resumo`, `Todos os Serviços`, `Previsões e OPs`, `Serviços Pendentes`, `Serviços Devolvidos`, `Por Socorrista`, `Por Especialidade`; criar PDF A4 resumido sem listar centenas de OS.

- [ ] **Step 5: Commit**

```bash
git add backend/pom.xml backend/src/main backend/src/test
git commit -m "feat: adiciona relatorios Excel e PDF Porto"
```

### Task 5: Integrar colagem, filtros, cards, detalhes e downloads no React

**Files:**
- Modify: `frontend/src/api/porto.ts`
- Modify: `frontend/src/types/modelos.ts`
- Modify: `frontend/src/pages/PortoImportacoesPage.tsx`
- Modify: `frontend/src/pages/PortoOrdensPagamentoPage.tsx`
- Modify: `frontend/src/pages/PortoOrdensServicoPage.tsx`
- Modify: `frontend/src/pages/PortoPendenciasPage.tsx`
- Create: `frontend/src/pages/PortoDashboardPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/test/servidor.ts`
- Test: `frontend/src/porto/PortoImportacoesPage.test.tsx`
- Test: `frontend/src/porto/PortoListagens.test.tsx`
- Create: `frontend/src/porto/PortoDashboardRelatorios.test.tsx`

**Interfaces:**
- Consumes: APIs das Tasks 2-4.
- Produces: área de colagem, prévia quantificada, filtros, oito cards de OP, tabela completa, detalhe/justificativa, dashboard Porto e downloads.

- [ ] **Step 1: Write failing UI tests**

Cobrir colar/analisar/limpar, soma e contagens, erro/divergência/cancelamento/retomada/confirmação, filtros, cards, solicitação XLSX/PDF, falha de download e rota protegida pela autenticação real.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- src/porto`

- [ ] **Step 3: Implement minimal React integration**

Buscar dados independentes em paralelo, derivar somente estado visual simples, manter componentes sem dependências novas e iniciar downloads com o cliente HTTP autenticado.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- src/porto`

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: integra painel e importacao Porto no frontend"
```

### Task 6: Validar artefatos, fluxo local e entrega

**Files:**
- Modify only if validation exposes a defect in files already listed above.

**Interfaces:**
- Consumes: sistema completo das Tasks 1-5.
- Produces: evidência de testes, build, artefatos legíveis e fluxo local sintético.

- [ ] **Step 1: Run complete automated verification**

```bash
cd backend && ./mvnw test && ./mvnw package
cd ../frontend && npm test && npm run lint && npm run build
```

- [ ] **Step 2: Validate generated files**

Gerar XLSX/PDF com dados sintéticos, reabrir o workbook, renderizar ao menos a aba Resumo e renderizar todas as páginas do PDF para inspeção visual.

- [ ] **Step 3: Run manual local flow**

Iniciar backend no perfil `local` e frontend Vite; colar tabela sintética, cancelar/reabrir/confirmar, importar OP, vincular OS, verificar conciliação exata/abaixo/acima, confirmar recebimento e baixar os dois relatórios.

- [ ] **Step 4: Run final repository checks**

```bash
git diff --check
git status --short --branch
git diff --stat
git log -5 --oneline
```

- [ ] **Step 5: Commit final corrections if any**

```bash
git add backend/src/main backend/src/test frontend/src
git commit -m "fix: valida fluxo completo Porto"
```

## Self-review

- Cobertura: colagem, arquivos alternativos, idempotência, OPs únicas, conciliação, estados separados, pendentes/devolvidos, filtros, Excel, PDF, autenticação e frontend estão atribuídos a tarefas.
- Interfaces: filtros e DTOs da Task 3 alimentam os relatórios da Task 4 e as páginas da Task 5.
- Dependências: somente POI OOXML é candidata nova; PDFBox já existe.
- Dados: todos os exemplos e fixtures devem usar nomes, OS, OP e QRA sintéticos.
