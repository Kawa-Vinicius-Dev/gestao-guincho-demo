# Railway Backend Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a Railway construa e execute o backend Spring Boot a partir da raiz do monorepo usando Docker, sem alterar frontend ou regras de negócio.

**Architecture:** A raiz passa a declarar explicitamente um build Docker multi-stage do subdiretório `backend/`. O Spring Boot consome `PORT` da Railway com fallback local, enquanto `railway.json` seleciona o Dockerfile e `.dockerignore` reduz o contexto de build.

**Tech Stack:** Docker multi-stage, Eclipse Temurin Java 21, Maven Wrapper, Spring Boot, Railway Railpack configuration, YAML e JSON.

## Global Constraints

- Não modificar o frontend nem `frontend/package-lock.json`.
- Não alterar autenticação, regras de negócio, módulo Porto, banco ou migrations.
- Não adicionar segredos reais, PostgreSQL embutido, `start.sh` ou dependências.
- Não fazer deploy, merge, push ou force-push.
- Trabalhar na branch `chore/railway-backend-deploy`.

---

### Task 1: Contrato de build Railway na raiz

**Files:**
- Create: `Dockerfile`
- Create: `railway.json`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: `backend/.mvn`, `backend/mvnw`, `backend/pom.xml`, `backend/src`.
- Produces: imagem Java 21 com `/app/app.jar` e `ENTRYPOINT ["java", "-jar", "/app/app.jar"]`.

- [ ] **Step 1: Confirmar que o contrato ainda não existe**

Run: `Test-Path Dockerfile; Test-Path railway.json; Test-Path .dockerignore`
Expected: os três resultados são `False`.

- [ ] **Step 2: Criar Dockerfile multi-stage**

Copiar primeiro wrapper e POM, normalizar `mvnw`, executar `dependency:go-offline`, copiar `src`, empacotar sem testes e selecionar um único JAR que não termine em `.original` para `/workspace/app.jar`. O runtime deve copiar apenas esse arquivo para uma imagem `eclipse-temurin:21-jre`.

- [ ] **Step 3: Criar configuração Railway e contexto Docker**

Criar `railway.json` com builder `DOCKERFILE`, `dockerfilePath` igual a `Dockerfile`, os quatro `watchPatterns` especificados e política de reinício `ON_FAILURE` com três tentativas. Criar `.dockerignore` excluindo frontend, docs, worktrees, artefatos e dados locais sem excluir o backend Maven.

- [ ] **Step 4: Validar arquivos declarativos**

Run: `Get-Content -Raw railway.json | ConvertFrom-Json | Out-Null`
Expected: exit code 0.

Run: `docker build -t gestao-guincho-backend:test .` quando `docker version` estiver disponível.
Expected: imagem construída e apenas o JAR executável copiado para o runtime.

Run: iniciar a imagem temporariamente com `SPRING_PROFILES_ACTIVE=local`, aguardar o log `Started FluxoGestaoApplication` e remover o contêiner.
Expected: aplicação inicia usando a porta 8080 sem erro de configuração.

### Task 2: Porta Railway e documentação

**Files:**
- Modify: `backend/src/main/resources/application.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: variáveis `PORT` e `SERVER_PORT`.
- Produces: resolução `${PORT:${SERVER_PORT:8080}}` e instruções sem segredos.

- [ ] **Step 1: Ajustar somente a propriedade da porta**

Alterar `server.port` de `${SERVER_PORT:8080}` para `${PORT:${SERVER_PORT:8080}}`.

- [ ] **Step 2: Documentar o deploy**

Adicionar seção curta ao README explicando Dockerfile na raiz, backend em `backend/`, frontend no Vercel e as oito variáveis obrigatórias com valores sintéticos.

- [ ] **Step 3: Inspecionar o escopo do diff**

Run: `git diff --name-only`
Expected: somente `Dockerfile`, `railway.json`, `.dockerignore`, `application.yml`, `README.md` e este plano.

### Task 3: Verificação e commit local

**Files:**
- Verify: todos os arquivos das tarefas anteriores.

**Interfaces:**
- Consumes: configuração completa de deploy.
- Produces: commit local verificável, sem push ou deploy.

- [ ] **Step 1: Executar testes do backend**

Run: `cd backend; .\mvnw.cmd test`
Expected: `BUILD SUCCESS`, zero falhas.

- [ ] **Step 2: Empacotar sem repetir testes**

Run: `cd backend; .\mvnw.cmd -DskipTests package`
Expected: JAR executável em `backend/target` e `BUILD SUCCESS`.

- [ ] **Step 3: Verificar consistência Git e ausência de segredos**

Run: `git diff --check; git status --short --branch`
Expected: nenhuma inconsistência; nenhum arquivo do frontend ou migration modificado.

- [ ] **Step 4: Criar commit local**

Run: `git add Dockerfile railway.json .dockerignore backend/src/main/resources/application.yml README.md docs/superpowers/plans/2026-08-04-railway-backend-deploy.md; git commit -m "chore: prepara backend para deploy na Railway"`
Expected: um commit local na branch `chore/railway-backend-deploy`.
