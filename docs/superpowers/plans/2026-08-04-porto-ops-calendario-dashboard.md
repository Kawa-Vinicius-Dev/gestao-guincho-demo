# Porto: OPs, Calendário e Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o módulo Porto existente com calendário configurável, serviços aguardando lançamento, criação manual e composição de OP, conciliação auditável, análises por período e integração visual ao financeiro sem misturar faturamento com caixa.

**Architecture:** Preservar os endpoints e tabelas existentes, adicionando uma migration incremental V8 e serviços focados para calendário, parser em blocos, dashboard e histórico. O fluxo de importação continua em duas fases (prévia persistida e confirmação transacional); as telas React consomem apenas a API autenticada e reutilizam o design atual.

**Tech Stack:** Java 21, Spring Boot 4.1, Spring Security, JPA, Flyway, H2/PostgreSQL, Apache POI/PDFBox, React 19, TypeScript, Vite, Vitest, Testing Library e MSW.

## Global Constraints

- Branch: `feat/porto-ops-calendario-dashboard` em worktree isolado.
- Não reescrever o projeto, remover funcionalidades, alterar autenticação ou integrar com portal/API da Porto.
- Não usar scraping, automação de navegador, CAPTCHA bypass, dados reais ou conexão cloud.
- Arquivos reais não entram em testes, fixtures, documentação, commits ou logs.
- Número da OS e número da OP continuam sendo chaves de negócio únicas.
- Prévia nunca persiste OP, OS ou recebimento; confirmação é explícita e transacional.
- Faturamento produzido, valor programado e dinheiro recebido permanecem linhas financeiras distintas.
- Migrations V1–V7 não serão alteradas; a nova migration deve funcionar no H2 em modo PostgreSQL e no PostgreSQL.
- Nenhuma dependência nova será adicionada sem necessidade comprovada.
- Não fazer merge, push ou deploy.

---

### Task 1: Domínio incremental, calendário e criação manual de OP

**Files:**
- Create: `backend/src/main/resources/db/migration/common/V8__porto_ops_calendario_dashboard.sql`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/entity/CalendarioPagamentoPorto.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/entity/HistoricoPorto.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/repository/CalendarioPagamentoPortoRepository.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/repository/HistoricoPortoRepository.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/service/CalendarioPortoService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/EnumsFinanceiros.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/OrdemPagamentoPorto.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/OrdemServicoPorto.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/PortoDtos.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/controller/PortoController.java`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoCalendarioApiIntegrationTest.java`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoOrdemPagamentoManualApiIntegrationTest.java`

**Interfaces:**
- Produces: `CalendarioPortoService.proximaDataAtiva(LocalDate)`, `ciclosUltrapassados(LocalDate, LocalDate)`, CRUD REST em `/api/porto/calendario`.
- Produces: `POST /api/porto/ordens-pagamento` com `OrdemPagamentoRequest` e `PUT /api/porto/ordens-pagamento/{id}`.
- Produces: `SituacaoFinanceiraOpPorto { PROGRAMADO, A_CONFIRMAR, RECEBIDO }` sem inferir recebimento por status Porto.

- [ ] **Step 1: Escrever testes de migration, calendário e OP manual**

```java
@Test void calendarioCalculaProximaDataAtivaEIgnoraDataDesativada() { /* POST, PATCH e GET públicos via MockMvc */ }
@Test void criaOpProcessadaSemMarcarComoRecebida() { /* pagamentoConfirmado=false => A_CONFIRMAR */ }
@Test void exigeDataAoConfirmarPagamentoNoBanco() { /* pagamentoConfirmado=true sem data => 400 */ }
@Test void numeroDaOpPermaneceUnico() { /* segunda criação => 400 e uma única OP */ }
```

- [ ] **Step 2: Executar os testes focados e confirmar RED**

Run: `cd backend && ./mvnw -Dtest=PortoCalendarioApiIntegrationTest,PortoOrdemPagamentoManualApiIntegrationTest test`
Expected: FAIL por migration, endpoints e classes ainda inexistentes.

- [ ] **Step 3: Criar V8 e implementação mínima**

```java
public LocalDate proximaDataAtiva(LocalDate atendimento) {
    return repositorio.findFirstByAtivoTrueAndDataPagamentoAfterOrderByDataPagamento(atendimento)
        .orElseThrow(() -> new IllegalArgumentException("Não há data ativa posterior no calendário Porto."))
        .getDataPagamento();
}
```

A V8 cria `calendario_pagamentos_porto`, `historico_porto`, novos campos de OP/OS e popula as dez datas sintéticas de 2026 por SQL, com índices em FKs, datas e situações. Os campos de fluxo novos não substituem nem removem as colunas legadas de V6.

- [ ] **Step 4: Executar os testes focados e confirmar GREEN**

Run: `cd backend && ./mvnw -Dtest=PortoCalendarioApiIntegrationTest,PortoOrdemPagamentoManualApiIntegrationTest test`
Expected: PASS.

- [ ] **Step 5: Commit local pequeno**

```bash
git add backend/src/main backend/src/test/java/com/anaiv/fluxogestao/porto/PortoCalendarioApiIntegrationTest.java backend/src/test/java/com/anaiv/fluxogestao/porto/PortoOrdemPagamentoManualApiIntegrationTest.java
git commit -m "feat: adiciona calendario e ordens Porto manuais"
```

### Task 2: Parser em blocos e serviços aguardando lançamento

**Files:**
- Create: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoBlocosParser.java`
- Create: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoBlocosParserTest.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoImportacaoService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/PortoImportacaoDtos.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/PortoDtos.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/Importacao.java`
- Modify: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoColagemApiIntegrationTest.java`

