# Fluxo de Gestão

> Sistema de gestão financeira para empresas de guincho, desenvolvido pela **ANAIV**.

O sistema centraliza recebíveis, receitas, despesas, resultado por veículo e quilometragem não remunerada. O foco é dar ao gestor uma visão simples e confiável de **quanto entrou, quanto saiu e qual foi o lucro real da operação** — sem transformar o produto em um sistema de chamados.

## O que o sistema resolve

- Organiza receitas, despesas e contas a receber;
- Mostra lucro operacional, margem e fluxo de caixa;
- Vincula combustível, manutenção e demais custos ao veículo;
- Compara gastos, faturamento e lucro por veículo;
- Controla km rodado, km remunerado e km morto;
- Calcula o custo do km morto;
- Consolida uma DRE mensal simplificada;
- Permite lançamentos por funcionários com aprovação administrativa;
- Importa e concilia relatórios da Porto Seguro (OS, OP, comissões e calendário de pagamento).

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

## Funcionalidades

- Login por e-mail e senha, troca de senha, logout e perfis de Administrador e Funcionário;
- Dashboard com receita, despesas, lucro, margem, fluxo de caixa, contas a receber e alertas;
- Lançamentos de receitas e despesas, com vínculo por veículo;
- DRE mensal e resultado individual por veículo;
- Controle de frota: quilometragem, consumo, manutenção, seguro, parcela e rentabilidade;
- Lançamentos de combustível, manutenção, pedágio e km morto vinculados à frota;
- Cadastro de funcionários, veículos, motoristas, contratantes, categorias e usuários;
- Escala semanal e metas de faturamento, margem e redução de km morto;
- Fluxo de aprovação: funcionário lança o custo e o administrador aprova antes da entrada no financeiro;
- Anexo de comprovante (PDF, JPG, PNG ou WEBP) em cada despesa, guardado fora do servidor;
- Importação, conciliação e comissionamento de relatórios da Porto Seguro (OS, OP e calendário de pagamento);
- Backup diário do banco e exportação sob demanda em Excel de todos os módulos;
- Relatórios exportáveis em CSV e visualização preparada para impressão.

## Fluxo básico de uso

1. Faça login como administrador.
2. Abra **Lançamentos** e cadastre uma receita ou despesa vinculada a um veículo.
3. Volte à **Visão geral** para conferir a atualização de lucro, margem, gráficos e indicadores.
4. Abra **DRE mensal** e confira a composição do resultado.
5. Em **Km rodado e morto**, registre a quilometragem e observe o custo ser calculado.
6. Consulte **Frota** para comparar gastos, receitas e lucro dos veículos.
7. Use **Importar Excel** para lançar dados em lote.

## Próximos passos

O sistema já possui a base para evoluir, mas alguns pontos dependem de dados reais da operação:

- Mapear automaticamente os campos quando chegar um PDF real da Porto Seguro;
- Adicionar OCR para PDFs que forem apenas imagem;
- Importar extratos bancários para conciliação automática, após definir o formato;
- Exportar documentos em PDF;
- Evoluir a experiência mobile para funcionários.

> Até receber uma amostra real, a importação de PDF da Porto Seguro armazena o arquivo, extrai o texto disponível e exige conferência manual. Ela não cria lançamentos fictícios.

## Arquitetura

O sistema roda em **duas arquiteturas dentro do mesmo código**, escolhidas por variável de ambiente.

```text
Modo Render (original)
navegador → Vercel → Render (Spring Boot) → Supabase (PostgreSQL)

Modo Supabase (atual)
navegador → Vercel → Supabase (PostgREST, Auth, Storage)
```

O banco sempre foi o Supabase. A migração não trocou de banco — removeu a camada do meio. O Spring recebia a requisição, consultava o Supabase e devolvia; na maior parte dos endpoints, sem regra própria no caminho. Onde havia regra de verdade — aprovação de despesa, conciliação da Porto, cálculo de comissão — ela **desceu para o banco** como função PostgreSQL, onde vale para qualquer cliente que se conecte, e não apenas para quem passa pela API.

### Por que

**Um salto a menos em cada requisição.** `navegador → Render → Supabase → Render → navegador` virou `navegador → Supabase`. Some a ida e volta entre duas hospedagens que podem estar em regiões diferentes.

**Partida a frio.** No plano gratuito do Render o serviço hiberna após alguns minutos ociosos, e acordar uma aplicação Spring Boot leva dezenas de segundos. Para um sistema de uso esparso, é o visitante que paga essa conta. O Supabase não hiberna.

**Autorização no lugar certo.** Com o Spring no meio, a segurança vivia no `@PreAuthorize`: quem falasse com o banco por fora da API não encontrava barreira nenhuma. Foi o que a auditoria mostrou — com os grants padrão do Supabase e sem RLS, o papel `anon` conseguia ler `despesas`, `contas_receber` e o hash de senha dos usuários. Movendo a autorização para políticas RLS, a regra passa a valer independentemente do caminho.

### Como a troca funciona

