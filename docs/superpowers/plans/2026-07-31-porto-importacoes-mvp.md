# Porto Importações MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um MVP local do módulo Porto para importar CSVs de OP, OS vinculadas e serviços devolvidos, listar o domínio e confirmar recebimentos manualmente.

**Architecture:** O backend ganha um domínio Porto isolado em Spring Boot/JPA/Flyway, com parser CSV sem dependência nova, prévia persistida na infraestrutura de `Importacao` existente e confirmação transacional idempotente. O frontend adiciona páginas administrativas pequenas que usam `api()` e rotas lazy, sem alterar o fluxo demo ou conectar banco cloud.

**Tech Stack:** Java 21, Spring Boot 4.1, JPA, Flyway, H2 nos testes, React 19, TypeScript, Vitest, Testing Library e MSW.

## Global Constraints

- No máximo 6 tarefas, sem subagentes, deploy, push, scraping, Porto direta, Gobrax ou banco cloud.
- Não instalar dependências adicionais: o CSV será tratado com Java padrão.
- TDD nos seams públicos: parser, API REST e páginas React.
- Dados de teste exclusivamente sintéticos.
- Campo CSV vazio nunca substitui dado já persistido.
- Pagamento programado não é recebido; recebimento exige confirmação manual.
- Devolução cria pendência, nunca despesa; km excedente é receita informativa e km morto estimado não gera despesa.

---

### Task 1: Domínio Porto e migration

**Files:**
- Create: `backend/src/main/resources/db/migration/common/V5__modulo_porto.sql`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/entity/OrdemPagamentoPorto.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/entity/OrdemServicoPorto.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/entity/PendenciaFinanceiraPorto.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/entity/RegistroImportadoPorto.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/repository/OrdemPagamentoPortoRepository.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/repository/OrdemServicoPortoRepository.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/repository/PendenciaFinanceiraPortoRepository.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/repository/RegistroImportadoPortoRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/Importacao.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/EnumsFinanceiros.java`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoApiIntegrationTest.java`

**Interfaces:**
- Produces: `OrdemPagamentoPorto.atualizar(...)`, `confirmarRecebimento(BigDecimal, LocalDate)`, `OrdemServicoPorto.atualizar(...)`, `TipoRelatorioPorto` e repositórios por número/hash.

- [x] Escrever um teste de contexto/API que exija as tabelas `ordens_pagamento_porto`, `ordens_servico_porto`, `pendencias_financeiras_porto` e `registros_importados_porto`; executar `backend\\mvnw.cmd -f backend/pom.xml -Dtest=PortoApiIntegrationTest test` e observar RED.
- [x] Criar V5 com chaves únicas de OP/OS/hash, relação 1:N OP→OS, campos opcionais de viatura/km e status de recebimento/pendência; mapear entidades/repositórios e executar o teste até GREEN.
- [x] Commit local: `git add backend/src/main backend/src/test && git commit -m "feat: adiciona dominio Porto"`.

### Task 2: Parser CSV e prévia

**Files:**
- Create: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoCsvParser.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/dto/PortoImportacaoDtos.java`
- Create: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoCsvParserTest.java`
- Create: `backend/src/test/resources/porto/previsao-receber-utf8.csv`
- Create: `backend/src/test/resources/porto/os-vinculadas.csv`
- Create: `backend/src/test/resources/porto/servicos-devolvidos.csv`

**Interfaces:**
- Produces: `PortoCsvParser.parse(byte[]): PreviaPorto`, com `tipo`, `cabecalhos`, `linhas`, `erros`; cada `LinhaPorto` fornece `hashRegistro()` e valores normalizados.

- [x] Escrever testes RED para detectar os três relatórios por cabeçalhos, UTF-8/BOM/ISO-8859-1, delimitadores `,`, `;`, tab, datas `dd/MM/yyyy`/ISO, moeda brasileira e remoção de HTML de OP/OS.
- [x] Implementar parser com `CharsetDecoder` estrito, fallback ISO-8859-1, detecção de delimitador e máquina de estados para aspas; normalizar cabeçalhos sem acentos e gerar SHA-256 canônico por linha.
- [x] Rodar `backend\\mvnw.cmd -f backend/pom.xml -Dtest=PortoCsvParserTest test` até GREEN e commit `test: cobre formatos CSV da Porto`.

### Task 3: Prévia, confirmação idempotente e consultas REST

**Files:**
- Create: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoImportacaoService.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoService.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/controller/PortoController.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/dto/PortoDtos.java`
- Modify: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoApiIntegrationTest.java`