**Interfaces:**
- Consumes: `CalendarioPortoService.proximaDataAtiva`.
- Produces: `PortoBlocosParser.parse(byte[]) -> PreviaPorto` com tipo `SERVICOS_AGUARDANDO_LANCAMENTO`.
- Produces: importação confirmada com `statusOperacional=AGUARDANDO_LANCAMENTO`, `statusFinanceiro=AGUARDANDO_OP` e `dataPrevistaOriginal`.

- [ ] **Step 1: Escrever testes do parser e da prévia transacional**

```java
@Test void separaBlocosPeloNumeroDaOsELeValorEDataBrasileiros() { /* duas OS sintéticas */ }
@Test void opcionaisAusentesNaoDeslocamQraSocorristaOuValor() { /* zero, um e dois opcionais */ }
@Test void reimportacaoPreencheVaziosEPreservaCamposExistentes() { /* API, sem SQL lateral */ }
@Test void conflitoEntreValoresNaoEhSobrescritoSilenciosamente() { /* ação DIVERGENCIA */ }
@Test void previaNaoPersisteServicoEConfirmacaoDefinePrevisao() { /* GET antes/depois */ }
```

- [ ] **Step 2: Executar testes focados e confirmar RED**

Run: `cd backend && ./mvnw -Dtest=PortoBlocosParserTest,PortoColagemApiIntegrationTest test`
Expected: FAIL por tipo/parser e campos ainda inexistentes.

- [ ] **Step 3: Implementar parser específico e roteamento seguro**

```java
private static final Pattern INICIO_OS = Pattern.compile("^(?:OS\\s*)?\\d{2}/\\d{7}-\\d{2}$", Pattern.CASE_INSENSITIVE);
private static final Pattern VALOR = Pattern.compile("^R\\$\\s*[0-9.]+,[0-9]{2}$");
```

O parser ancora número, data, valor e status a partir das extremidades do bloco; os campos entre placa e valor são classificados como QRA quando numéricos/pontuados e como socorrista quando textuais. O importador escolhe blocos apenas quando o padrão for reconhecido e mantém o parser tabular atual como fallback.