Cada módulo tem as duas implementações lado a lado em `frontend/src/dados/`, e a variável decide qual roda:

```dotenv
VITE_SUPABASE_MODULOS=auth,veiculos,motoristas,despesas,porto
# ou "tudo" para ligar todos
```

Voltar atrás é tirar um nome da lista e republicar o frontend — sem mexer em código e sem redeploy do backend. Isso permitiu migrar módulo a módulo, com rollback imediato a cada passo.

O `auth` é exigido junto com qualquer outro módulo: as políticas identificam quem chama pelo JWT do Supabase, então um módulo ligado sem a sessão correspondente chegaria ao banco como visitante e seria negado — corretamente, mas em tempo de execução. Falhar na configuração é melhor do que falhar na tela.

### O que foi para onde

A escolha seguiu uma ordem fixa: o recurso mais simples que resolve com segurança.

| Necessidade | Solução | Por quê |
| --- | --- | --- |
| CRUD (veículos, motoristas, cadastros, lançamentos) | Consulta direta + RLS | Não há regra além de "quem pode ver o quê", e isso é exatamente o que RLS expressa |
| Agregações (dashboard, DRE, resumos, comissões) | Função PostgreSQL (RPC) | Agregar é trabalho do banco; evita trazer milhares de linhas para somar no navegador |
| Conciliação da Porto | View + RPC | O status de cada OP é derivado da comparação com a soma das OSs |
| Arquivos (comprovantes, importações) | Supabase Storage | Binário não vai para dentro do PostgreSQL |
| Leitura de CSV e geração de relatório | Navegador | Processamento de texto, sem segredo e sem privilégio |
| Criar usuário / redefinir senha | **Edge Function** | Único caso com necessidade real de privilégio de servidor |

**Uma única Edge Function** em todo o sistema (`admin-usuarios`). Criar um usuário exige a chave `service_role`, que não pode existir no navegador — esse é um privilégio que realmente precisa de servidor. Todo o resto foi resolvido sem gastar invocação.

O dashboard ilustra a diferença de abordagem: em vez de várias consultas e a soma no navegador, uma chamada a `dashboard_resumo` devolve financeiro e Porto já calculados, num payload compacto.

### Segurança

- **RLS habilitado em todas as tabelas expostas**, com política por operação.
- **A chave `service_role` nunca vai para o frontend.** O cliente recusa a chave na partida se ela for de serviço, como rede de proteção — mas a regra é não configurá-la. O navegador usa apenas a `anon`, que sozinha não abre nada: quem decide é a política.
- **Colunas de aprovação fora do `GRANT` de UPDATE.** RLS filtra *linhas*; não impede escrever numa *coluna* da linha que você já pode editar. A auditoria encontrou exatamente esse furo: a segregação de funções vivia só dentro da RPC, e um UPDATE direto passava por cima. A correção foi remover `status`, `aprovada`, `aprovado_por` e `aprovado_em` do grant — aprovar só pela RPC, que carimba quem aprovou.
- **Suíte adversarial** (`supabase/tests/40_ataque.sql`): visitante não autenticado lendo dados, usuário comum tentando operação administrativa, troca manual de IDs, acesso a arquivo alheio, escrita direta em coluna protegida.

### Desempenho: uma lição que rendeu

Funções `STABLE` dentro do `USING` de uma política RLS são avaliadas **uma vez por linha**. Envolvendo a chamada num subselect escalar — `(select e_administrador())` — o planejador a transforma em `InitPlan` e avalia uma vez só por consulta.

Medido numa tabela de 9.600 linhas: **206,9 ms → 1,87 ms**. A migração `20260915090000_rls_avaliacao_unica.sql` aplica o padrão a todas as políticas e separa os `FOR ALL` por operação, que dobravam a avaliação onde já existia política de SELECT.

### Estado atual e limites

Registro honesto do que está pronto e do que não está:

- O modo Supabase está **implementado e testado, mas ainda não publicado**. O ambiente no ar continua no modo Render.
- A validação do banco rodou contra **PostgreSQL 16 com o ambiente Supabase emulado** (papéis, `auth`, `storage`). Cobre RLS, RPCs e constraints, mas **não** exercitou PostgREST, GoTrue e Storage de ponta a ponta — a stack local do Supabase não sobe no ambiente de desenvolvimento usado.
- As 21 migrations novas **não se aplicam por cima do esquema Flyway existente**: os dois modelos são incompatíveis, e a adoção passa por reconstruir o banco.
- Algumas regras de negócio do Spring foram **preservadas mesmo parecendo frouxas**, por decisão explícita de não alterar comportamento durante a migração. A principal: um administrador pode aprovar a própria despesa (o `aprovar()` do Spring não tem a guarda que o `rejeitar()` tem). Está registrada como dívida técnica nos próprios testes, não corrigida.

### Por que o Spring continua aqui

O backend Java permanece no repositório, **inalterado**: 147 arquivos, 21 migrations Flyway, 44 arquivos de teste. Ele não é código morto — é a outra metade do interruptor, e continua funcional.