**Interfaces:**
- Produces: `POST /api/porto/importacoes/previa`, `POST /api/porto/importacoes/{id}/confirmar`, `GET /api/porto/ordens-pagamento`, `GET /api/porto/ordens-servico`, `GET /api/porto/pendencias` e `PATCH /api/porto/ordens-pagamento/{id}/receber`.
- Confirmação recebe `{ "ordemPagamentoId": number|null }`; relatório de OS exige OP, demais ignoram o campo.

- [x] Escrever testes REST RED para upload→prévia sem domínio persistido, confirmação das três modalidades, OP com várias OS, seleção obrigatória da OP, hash duplicado, merge que preserva campo existente quando CSV vier vazio e autorização de administrador.
- [x] Implementar armazenamento local seguro do CSV, confirmação transacional/upsert e registro de hashes; devolução abre pendência sem criar `Despesa`, e campos de km permanecem apenas no domínio Porto.
- [x] Escrever RED/GREEN para recebimento manual: data programada mantém `PENDENTE`; PATCH define valor/data recebidos uma única vez; listagens retornam DTOs ordenados.
- [x] Rodar `backend\\mvnw.cmd -f backend/pom.xml -Dtest=PortoApiIntegrationTest test` e commit `feat: expõe importação e financeiro Porto`.

### Task 4: Cliente e página de importação Porto

**Files:**
- Create: `frontend/src/api/porto.ts`
- Create: `frontend/src/pages/PortoImportacoesPage.tsx`
- Create: `frontend/src/porto/PortoImportacoesPage.test.tsx`
- Modify: `frontend/src/types/modelos.ts`
- Modify: `frontend/src/test/servidor.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: endpoints de prévia/confirmação da Task 3.
- Produces: rota `/porto/importacoes` com estados upload, prévia, seletor obrigatório de OP para relatório de OS e confirmação.

- [x] Escrever teste React RED que envia fixture sintética, mostra tipo/linhas/erros, exige OP para OS e confirma via API.
- [x] Implementar tipos e cliente direto sem barrel, iniciar chamadas independentes em paralelo, renderizar tabela mínima e mensagens de erro/carregamento.
- [x] Rodar `npm.cmd test -- PortoImportacoesPage.test.tsx` em `frontend` até GREEN e commit `feat: adiciona importacao Porto no frontend`.

### Task 5: Listagens e recebimento no frontend

**Files:**
- Create: `frontend/src/pages/PortoOrdensPagamentoPage.tsx`
- Create: `frontend/src/pages/PortoOrdensServicoPage.tsx`
- Create: `frontend/src/pages/PortoPendenciasPage.tsx`
- Create: `frontend/src/porto/PortoListagens.test.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/test/servidor.ts`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: três GETs e PATCH de recebimento da Task 3.
- Produces: rotas administrativas `/porto/ordens-pagamento`, `/porto/ordens-servico`, `/porto/pendencias` e navegação Porto.

- [x] Escrever testes RED para OP programada aparecer não recebida, modal de confirmação manual atualizar a OP, OS mostrar OP/especialidade/viatura opcional e devolução aparecer como pendência sem rótulo de despesa.
- [x] Implementar páginas lazy com tabelas e estados vazios existentes; manter visual atual e nenhuma alteração nas telas financeiras atuais.
- [x] Rodar `npm.cmd test -- PortoListagens.test.tsx` até GREEN e commit `feat: adiciona paginas operacionais Porto`.

### Task 6: Verificação integral e documentação

**Files:**
- Modify: `docs/superpowers/plans/2026-07-31-porto-importacoes-mvp.md` somente para marcar checkboxes concluídos.

**Interfaces:**
- Consumes: todos os artefatos das Tasks 1–5.
- Produces: evidência fresca de testes/build e branch local pronta, sem integração/push.

- [x] Executar backend: `backend\\mvnw.cmd -f backend/pom.xml test` e `backend\\mvnw.cmd -f backend/pom.xml package`.
- [x] Executar frontend em `frontend`: `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`.
- [x] Executar `git diff --check`, revisar requisitos linha a linha, confirmar ausência de dados reais/cloud/deploy e commit final apenas se o plano marcado mudar: `docs: conclui plano do MVP Porto`.

## Plan Review

- Cobertura: os três relatórios, regras financeiras, idempotência, encodings/delimitadores/datas, prévia/confirmação, listagens e recebimento manual estão mapeados nas Tasks 1–5.
- Limites: `Importacao` é reutilizada só para rastreabilidade/arquivo; o domínio Porto não cria `Despesa` nem km automático e não altera o PostgreSQL remoto.
- Riscos controlados: variações reais de cabeçalhos podem exigir aliases futuros; hashes por linha evitam duplicidade conhecida; OP deve existir antes de confirmar OS.
- Sem placeholders: cada tarefa define arquivos, interfaces, testes, comandos e commit local.