- [ ] **Step 4: Executar testes focados e confirmar GREEN**

Run: `cd backend && ./mvnw -Dtest=PortoBlocosParserTest,PortoColagemApiIntegrationTest test`
Expected: PASS.

- [ ] **Step 5: Commit local pequeno**

```bash
git add backend/src/main backend/src/test/java/com/anaiv/fluxogestao/porto
git commit -m "feat: importa servicos Porto aguardando lancamento"
```

### Task 3: Composição de OP, divergência justificada e histórico

**Files:**
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoImportacaoService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/JustificativaConciliacaoPorto.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/repository/HistoricoPortoRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/PortoDtos.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/controller/PortoController.java`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoOrdemPagamentoFluxoApiIntegrationTest.java`
- Modify: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoApiIntegrationTest.java`
- Modify: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoResumoApiIntegrationTest.java`

**Interfaces:**
- Consumes: OP manual, calendário e parser tabular existentes.
- Produces: `POST /api/porto/ordens-pagamento/{id}/composicao/previa` e confirmação pelo fluxo idempotente atual.
- Produces: justificativa com motivo, observação, diferença, usuário e timestamp quando soma != valor informado.
- Produces: OS fora do ciclo com `LIBERADO_APOS_ANALISE`, previsão original, data efetiva e ciclos ultrapassados.

- [ ] **Step 1: Escrever testes de composição e conciliação**

```java
@Test void vinculaOsExistenteSemDuplicarNemApagarCampos() { /* composição na OP */ }
@Test void criaOsAusenteComCamposDisponiveis() { /* viatura opcional */ }
@Test void bloqueiaValorDiferenteSemRevisaoExplicita() { /* DIVERGENCIA */ }
@Test void divergenciaDaOpExigeMotivoEObservacao() { /* 400 sem justificativa */ }
@Test void reassociacaoExplicitaRecalculaAsDuasOps() { /* regra atual preservada */ }
@Test void atrasoDeUmCicloMarcaLiberadoAposAnalise() { /* 14/08 -> 28/08 = 1 */ }
@Test void processadoNaoViraRecebidoSemConfirmacaoBancaria() { /* A_CONFIRMAR */ }
```

- [ ] **Step 2: Executar testes focados e confirmar RED**

Run: `cd backend && ./mvnw -Dtest=PortoOrdemPagamentoFluxoApiIntegrationTest,PortoApiIntegrationTest,PortoResumoApiIntegrationTest test`
Expected: FAIL nos novos comportamentos.

- [ ] **Step 3: Implementar confirmação transacional mínima**

```java
if (diferenca.abs().compareTo(new BigDecimal("0.01")) > 0 && !request.temJustificativa()) {
    throw new IllegalArgumentException("A soma dos serviços diverge da OP; informe motivo e justificativa para confirmar.");
}
```

A confirmação registra histórico da OP/OS, preserva campos não vazios, exige confirmação separada para valor e associação, e só marca `RECEBIDO` quando `pagamentoConfirmado=true` ou pelo endpoint manual de recebimento.

- [ ] **Step 4: Executar testes focados e confirmar GREEN**

Run: `cd backend && ./mvnw -Dtest=PortoOrdemPagamentoFluxoApiIntegrationTest,PortoApiIntegrationTest,PortoResumoApiIntegrationTest test`
Expected: PASS.

- [ ] **Step 5: Commit local pequeno**

```bash
git add backend/src/main backend/src/test/java/com/anaiv/fluxogestao/porto
git commit -m "feat: concilia composicao e ciclos das ordens Porto"
```

### Task 4: Dashboard por período e integração financeira sem inflar caixa

