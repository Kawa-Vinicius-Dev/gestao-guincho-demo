# Guia de desenvolvimento

## Pré-requisitos

- Java 21
- Node.js 22.12 ou mais recente
- Docker Desktop, para usar PostgreSQL local

## Primeira execução

Na raiz do projeto, suba o banco:

```powershell
docker compose up -d postgres
```

Em terminais separados:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

```powershell
cd frontend
npm install
npm run dev
```

O painel fica em `http://localhost:5173` e a API em `http://localhost:8080/api`.

## Rotina antes de enviar ao GitHub

```powershell
cd backend
.\mvnw.cmd test

cd ..\frontend
npm run lint
npm test
npm run build
```

## Convenções

- Uma migration Flyway nova nunca altera uma migration já publicada.
- Uma regra de negócio nova nasce no service e é coberta por teste de API.
- Uma tela nova reutiliza componentes e o cliente HTTP existente.
- Segredos ficam em variáveis de ambiente; use `.env.example` como referência.
- Não versione `target`, `node_modules`, dados locais, PDFs importados nem configurações da IDE.

## Medições de confiabilidade e desempenho Porto

As requisições `/api/**` expõem `Server-Timing` e `X-Request-Id`; o cliente mede cada chamada com `performance.measure('api:<MÉTODO> <caminho>', ...)` e mede transições iniciadas por links internos com `route:<caminho>`.

No ambiente de desenvolvimento de 08/09/2026 não havia Docker/PostgreSQL disponível. Por isso, não foram registrados `EXPLAIN (ANALYZE, BUFFERS)`, medianas ou p95 de banco/navegador; esses números devem ser coletados com `docker compose up -d postgres`, a API rodando no perfil `local` e um perfil de navegador com dados representativos. Não foram criados índices sem um plano PostgreSQL que demonstrasse necessidade — `numero` de OS e `hash_registro` já possuem restrições únicas em `V5__modulo_porto.sql`.

Como referência não comparável de regressão, a integração H2 de 244 OS passou antes e depois da otimização de sincronização financeira; ela inclui inicialização do Spring/H2 e não deve ser usada como p95 de produção.
