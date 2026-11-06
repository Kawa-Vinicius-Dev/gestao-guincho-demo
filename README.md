# Fluxo de Gestão

> Gestão financeira para empresas de guincho, feita pela **ANAIV**. Em uso pelo cliente.

[![CI](https://github.com/Kawa-Vinicius-Dev/gestao-guincho-demo/actions/workflows/ci.yml/badge.svg)](https://github.com/Kawa-Vinicius-Dev/gestao-guincho-demo/actions/workflows/ci.yml)

**[Abrir o sistema](https://jms-sistema-anaiv.vercel.app/login)** (login restrito ao cliente)

O dono de uma frota de guinchos sabe quanto faturou, mas não sabe quanto cada caminhão deu de lucro de verdade. O Fluxo de Gestão mostra **quanto entrou, quanto saiu e o lucro real de cada viatura**, contando até os quilômetros rodados sem receber, e concilia os pagamentos da Porto Seguro com os serviços feitos.

São dois públicos no mesmo sistema:

- **O dono**, no computador: financeiro, frota, Porto Seguro, comissões e equipe.
- **O socorrista**, no celular (app instalável): abre o turno, lança despesa com foto do comprovante e acompanha a própria comissão.

## Destaques técnicos

- **Saí de Spring Boot no Render para Supabase direto, módulo por módulo**, com rollback por variável de ambiente a cada passo. A migração terminou em setembro de 2026 e hoje o frontend fala só com o Supabase.
- **Segurança no banco, não na API:** RLS em todas as tabelas e uma suíte de ataque que roda direto no banco, como quem abre o console do navegador com a anon key.
- **Uma consulta caiu de 206,9 ms para 1,87 ms** numa tabela de 9.600 linhas, corrigindo como as políticas RLS eram avaliadas.
- **Regras de dinheiro em funções PostgreSQL** (dashboard, DRE, comissões, conciliação), testadas por mais de 30 suítes SQL que rodam em toda PR.

## O que o sistema faz

### Para o dono

- **Financeiro:** receitas, despesas, contas a receber, fluxo de caixa e DRE mensal. Despesas fixas entram sozinhas no vencimento, com parcela e juros.
- **Resultado por viatura:** receita menos combustível, manutenção, pedágio, km morto e demais custos vinculados ao veículo.
- **Km rodado x km morto:** km de cada serviço pelo odômetro e o custo do km rodado sem faturar.
- **Porto Seguro:** importação de OS e OP, conciliação (previsto x programado x recebido), pendências, contestações e devolvidos.
- **Comissões:** percentual por socorrista ou por OP, com teto de 20%. A OP fechada guarda a taxa da época.
- **Aprovações:** o funcionário lança e o administrador aprova antes de entrar no financeiro, sem autoaprovação.
- **Frota e equipe:** manutenção e danos, documentos, multas (o sistema acha quem estava com a viatura pelo turno), desempenho por viatura e por socorrista.
- **Avaliações:** o cliente atendido dá a nota em `/avaliar` e o dono acompanha na visão geral.

### Para o socorrista

- Turno com quilometragem pelo odômetro e checklist da viatura.
- Despesa com comprovante pela câmera ou arquivo.
- Minha comissão: produção e o que já foi pago.
- Avisos no celular (Web Push) quando uma despesa ou um turno é aprovado ou devolvido.

## Como o resultado é calculado

```text
Lucro operacional  = receitas - despesas
Margem             = lucro operacional / receitas × 100
Lucro por viatura  = receitas da viatura - combustível - manutenção - pedágios
                     - custo do km morto - demais despesas da viatura

Custo do km morto  = km morto × custo por km
% de km morto      = km morto / km rodado × 100
```

A DRE segue: receita bruta, (-) custos variáveis, = margem operacional, (-) custos fixos, = lucro operacional.

Regras completas em [docs/regras-de-negocio.md](docs/regras-de-negocio.md).

## Arquitetura

```text
navegador (React, PWA) → Vercel → Supabase (PostgreSQL + RLS, PostgREST, Auth, Storage, Edge Functions)
```

### De onde veio

O sistema nasceu como `navegador → Vercel → Render (Spring Boot) → Supabase`. O banco sempre foi o Supabase; a migração removeu a camada do meio. Na maior parte dos endpoints o Spring só repassava a consulta. Onde havia regra de verdade (aprovação de despesa, conciliação da Porto, comissão), ela **desceu para o banco** como função PostgreSQL, valendo para qualquer cliente que se conecte.

Por quê:

- **Um salto a menos** em cada requisição, entre hospedagens que podiam estar em regiões diferentes.
- **Sem partida a frio:** no plano gratuito o Render hiberna, e acordar o Spring levava dezenas de segundos.
- **Autorização no lugar certo:** com a segurança só no `@PreAuthorize`, quem falasse com o banco por fora da API passava direto. A auditoria mostrou o papel `anon` lendo despesas, contas a receber e hash de senha. Com RLS, a regra vale por qualquer caminho.

Durante a migração, cada módulo teve as duas implementações lado a lado em `frontend/src/dados/`, e uma variável de ambiente decidia qual rodava. Voltar atrás era tirar um nome da lista e republicar. Quando todos os módulos estavam no Supabase, o caminho do Render saiu do frontend (PR #115).

O backend Spring continua em `backend/` e roda no CI. Ele é o registro da versão anterior; o sistema no ar não depende dele.

### O que foi para onde

O critério: o recurso mais simples que resolve com segurança.

| Necessidade | Solução |
| --- | --- |
| CRUD (viaturas, cadastros, lançamentos) | Consulta direta + RLS |
| Agregações (dashboard, DRE, comissões) | Função PostgreSQL (RPC): uma chamada, conta feita no banco |
| Conciliação da Porto | View + RPC |
| Comprovantes e importações | Supabase Storage, bucket privado |
| Leitura de CSV e relatórios | Navegador |
| Criar usuário / redefinir senha | Edge Function `admin-usuarios` (precisa da `service_role`) |
| Avisos no celular | Edge Function `avisos` (Web Push com chaves VAPID) |

### Segurança

- **RLS em todas as tabelas expostas**, com política por operação.
- **A `service_role` nunca vai para o navegador.** O cliente recusa a chave na partida se ela for de serviço; o navegador usa só a `anon`, que sozinha não abre nada.
- **Colunas de aprovação fora do `GRANT` de UPDATE.** RLS filtra linhas, não colunas: um UPDATE direto conseguia aprovar a própria despesa. Agora `status`, `aprovada`, `aprovado_por` e `aprovado_em` só mudam pela RPC, que carimba quem aprovou.
- **O texto dos avisos sai do banco**, não do corpo da chamada: a função confere se quem chamou fez mesmo a ação.
- **Suíte adversarial** ([supabase/tests/40_ataque.sql](supabase/tests/40_ataque.sql)): visitante sem login, funcionário em operação de administrador, troca de IDs, arquivo alheio e escrita direta em coluna protegida.

### Desempenho

Funções `STABLE` no `USING` de uma política RLS são avaliadas **uma vez por linha**. Envolvidas num subselect escalar, `(select e_administrador())`, viram `InitPlan` e são avaliadas uma vez por consulta.

Numa tabela de 9.600 linhas: **206,9 ms → 1,87 ms**. A migration `20260915090000_rls_avaliacao_unica.sql` aplica o padrão a todas as políticas e separa os `FOR ALL` por operação, que dobravam a avaliação.

## Testes e CI

Toda PR roda três jobs no GitHub Actions:

| Job | O que roda |
| --- | --- |
| `banco` | Cada suíte de [supabase/tests](supabase/tests/README.md) num PostgreSQL 16 recém-criado, com todas as migrations aplicadas do zero |
| `frontend` | Lint, testes (Vitest + Testing Library) e build |
| `backend` | Testes do Spring Boot (perfil `test`, H2 em memória) |

As suítes SQL cobrem RLS, ataques, dinheiro (períodos, atraso, comissão, parcelas), importação da Porto e a cópia dos dados. O que cada uma confere está em [supabase/tests/README.md](supabase/tests/README.md).

Um teste de frontend (`src/test/render-zero.test.tsx`) abre cada rota e registra toda chamada que sai para o backend antigo. O resultado esperado é zero.

## Rodar localmente

Requisitos: Node.js 22.12+ e um projeto Supabase com as migrations aplicadas.

```bash
cd frontend
npm install
npm run dev
```

Em `frontend/.env.local`:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=chave-anon-do-projeto
```

Para rodar as suítes do banco sem Supabase, basta um PostgreSQL 16: [supabase/tests/README.md](supabase/tests/README.md) explica como.

Backend Spring (opcional, só para estudo): Java 21 e `cd backend && ./mvnw test`. Detalhes em [docs/desenvolvimento.md](docs/desenvolvimento.md).

## Publicação

- **Frontend:** Vercel, com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Tudo que começa com `VITE_` vai para o navegador, então a `service_role` e a senha do banco **nunca** entram aqui.
- **Banco:** aplicar `supabase/migrations/` no projeto.
- **Edge Functions:** publicar `admin-usuarios` e `avisos`, e definir `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` com `supabase secrets set`.
- **Backup:** o plano gratuito do Supabase não faz backup. Um dump diário roda pelo GitHub Actions num repositório privado separado, e o sistema exporta os dados em Excel sob demanda.

## Tecnologias

- **Frontend:** React, TypeScript, Vite, React Router, supabase-js, Vitest e Testing Library. PWA com service worker e Web Push.
- **Banco e plataforma:** Supabase: PostgreSQL, RLS, PL/pgSQL, PostgREST, Auth, Storage e Edge Functions (Deno).
- **Backend anterior:** Java 21, Spring Boot, Spring Security, JPA, Flyway e PDFBox.
- **Infra:** Vercel, GitHub Actions e Docker Compose para desenvolvimento.

## Documentação

- [Regras de negócio](docs/regras-de-negocio.md)
- [Arquitetura](docs/arquitetura.md)
- [Fluxo Porto: OPs, calendário e pagamentos](docs/porto-fluxo-ops-e-pagamentos.md)
- [Comissões dos funcionários](docs/comissoes-funcionarios.md)
- [Padrões de tela](docs/padroes-de-tela.md)
- [Escopo do MVP](docs/escopo-mvp.md)
- [Guia de desenvolvimento](docs/desenvolvimento.md)
- [Migração para o Supabase](docs/migracao-supabase-proximos-passos.md)

## Autor

Desenvolvido por [Kawã Vinícius](https://github.com/Kawa-Vinicius-Dev), ANAIV. Portfólio: [kawa-vinicius.vercel.app](https://kawa-vinicius.vercel.app/).