**Files:**
- Create: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoDashboardService.java`
- Create: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoDashboardPeriodoApiIntegrationTest.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/PortoDtos.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/controller/PortoController.java`
- Modify: `frontend/src/pages/PortoDashboardPage.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/api/porto.ts`
- Modify: `frontend/src/types/modelos.ts`
- Modify: `frontend/src/porto/PortoDashboard.test.tsx`
- Create: `frontend/src/porto/PortoFinanceiroIntegration.test.tsx`

**Interfaces:**
- Produces: `GET /api/porto/dashboard?periodo=DIARIO|SEMANAL|QUINZENAL|MENSAL|PERSONALIZADO&visao=PRODUCAO|PAGAMENTOS&referencia=YYYY-MM-DD`.
- Produces: métricas de produção filtradas por atendimento e métricas de pagamento filtradas pela data da OP/recebimento, nunca pela mesma consulta.
- Consumes no dashboard financeiro apenas os totais Porto; não cria `Receita`, `ContaReceber` ou movimento de caixa.

- [ ] **Step 1: Escrever testes backend/frontend dos períodos e separação financeira**

```java
@Test void calculaSemanaDeSegundaADomingo() { /* datas nas bordas */ }
@Test void calculaPrimeiraESegundaQuinzena() { /* 1-15 e 16-fim */ }
@Test void producaoUsaAtendimentoEPagamentosUsamOpOuRecebimento() { /* linhas de tempo distintas */ }
```

```tsx
test('alterna Produção e Pagamentos sem misturar métricas', async () => { /* MSW e botões */ })
test('bloco Porto mostra faturamento a receber sem alterar lucro de caixa', async () => { /* valores demo intactos */ })
```

- [ ] **Step 2: Executar testes focados e confirmar RED**

Run: `cd backend && ./mvnw -Dtest=PortoDashboardPeriodoApiIntegrationTest test`
Run: `cd frontend && npm test -- PortoDashboard.test.tsx PortoFinanceiroIntegration.test.tsx`
Expected: FAIL por filtros/visões e bloco inexistentes.

- [ ] **Step 3: Implementar serviço e componentes mínimos**

```ts
const [porto, financeiro] = await Promise.all([obterDashboardPorto(parametros), Promise.resolve(resumo)])
```

O frontend deriva intervalo e rótulos no render, busca dados independentes em paralelo quando aplicável e não duplica os totais Porto no `DemoContext`.

- [ ] **Step 4: Executar testes focados e confirmar GREEN**

Run: `cd backend && ./mvnw -Dtest=PortoDashboardPeriodoApiIntegrationTest test`
Run: `cd frontend && npm test -- PortoDashboard.test.tsx PortoFinanceiroIntegration.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit local pequeno**

```bash
git add backend/src/main backend/src/test frontend/src
git commit -m "feat: adiciona analises e visao financeira Porto"
```

### Task 5: Páginas de serviços, OP, calendário, importações e navegação

**Files:**
- Create: `frontend/src/pages/PortoCalendarioPage.tsx`
- Create: `frontend/src/pages/PortoRelatoriosPage.tsx`
- Modify: `frontend/src/pages/PortoOrdensPagamentoPage.tsx`
- Modify: `frontend/src/pages/PortoOrdensServicoPage.tsx`
- Modify: `frontend/src/pages/PortoImportacoesPage.tsx`
- Modify: `frontend/src/pages/PortoPendenciasPage.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/api/porto.ts`
- Modify: `frontend/src/types/modelos.ts`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/porto/PortoImportacoesPage.test.tsx`
- Modify: `frontend/src/porto/PortoListagens.test.tsx`
- Create: `frontend/src/porto/PortoCalendario.test.tsx`

**Interfaces:**
- Consumes: endpoints das Tasks 1–4.
- Produces: menu Porto com Dashboard, Serviços, Ordens de Pagamento, Importações, Pendências e devolvidos e Relatórios.
- Produces: modal “Nova ordem de pagamento”, upload de composição dentro da OP, detalhe/histórico, filtros de serviço e administração do calendário.

- [ ] **Step 1: Escrever testes dos fluxos visíveis**

