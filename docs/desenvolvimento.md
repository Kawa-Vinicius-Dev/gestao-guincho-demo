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
