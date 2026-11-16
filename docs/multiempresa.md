# Multiempresa

Desde 14/11/2026 o mesmo banco atende várias empresas de guincho. Cada uma só
enxerga os próprios dados; a ANAIV tem um painel para cadastrar, contar e bloquear.

## Quem é quem

| Papel | Onde fica | O que alcança |
|---|---|---|
| **Gestor** | `perfis.perfil = 'ADMINISTRADOR'` | A empresa inteira dele: financeiro, frota, Porto, equipe. Uma empresa pode ter mais de um. |
| **Socorrista** | `perfis.perfil = 'FUNCIONARIO'` | O que já alcançava, dentro da empresa dele. |
| **Desenvolvedor (ANAIV)** | tabela `desenvolvedores` | Só `/plataforma`: empresas, contagens, contas. Não lê receita, despesa, OS nem cliente. |

O cliente que já usava o sistema é a empresa nº 1
(`00000000-0000-0000-0000-000000000001`, código `jms`) e ficou com todos os dados.

## Como o isolamento funciona

Tudo no banco; a tela não participa da decisão.

1. **`empresa_id` em todas as tabelas**, preenchido sozinho por `empresa_atual()`
   (a empresa do perfil de quem está logado). Nenhuma tela informa a empresa.
2. **Uma policy restritiva por tabela** (`mesma_empresa`): soma com AND às policies
   que já existiam. Elas decidem "quem dentro da empresa"; esta decide "qual empresa".
3. **Funções `SECURITY DEFINER` rodam como `funcoes_internas`**, um papel que não
   ignora RLS. Dashboard, DRE, comissão e conciliação passam a ver só a empresa de
   quem chamou, sem reescrever as funções.
4. **Gatilho `mesma_empresa`**: recusa apontar para registro de outra empresa
   (ex.: despesa com a viatura de outra), porque chave estrangeira não passa por RLS.
5. **Arquivos**: o caminho (`despesas/<id>/…`, `turnos/<id>/…`, `porto/<id>/…`)
   precisa levar a um registro que a pessoa enxerga.
6. **Edge Functions** (`admin-usuarios`, `avisos`) usam a service_role, que ignora
   RLS; por isso conferem a empresa de quem chama em cada ação.

Empresa bloqueada: `empresa_atual()` devolve nulo, toda policy responde falso e a
tela de login avisa que o acesso está suspenso. Nada é apagado.

## Regra para toda migration nova

- Tabela nova: coluna `empresa_id uuid not null default public.empresa_atual()
  references public.empresas (id)`, a policy restritiva `mesma_empresa` e a policy
  `funcoes_internas_tudo` (copie de `20261114120000_multiempresa.sql`, seção 4).
- Função `SECURITY DEFINER` nova: termine a migration com
  `select public.entregar_funcoes_ao_executor();`.
- Índice único novo: comece por `empresa_id`.

Quem esquecer é pego pela suíte `99t_multiempresa.sql`, que roda em toda PR.

## Colocar em produção

Ordem segura (a tela nova funciona com o banco antigo; o contrário também):

1. **Cópia dos dados** (Configurações → Cópia) e confirmar o backup do Supabase.
2. **Testar numa branch do Supabase** antes da produção. As suítes rodam num
   Postgres local com superusuário; em produção quem aplica é o papel `postgres`
   do Supabase, que não é superusuário. O ponto a conferir é a seção 3 e 12 da
   migration (`create role`, `grant … to funcoes_internas`, `alter function … owner to`).
3. Aplicar `20261114120000_multiempresa.sql` pelo mesmo caminho das migrations
   recentes (ver `docs/revisao-2026-11-11.md`, item "Migrations em produção").
4. Publicar as Edge Functions: `supabase functions deploy admin-usuarios avisos`.
5. Publicar o frontend (Vercel).
6. Criar o seu acesso de desenvolvedor (abaixo).
7. Conferir como gestor da empresa nº 1: Visão geral, DRE, Comissões, uma
   importação da Porto, abrir um comprovante, criar e encerrar um acesso.

### Criar o acesso de desenvolvedor

No painel do Supabase: Authentication → Add user (e-mail e senha fortes, sem
metadados). Conta criada sem empresa não ganha perfil. Depois, no SQL Editor:

```sql
insert into public.desenvolvedores (usuario_id, nome)
select id, 'Kawã' from auth.users where email = 'SEU_EMAIL';
```

Ao entrar, o sistema leva direto para `/plataforma`.

## Vender para uma empresa nova

Em `/plataforma` → **Cadastrar empresa**: nome da empresa, nome e e-mail do gestor.
A empresa nasce com as categorias básicas, o contratante "Porto Seguro" e a comissão
padrão de 20%. O gestor recebe uma senha provisória (aparece uma vez) e monta a
equipe dele em **Equipe**, como o cliente atual já faz.

Link de avaliação de cada empresa: `/avaliar?e=<código>` (aparece em Visão geral →
Avaliações). O link antigo, sem código, continua sendo o da empresa nº 1.

## Pendências (decisão do Kawã)

- **Marca**: login, título da aba, ícone do app instalado e a página de troca de
  senha ainda dizem "J M S". O menu e a página de avaliação já mostram o nome da
  empresa. Falta decidir o nome do produto para quem não é a JMS.
- **Cadastro público está desligado no Supabase Auth?** Tem que estar. O banco já
  não dá perfil a quem se cadastra sozinho, mas a conta ficaria criada à toa.
- **Limite de usuários por empresa** e **cobrança**: fora desta versão. Hoje o
  controle é bloquear/reativar a empresa.
- **Suporte entrando como a empresa**: decidido que não (o desenvolvedor só vê
  contagens). Para investigar um problema, o gestor precisa mostrar a tela.
- **Aviso "empresa bloqueada" para quem já está logado**: a pessoa passa a ver as
  telas vazias até o token renovar ou ela entrar de novo; só o login explica o motivo.