```tsx
test('cria OP manual e não marca Processado como recebido', async () => { /* formulário e payload */ })
test('analisa composição dentro da OP e mostra soma e diferença', async () => { /* upload/prévia */ })
test('exige justificativa visual antes de confirmar divergência', async () => { /* botão desabilitado */ })
test('filtra serviços por aguardando lançamento e liberado após análise', async () => { /* query */ })
test('adiciona, edita e desativa data do calendário', async () => { /* CRUD */ })
test('evita segunda confirmação durante carregamento', async () => { /* botão disabled */ })
```

- [ ] **Step 2: Executar testes focados e confirmar RED**

Run: `cd frontend && npm test -- PortoImportacoesPage.test.tsx PortoListagens.test.tsx PortoCalendario.test.tsx`
Expected: FAIL nos novos controles.

- [ ] **Step 3: Implementar páginas com a identidade existente**

```tsx
const [itens, resumo] = await Promise.all([
  listarOrdensPagamentoPorto(params),
  resumirOrdensPagamentoPorto(params),
])
```

Estados de erro, vazio e carregamento usam os componentes atuais; campos derivados (soma, diferença, bloqueios) não são duplicados em `useEffect`; listas usam `Map` para joins repetidos.

- [ ] **Step 4: Executar testes focados e confirmar GREEN**

Run: `cd frontend && npm test -- PortoImportacoesPage.test.tsx PortoListagens.test.tsx PortoCalendario.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit local pequeno**

```bash
git add frontend/src frontend/package-lock.json
git commit -m "feat: completa operacao visual do modulo Porto"
```

### Task 6: Exportações por OP, documentação e verificação final

**Files:**
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoRelatorioService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/controller/PortoController.java`
- Modify: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoRelatorioApiIntegrationTest.java`
- Modify: `frontend/src/api/porto.ts`
- Modify: `frontend/src/pages/PortoOrdensPagamentoPage.tsx`
- Modify: `README.md`
- Modify: `docs/regras-de-negocio.md`
- Create: `docs/porto-fluxo-ops-e-pagamentos.md`

**Interfaces:**
- Produces: `GET /api/porto/ordens-pagamento/{id}/relatorios/excel` com sete abas e `/pdf` A4.
- Produces: documentação do fluxo manual, dois TXTs, calendário, status, conciliação, ausência de API e execução local.

- [ ] **Step 1: Escrever testes de exportação por OP**

```java
@Test void excelDaOpPossuiResumoVinculadosRegularesLiberadosDivergenciasEAgrupamentos() { /* nomes e linhas */ }
@Test void pdfDaOpEhLegivelEComparaValorInformadoCalculadoEDiferenca() { /* texto extraído */ }
```

- [ ] **Step 2: Executar testes focados e confirmar RED**

Run: `cd backend && ./mvnw -Dtest=PortoRelatorioApiIntegrationTest test`
Expected: FAIL nos endpoints e abas adicionais.

- [ ] **Step 3: Implementar exportações e documentação**

O Excel terá `Resumo da OP`, `Serviços vinculados`, `Serviços regulares`, `Liberados após análise`, `Divergências`, `Por socorrista` e `Por especialidade`; o PDF usa A4 e não inclui cliente, placa ou identificadores pessoais desnecessários.

- [ ] **Step 4: Executar verificação completa fresca**

Run: `cd backend && ./mvnw test`
Run: `cd frontend && npm test`
Run: `cd frontend && npm run lint`
Run: `cd frontend && npm run build`
Run: `git diff --check`
Run: `git status --short --branch`
Expected: todos com exit code 0; somente mudanças da feature presentes.

- [ ] **Step 5: Revisar cobertura da especificação e criar commit final local**

```bash
git add backend frontend README.md docs
git commit -m "docs: registra fluxo de ordens e pagamentos Porto"
```

Não fazer merge, push ou deploy após o commit.
