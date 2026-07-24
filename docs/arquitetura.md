# Arquitetura

O Fluxo de Gestão é um monólito modular: uma API REST e uma aplicação web no mesmo repositório. A escolha reduz custo operacional no MVP e mantém uma separação clara para evoluir o produto.

## Mapa do repositório

```text
GestãoAdm/
├── backend/                 # API Java 21 / Spring Boot
│   └── src/
│       ├── main/
│       │   ├── java/.../    # código da aplicação por camada
│       │   └── resources/   # configurações e migrations Flyway
│       └── test/            # testes de integração da API
├── frontend/                # painel React + TypeScript
│   ├── src/
│   │   ├── api/             # cliente HTTP
│   │   ├── auth/            # sessão e autorização da interface
│   │   ├── components/      # componentes reutilizáveis
│   │   ├── pages/           # telas por módulo de negócio
│   │   ├── types/           # contratos TypeScript
│   │   └── utils/           # funções puras de apoio
│   └── e2e/                 # cenário de navegador de ponta a ponta
├── docs/                    # decisões e guias para a equipe
├── scripts/                 # atalhos locais para Windows
├── compose.yaml             # PostgreSQL de desenvolvimento
└── README.md                # início rápido
```

## Backend

As responsabilidades são separadas em `controller`, `service`, `repository`, `dto`, `entity`, `security`, `config` e `exception`.

- Controllers recebem HTTP e retornam DTOs; entidades nunca são expostas diretamente.
- Services concentram regras de negócio e autorização.
- Repositories isolam a persistência JPA.
- Migrations em `resources/db/migration` são a única fonte de evolução do esquema.
- O token de sessão é opaco; somente seu hash é salvo no banco.

O domínio financeiro usa os nomes em português para refletir o vocabulário de negócio: `ContaReceber`, `Receita`, `Despesa`, `Veiculo`, `Motorista`, `Contratante` e `Quilometragem`.

## Frontend

As páginas representam os módulos que aparecem no menu. Componentes transversais e autenticação ficam fora das páginas para evitar duplicação. A API é concentrada em `src/api/http.ts`, mantendo o contrato HTTP em um ponto conhecido.

## Dados e ambientes

PostgreSQL é o padrão. O perfil `local` usa H2 apenas para estudo rápido, sem substituir a validação em PostgreSQL. O Docker Compose mantém os dados em um volume nomeado, fora do código-fonte.

Arquivos de importação e artefatos de build são dados locais: nunca entram no Git.