Manter as duas arquiteturas vivas no mesmo código foi o que tornou a migração reversível a cada passo, e é o que permite comparar as duas na prática.

## Executar o frontend

A autenticação é real nos dois modos. Sem `VITE_SUPABASE_MODULOS` definida, o
frontend fala com o backend Spring — então inicie também a API com o perfil
`local` descrito abaixo. Com os módulos ligados, basta o projeto Supabase.

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

## Publicação

O frontend é publicado pela Vercel nos dois modos. O que muda é quem atende as
requisições.

### Modo Supabase

Na Vercel, apenas três variáveis — e todas são públicas por natureza, porque
tudo que começa com `VITE_` é embutido no arquivo que o navegador baixa:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=chave-anon-do-projeto
VITE_SUPABASE_MODULOS=tudo
```

> A chave `service_role` e a senha do banco **não entram aqui**, em hipótese
> nenhuma. Elas ignoram as políticas RLS; no navegador, seriam o banco inteiro
> aberto para qualquer visitante. Pertencem ao servidor, e só a ele.

Além disso: aplicar as migrations de `supabase/migrations/` no projeto e publicar
a Edge Function `supabase/functions/admin-usuarios`.

### Modo Render (backend Spring)

O Render usa o `Dockerfile` da raiz para construir o backend, que continua localizado em `backend/`. O frontend permanece publicado separadamente pelo Vercel. O banco PostgreSQL é hospedado no Supabase.

Configure manualmente estas variáveis no serviço do Render, sem adicioná-las ao Git:

```dotenv
DATABASE_URL=jdbc:postgresql://host:5432/database
DATABASE_USERNAME=usuario
DATABASE_PASSWORD=senha-segura
ADMIN_EMAIL=administrador@empresa.com
ADMIN_PASSWORD=senha-forte
CORS_ALLOWED_ORIGINS=https://projeto.vercel.app
SESSION_HOURS=12
SUPABASE_STORAGE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_STORAGE_SERVICE_ROLE_KEY=chave-service-role-do-supabase
SUPABASE_STORAGE_BUCKET=comprovantes
```

> Nenhum arquivo enviado por usuário (comprovante de despesa, PDF de importação legado ou CSV/TXT da Porto) é gravado em disco local do servidor — todos vão direto para o Supabase Storage (bucket privado `comprovantes`, criado manualmente no painel do Supabase, com um prefixo por origem). Isso os torna duráveis a qualquer redeploy ou restart do Render, que tem disco efêmero.

O Render fornece `PORT` automaticamente. Em execução local, o backend continua aceitando `SERVER_PORT` e usa a porta `8080` quando nenhuma das variáveis está definida.

O banco não tem backup automático no plano gratuito do Supabase. Um dump diário roda por fora, num repositório dedicado: veja [gestao-adm-backups](https://github.com/Kawa-Vinicius-Dev/gestao-adm-backups).

## Tecnologias

- **Frontend:** React, TypeScript, Vite, React Router, Vitest, Testing Library e supabase-js.
- **Banco e plataforma:** Supabase — PostgreSQL, RLS, funções PL/pgSQL, PostgREST, Auth, Storage e uma Edge Function (Deno).
- **Backend (modo Render):** Java 21, Spring Boot, Spring Security, JPA, Bean Validation, PDFBox, Flyway e PostgreSQL.
- **Infraestrutura:** Vercel (frontend), Render (backend), Docker Compose e PostgreSQL para desenvolvimento local.

## Testes e build

```bash
cd frontend
npm test          # 210 testes
npm run lint
npm run build

cd ../backend
./mvnw test
```

As regras que vivem no banco têm suíte própria, em SQL, aplicada sobre um banco
reconstruído do zero a cada execução — **196 verificações** no total:

| Arquivo | O que cobre |
| --- | --- |
| `supabase/tests/10_seguranca.sql` | Papéis, RLS e permissão por operação |
| `supabase/tests/20_funcional.sql` | Colunas geradas, RPCs e fluxos de leitura |
| `supabase/tests/30_financeiro.sql` | Totais, acumulados, períodos e indicadores |
| `supabase/tests/40_ataque.sql` | Tentativas de acesso indevido, feitas direto no banco |
| `supabase/tests/50_importacao_porto.sql` | Importação da Porto: idempotência, divergência e criação de receita |

Um teste de frontend (`src/test/render-zero.test.tsx`) abre cada rota da aplicação
e registra toda chamada que sai para o backend antigo. Com todos os módulos
ligados, o resultado é zero — e se alguma dependência voltar, por onde for, o
teste acusa.

## Endpoints principais

Rotas do backend Spring, usadas no modo Render. No modo Supabase o frontend
conversa com PostgREST, Auth e Storage, e as operações correspondentes estão em
`frontend/src/dados/`.

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
- [Migração para Supabase: onde paramos e o que falta](docs/migracao-supabase-proximos-passos.md)

## Autor

Desenvolvido por [Kawã Vinicius](https://github.com/Kawa-Vinicius-Dev) — ANAIV.
