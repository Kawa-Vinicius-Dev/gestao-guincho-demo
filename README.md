# Fluxo de Gestão

> Demo de um sistema de gestão financeira para empresas de guincho, desenvolvido pela **ANAIV**.

O sistema centraliza recebíveis, receitas, despesas, resultado por veículo e quilometragem não remunerada. O foco é dar ao gestor uma visão simples e confiável de **quanto entrou, quanto saiu e qual foi o lucro real da operação** — sem transformar o produto em um sistema de chamados.

## O que a demo resolve

- Organiza receitas, despesas e contas a receber;
- Mostra lucro operacional, margem e fluxo de caixa;
- Vincula combustível, manutenção e demais custos ao veículo;
- Compara gastos, faturamento e lucro por veículo;
- Controla km rodado, km remunerado e km morto;
- Calcula o custo do km morto;
- Consolida uma DRE mensal simplificada;
- Permite lançamentos por funcionários com aprovação administrativa;
- Simula importação de Excel e mantém a base preparada para relatórios da Porto Seguro.

## Como o resultado é calculado

```text
Lucro operacional = total de receitas - total de despesas

Margem de lucro = (lucro operacional / total de receitas) × 100

Lucro por veículo =
receitas do veículo
- combustível
- manutenção
- pedágios
- custo de km morto
- demais despesas vinculadas ao veículo
```

A DRE da demo organiza o resultado desta forma:

```text
Receita bruta
(-) custos variáveis
= margem operacional
(-) custos fixos
= lucro operacional
```

Categorias iniciais:

| Tipo | Categorias |
| --- | --- |
| Receitas | Serviços de guincho, Porto Seguro, outras seguradoras/parceiros, particulares e outras receitas |
| Custos variáveis | Combustível, pedágio, alimentação em serviço, km morto, comissão/diária e outros custos operacionais |
| Custos fixos | Manutenção, seguro, parcela de veículo, salários, contabilidade, internet/telefone e custos administrativos |

## Km rodado x km morto

- **Km rodado:** toda a quilometragem percorrida pelo veículo no período.
- **Km remunerado:** quilometragem que gera faturamento direto.
- **Km morto:** quilometragem sem faturamento direto, como deslocamento vazio ou retorno após serviço.

```text
Custo de km morto = km morto × custo por km

Percentual de km morto = (km morto / km rodado) × 100
```

O dashboard destaca o custo e o percentual de km morto, além de indicar os veículos que exigem atenção.

## Funcionalidades da demo

- Login por e-mail e senha, troca de senha, logout e perfis de Administrador e Funcionário;
- Dashboard com receita, despesas, lucro, margem, fluxo de caixa, contas a receber e alertas;
- Lançamentos de receitas e despesas, com vínculo por veículo;
- DRE mensal e resultado individual por veículo;
- Controle de frota: quilometragem, consumo, manutenção, seguro, parcela e rentabilidade;
- Lançamentos de combustível, manutenção, pedágio e km morto vinculados à frota;
- Cadastro de funcionários, veículos, motoristas, contratantes, categorias e usuários;
- Escala semanal e metas de faturamento, margem e redução de km morto;
- Fluxo de aprovação: funcionário lança o custo e o administrador aprova antes da entrada no financeiro;
- Importação simulada de Excel;
- Upload, histórico e conferência de PDFs da Porto Seguro;
- Relatórios exportáveis em CSV e visualização preparada para impressão.

## Fluxo para demonstrar ao cliente

1. Faça login como administrador.
2. Abra **Lançamentos** e cadastre uma receita ou despesa vinculada a um veículo.
3. Volte à **Visão geral** para conferir a atualização de lucro, margem, gráficos e indicadores.
4. Abra **DRE mensal** e confira a composição do resultado.
5. Em **Km rodado e morto**, registre a quilometragem e observe o custo ser calculado.
6. Consulte **Frota** para comparar gastos, receitas e lucro dos veículos.
7. Use **Importar Excel** para simular a entrada de dados.
8. Em **Integrações**, use **Restaurar dados da demo** para reiniciar a apresentação.

Telas da demo: dashboard, lançamentos, contas a receber, DRE, despesas, quilometragem, frota, funcionários, escala, metas, importação, relatórios e integrações futuras.

## Integrações e próximos passos

O sistema já possui a base para evoluir, mas alguns pontos dependem de dados reais da operação:

- Mapear automaticamente os campos quando chegar um PDF real da Porto Seguro;
- Adicionar OCR para PDFs que forem apenas imagem;
- Importar extratos bancários para conciliação automática, após definir o formato;
- Exportar documentos em PDF e Excel;
- Armazenar comprovantes e anexos;
- Evoluir a experiência mobile para funcionários.

> Até receber uma amostra real, a importação de PDF da Porto Seguro armazena o arquivo, extrai o texto disponível e exige conferência manual. Ela não cria lançamentos fictícios.

## Executar o frontend

O frontend usa a autenticação real do backend. Para desenvolvimento local, inicie também a API com o perfil `local` descrito abaixo.

```bash
cd frontend
npm install
npm run dev
```

Acesse [http://localhost:5173](http://localhost:5173).

- Administrador local: `admin@fluxogestao.local` / `Admin@123`

## Executar com backend e PostgreSQL

Requisitos: Java 21, Node.js 22.12+ e Docker Desktop (ou PostgreSQL 17 local).

```bash
docker compose up -d postgres

cd backend
./mvnw spring-boot:run

cd ../frontend
npm install
npm run dev
```

A API fica em `http://localhost:8080/api`.

Para modo local sem PostgreSQL:

```bash
cd backend
./mvnw spring-boot:run "-Dspring-boot.run.profiles=local"
```

## Tecnologias

- **Backend:** Java 21, Spring Boot, Spring Security, JPA, Bean Validation, PDFBox, Flyway e PostgreSQL.
- **Frontend:** React, TypeScript, Vite, React Router, Vitest e Testing Library.
- **Infraestrutura:** Docker Compose e PostgreSQL 17.

## Testes e build

```bash
cd backend
./mvnw test

cd ../frontend
npm test
npm run lint
npm run build
```

## Endpoints principais

| Área | Endpoint |
| --- | --- |
| Autenticação | `/api/auth` |
| Dashboard | `/api/dashboard` |
| Importações | `/api/importacoes` |
| Contas a receber | `/api/contas-receber` |
| Receitas | `/api/receitas` |
| Despesas | `/api/despesas` |
| Quilometragem | `/api/quilometragens` |
| Cadastros | `/api/veiculos`, `/api/motoristas`, `/api/contratantes`, `/api/categorias`, `/api/usuarios` |
| Relatórios CSV | `/api/relatorios/{tipo}.csv` |

## Documentação

- [Escopo do MVP](docs/escopo-mvp.md)
- [Regras de negócio](docs/regras-de-negocio.md)
- [Arquitetura](docs/arquitetura.md)
- [Guia de desenvolvimento](docs/desenvolvimento.md)
- [Fluxo Porto: OPs, calendário e pagamentos](docs/porto-fluxo-ops-e-pagamentos.md)

## Autor

Desenvolvido por [Kawã Vinicius](https://github.com/Kawa-Vinicius-Dev) — ANAIV.
