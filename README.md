# Fluxo de Gestão

Sistema de gestão financeira para empresas de guincho. Organiza recebíveis, receitas, despesas, importações da Porto Seguro, resultado por veículo e quilometragem não remunerada. Produto desenvolvido **por ANAIV**.

## Demo Gestão Guincho

O frontend inclui um modo de apresentação completo e persistente no navegador. Ele funciona sem iniciar o backend e mantém os dados no `localStorage`.

```cmd
cd /d "C:\Users\kawav\OneDrive\Documents\GestãoAdm\frontend"
npm install
npm run dev
```

Acesse [http://localhost:5173](http://localhost:5173).

- Administrador: `admin@fluxogestao.local` / `Admin@123`
- Funcionário: `funcionario@gestaoguincho.demo` / `Demo@123`

Fluxo sugerido para apresentação:

1. Abra **Lançamentos** e cadastre uma receita ou despesa vinculada a um veículo.
2. Volte à **Visão geral** e confira a atualização do lucro, da margem, dos gráficos e do veículo.
3. Abra **DRE mensal** para conferir a composição do resultado.
4. Em **Km rodado e morto**, registre quilometragem e veja o custo ser lançado automaticamente.
5. Use **Importar Excel** para simular uma importação de três linhas.
6. Em **Integrações**, use **Restaurar dados da demo** para recomeçar a apresentação.

Telas da demo: dashboard, lançamentos, contas a receber, DRE, despesas, quilometragem, frota, funcionários, escala, metas, importação, relatórios e integrações futuras.

## O que funciona

- Login por e-mail e senha, BCrypt, token opaco revogável, logout, troca de senha e perfis Administrador/Funcionário.
- Contas a receber manuais ou originadas de uma importação, atraso automático, recebimento e divergência entre previsto e recebido.
- Receitas previstas/recebidas e despesas pendentes/pagas com aprovação administrativa.
- Veículos, custo por quilômetro, motoristas, contratantes, categorias e usuários.
- Quilometragem total, remunerada, km morto e custo do km morto.
- Dashboard com filtros e dados persistidos, fluxo de caixa e resultado por veículo.
- Upload e histórico de PDFs da Porto Seguro, leitura de texto por PDFBox, prevenção de duplicidade, conferência manual e geração das contas.
- Nove relatórios exportáveis em CSV e visualização preparada para impressão.

O mapeamento automático dos campos da Porto Seguro ainda depende de uma amostra real do PDF. Até ela ser fornecida, o sistema armazena o arquivo, extrai o texto disponível e exige conferência/cadastro complementar — não cria lançamentos fictícios. PDFs digitalizados sem texto são identificados como candidatos a OCR.

## Estrutura

- `backend/`: Java 21, Spring Boot, Spring Security, JPA, Bean Validation, PDFBox, Flyway e PostgreSQL.
- `frontend/`: React, TypeScript, Vite, React Router, Vitest e Testing Library.
- `compose.yaml`: PostgreSQL 17 com volume persistente.
- `docs/`: arquitetura e guia de desenvolvimento.
- `scripts/`: atalhos PowerShell para iniciar o ambiente local.

Leia também [a arquitetura](docs/arquitetura.md) e [o guia de desenvolvimento](docs/desenvolvimento.md). Eles explicam a organização e a rotina antes de enviar mudanças ao GitHub.

## Executar com PostgreSQL

Requisitos: Java 21, Node.js 22.12+ e Docker Desktop (ou PostgreSQL 17 local).

No CMD, a partir de qualquer pasta:

```cmd
cd /d "C:\Users\kawav\OneDrive\Documents\GestãoAdm"
docker compose up -d postgres
```

Em outro CMD:

```cmd
cd /d "C:\Users\kawav\OneDrive\Documents\GestãoAdm\backend"
mvnw.cmd spring-boot:run
```

Em outro CMD:

```cmd
cd /d "C:\Users\kawav\OneDrive\Documents\GestãoAdm\frontend"
npm install
npm run dev
```

Acesse [http://localhost:5173](http://localhost:5173). A API fica em `http://localhost:8080/api`.

Credenciais locais iniciais:

- E-mail: `admin@fluxogestao.local`
- Senha: `Admin@123`

Troque a senha após o primeiro acesso. Em outro ambiente, defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` antes da primeira inicialização.

## Modo rápido sem PostgreSQL

Para estudo local, o backend oferece um perfil H2 persistente:

```cmd
cd /d "C:\Users\kawav\OneDrive\Documents\GestãoAdm\backend"
mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"
```

O frontend continua sendo iniciado com `npm run dev`. PostgreSQL permanece o banco padrão do projeto.

## Testes e build

```cmd
cd backend
mvnw.cmd test

cd ..\frontend
npm test
npm run lint
npm run build
```

O cenário `frontend/e2e/fluxo_principal.py` valida o percurso real no Chromium contra backend e frontend em execução.

## Endpoints principais

| Área | Endpoint |
|---|---|
| Autenticação | `/api/auth` |
| Dashboard | `/api/dashboard` |
| Importações | `/api/importacoes` |
| Contas a receber | `/api/contas-receber` |
| Receitas | `/api/receitas` |
| Despesas | `/api/despesas` |
| Quilometragem | `/api/quilometragens` |
| Cadastros | `/api/veiculos`, `/api/motoristas`, `/api/contratantes`, `/api/categorias`, `/api/usuarios` |
| Relatórios CSV | `/api/relatorios/{tipo}.csv` |

As migrations são aplicadas automaticamente. Arquivos importados são salvos em `backend/storage/importacoes` no modo local; use `STORAGE_DIR` para alterar o local.

## Próximas etapas

- Ajustar o mapeamento automático quando chegar um PDF real da Porto Seguro.
- Adicionar OCR para os formatos reais que forem exclusivamente imagem.
- Avaliar importação de extrato bancário para conciliação automática, sem simulá-la antes da definição do formato.
- Evoluir anexos de comprovantes para armazenamento de arquivos, se necessário.

## Documentação

- [Escopo do MVP](docs/escopo-mvp.md)
- [Regras de negócio](docs/regras-de-negocio.md)
- [Arquitetura](docs/arquitetura.md)
- [Guia de desenvolvimento](docs/desenvolvimento.md)

## Autor

Desenvolvido por [Kawã Vinicius](https://github.com/Kawa-Vinicius-Dev) — ANAIV.
