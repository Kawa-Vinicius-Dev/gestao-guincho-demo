# Migração para Supabase — onde paramos e o que falta

Documento de continuidade. O código da migração está todo na `main`, **desligado
por padrão**. Este arquivo descreve como ligá-lo com segurança.

## Estado atual

| Item | Situação |
| --- | --- |
| Código dos 14 módulos falando com o Supabase | ✅ Pronto |
| 21 migrations (tabelas, RLS, RPCs, índices, Storage) | ✅ Escritas e testadas |
| 1 Edge Function (`admin-usuarios`) | ✅ Escrita |
| Testes: 216 frontend, 196 verificações SQL | ✅ Passando |
| Chamadas ao backend antigo com tudo ligado | ✅ Zero, medido |
| **Aplicado no projeto Supabase real** | ❌ **Não** |
| **Auth, Storage e PostgREST testados de ponta a ponta** | ❌ **Não** |

As duas últimas linhas são o que falta. Enquanto `VITE_SUPABASE_MODULOS` não
existir na Vercel, o sistema roda inteiro pelo Render, como sempre rodou — o
`supabase-js` nem entra no bundle.

## Por que não aplicar direto em produção

**As migrations novas não sobem por cima do esquema antigo.** O banco atual foi
criado pelo Flyway; os dois modelos são incompatíveis, e a tentativa falha com
`relation "veiculos" already exists`. Adotar o esquema novo significa
**reconstruir o banco** — os dados atuais se perdem.

**A validação tem um buraco conhecido.** As regras foram testadas contra
PostgreSQL 16 com os papéis do Supabase simulados. Isso cobre RLS, RPCs e
constraints, mas **PostgREST, Auth e Storage nunca rodaram de verdade** — a
stack local do Supabase não sobe no ambiente de desenvolvimento usado. São 21
migrations e cerca de sessenta funções e políticas que vão encostar na API real
pela primeira vez. Espere ajustes nesse primeiro contato.

Por isso: **projeto de teste primeiro**. Um projeto Supabase novo no plano
gratuito custa zero e não arrisca nada.

## Passo a passo

### 1. Projeto de teste

Crie um projeto Supabase novo e vazio. Anote a *project ref* (o identificador na
URL do painel).

```bash
# a partir da raiz do repositório
./frontend/node_modules/.bin/supabase link --project-ref SEU-PROJETO-DE-TESTE
./frontend/node_modules/.bin/supabase db push
./frontend/node_modules/.bin/supabase functions deploy admin-usuarios
```

Depois rode `supabase/seed.sql` pelo SQL Editor do painel (categorias iniciais e
o contratante "Porto Seguro").

### 2. Primeiro administrador

No painel: **Authentication → Add user**.

> **Atenção:** em *User Metadata*, coloque `{"perfil": "ADMINISTRADOR"}`.
>
> O gatilho `provisionar_perfil` lê esse campo no mesmo commit em que o usuário
> nasce. Sem ele o perfil sai como `FUNCIONARIO`, e você entra sem conseguir
> fazer nada administrativo.

O sistema não cria usuário por SQL de propósito: isso exigiria escrever hash de
senha na mão em `auth.users`.

### 3. Preview da Vercel apontando para o teste

Crie um Preview (ou um projeto Vercel separado) com estas variáveis:

```dotenv
VITE_SUPABASE_URL=https://PROJETO-DE-TESTE.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...    # Settings -> API Keys -> Publishable
VITE_SUPABASE_MODULOS=auth,veiculos
VITE_API_URL=https://...onrender.com          # mantém o rollback possível
```

> A **Secret key** (`sb_secret_...`) não entra aqui, nem em lugar nenhum
> manualmente. Tudo que começa com `VITE_` é embutido no arquivo que o navegador
> baixa. A Edge Function recebe `SUPABASE_SERVICE_ROLE_KEY` automaticamente do
> próprio Supabase.

### 4. Validar, ligando os módulos aos poucos

Suba um módulo por vez em `VITE_SUPABASE_MODULOS`, nesta ordem. Se algum quebrar,
tire o nome da lista e republique — volta para o Render na hora.

```text
auth
  → veiculos, motoristas, categorias, contratantes
    → favoritos, dashboard
      → receitas, despesas, despesasFixas, quilometragem
        → comissoes, usuarios
          → porto
```

Nomes válidos: `auth`, `veiculos`, `motoristas`, `categorias`, `contratantes`,
`despesas`, `receitas`, `dashboard`, `comissoes`, `favoritos`, `quilometragem`,
`despesasFixas`, `porto`, `usuarios`. O valor `tudo` liga todos. O `auth` é
obrigatório junto com qualquer outro.

### 5. Checklist de validação

O que precisa ser exercitado de verdade, porque nunca foi:

- **Auth:** login, sessão sobrevivendo a refresh, logout, recuperação de senha.
- **Permissões:** entrar como `FUNCIONARIO` e confirmar que operação
  administrativa é negada — e que a tela trata a negativa sem quebrar.
- **Storage:** anexar comprovante numa despesa, baixar, e confirmar que um
  usuário não alcança arquivo de outro.
- **Edge Function:** criar usuário e redefinir senha pela tela de Configurações.
- **Porto:** importar um CSV real de cada tipo, conferir a prévia, confirmar, e
  verificar que reimportar o mesmo arquivo não duplica receita.
- **Financeiro:** comparar números do dashboard e da DRE com o que o Render
  mostra hoje, no mesmo período. Devem bater.
- **Mobile:** abrir as telas principais em largura de celular.

### 6. Produção

Só depois que o teste estiver limpo: repetir os passos 1 e 2 no projeto real
(reconstruindo o banco) e mover as variáveis para o projeto de produção da
Vercel.

Mantenha o Render no ar por alguns dias, com a `VITE_API_URL` configurada. O
rollback é tirar nomes da lista de módulos.

## Rollback

| Situação | Ação |
| --- | --- |
| Um módulo com problema | Tirar o nome de `VITE_SUPABASE_MODULOS` e republicar |
| Voltar tudo | Apagar `VITE_SUPABASE_MODULOS` |
| Desligar o Render de vez | Só então apagar `VITE_API_URL` |

Enquanto a `VITE_API_URL` existir e o serviço do Render estiver no ar, a volta é
imediata e não exige mexer em código.

## Dívida técnica registrada

Comportamentos preservados do Spring por decisão explícita de não alterar regra
de negócio durante a migração. Não são falhas de RLS — são regras frouxas que
valem revisitar depois:

- **Um administrador pode aprovar a própria despesa.** O `aprovar()` do Spring
  não tem a guarda que o `rejeitar()` tem. O banco garante que a aprovação passe
  somente pela RPC, que carimba quem aprovou.
- **Reaprovar uma despesa já aprovada é permitido** (apenas recarimba autor e
  data).
- **"Programado", no resumo da Porto, conta toda OP com data de pagamento
  marcada**, recebida ou não — o que faz o número repetir o "Previsto".

Os três estão afirmados como tal nos testes SQL, com comentário explicando.

## Pendência de formato

As exportações do módulo Porto saíam em XLSX (Apache POI) e PDF (PDFBox) pelo
backend. No modo Supabase saem em **CSV**, montado no navegador. É uma mudança
visível para quem usa. Se XLSX/PDF for requisito, precisa ser reavaliado — as
opções são uma biblioteca no bundle (custa a todos que abrem a tela) ou uma Edge
Function (gasta invocação).
