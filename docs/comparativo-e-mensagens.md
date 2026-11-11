# Comparativo com apps do mercado e mensagens de exceção

Pesquisa feita em 11/11/2026. Onde a fonte é página de fabricante, está dito. Onde
**não achei material público** (Uber e Nubank sobre mensagens de erro), está dito
também: nada aqui foi inventado.

## 1. O que o mercado faz e o que o sistema faz

| Tema | Mercado (fonte) | Sistema hoje | Lacuna |
|---|---|---|---|
| **Trabalhar sem sinal** | O app do motorista do Uber tem um "modo otimista": o motorista termina a corrida sem conexão e o app sincroniza depois ([Uber Engineering](https://www.uber.com/blog/driver-app-optimistic-mode)). A documentação do ServiceTitan diz que status do serviço, fotos, notas e assinaturas funcionam offline e sincronizam depois ([ServiceTitan](https://help.servicetitan.com/mobile/docs/servicetitan-field-mobile-app-offline-capabilities)). | Sem internet a ação falha na hora. Agora a tela diz "Sem conexão com a internet. Confira o sinal e tente de novo." (antes: "Failed to fetch"). | **Resolvida** para iniciar/finalizar serviço e a foto do início: ver `docs/fila-offline.md`. Continua sem fila: abrir/fechar turno, despesas e danos. |
| **Fotos e danos no atendimento** | Towbook anexa fotos com hora e GPS, organizadas pelo status em que foram tiradas, e tem relatório de dano com marcação no veículo ([Towbook](https://towbook.com/features)); o Swoop (Agero) inclui fotos, assinatura e termo de dano ([Agero](https://agero.com/tow-management-software)). | Checklist com fotos do painel, serviços com foto de km e registro de danos. | Sem lacuna de funcionalidade. Falta só a fila offline acima. |
| **Status do serviço** | Swoop/Agero: aceitar/recusar chamado e atualizar status pelo app, com notificações ([Agero](https://info.agero.com/agero-faqs/dispatching-jobs)). | Iniciar/finalizar serviço, com bloqueio de dois serviços abertos. | Nenhuma notificação ao socorrista (push). Sugestão, não urgência. |
| **Checklists e formulários** | ServiceTitan e Jobber citam formulários/checklists digitais e registro de tempo (blogs de comparação, **não** documentação oficial da Jobber). | Checklist de saída por fotos obrigatórias. | Sem lacuna relevante. |
| **Mensagens de erro** | NN/g: visíveis perto da origem, claras, precisas, educadas, sem culpar o usuário, com conselho construtivo ([NN/g](https://www.nngroup.com/articles/error-message-guidelines/)). Padrão "o que houve, por quê, o que fazer" ([Atlassian](https://atlassian.design/content/writing-guidelines)). Em formulário: mensagem junto ao campo e resumo no topo ([W3C](https://design-system.w3.org/styles/form-errors.html)). | Ver seção 2: boa base, três lacunas corrigidas neste PR. | Acentos e tom inconsistentes nas mensagens do banco (seção 3). |

**O que não consegui verificar:** diretrizes públicas de erro do **Uber** e do **Nubank**
(só achei vagas de designer de conteúdo do Nubank, sem as regras) e se o Towbook/Swoop
funcionam offline (não há afirmação clara). Nesses pontos use o NN/g como régua.

## 2. Como as exceções chegam à tela

Fluxo: o banco levanta o erro, `erroDoBanco` (`frontend/src/dados/cliente.ts`) traduz,
a página mostra `e.message`.

| Origem | Tradução |
|---|---|
| Cadastro repetido (23505) | "Já existe um veículo com esta placa.", por constraint |
| Vínculo (23503) | "Não dá para excluir… Desative em vez de excluir." |
| Valor inválido (23514) | "O valor não pode ser negativo." |
| Sem permissão (42501, RLS) | "Você não tem permissão para esta operação." |
| `raise exception` (P0001) | passa a frase escrita no banco (163 textos distintos) |
| Linha sumiu (PGRST116) | "Este item não existe mais. Atualize a tela." |
| Senha errada | "E-mail ou senha incorretos." (de propósito não diz qual) |

**Lacunas achadas e corrigidas neste PR (só texto exibido, nenhuma regra):**

1. **Sem internet:** aparecia "TypeError: Failed to fetch" (Chrome) ou "Load failed"
   (iPhone). Agora: "Sem conexão com a internet. Confira o sinal e tente de novo."
2. **Login sem sinal:** `entrar` respondia "E-mail ou senha incorretos." para qualquer
   falha, e o socorrista sem sinal acharia que errou a senha. Agora separa: sem
   internet, "Muitas tentativas. Espere um minuto e tente de novo." (limite do Auth)
   e "O sistema não respondeu. Tente de novo em instantes." (5xx).
3. **Sessão vencida (`JWT expired`):** aparecia em inglês. Agora: "Sessão expirada.
   Entre novamente."
4. **Envio de foto/comprovante:** erro de tamanho ou tipo do Storage vinha em inglês.
   Agora: "O arquivo ficou grande demais…" e "Esse tipo de arquivo não é aceito…".

Cobertos por testes novos (`erroDoBanco.test.ts`, `sessao.test.ts`).

## 3. Mensagens do banco para revisar depois (não alterei)

Mexer nelas exige redefinir as funções numa migration nova e ajustar suítes que
comparam o texto. Por isso ficam como lista, não como mudança silenciosa.

- **Acentos inconsistentes** (a mesma frase aparece com e sem acento em migrations
  diferentes): "Seu usuario ainda nao esta vinculado a um socorrista." (7x sem acento,
  3x com), "Voce so pode consultar a propria comissao.", "Turno nao encontrado.",
  "O odometro de fechamento (%) e menor que o de abertura (%).", "Despesa ja paga.",
  "Ninguem aprova o proprio lancamento.".
- **Texto técnico para quem não é técnico:** "Informe o odometro de fechamento." serve;
  "Ancora nao encontrada em %: %" e "trecho nao encontrado em %" são checagens das
  próprias migrations (não chegam ao usuário).
- **Sem o próximo passo** (NN/g pede conselho construtivo): "Sessao invalida.",
  "Despesa nao encontrada." (7x). Sugestão: "Sua sessão acabou. Entre de novo." e
  "Esta despesa não existe mais. Atualize a tela."
- **Culpam sem ajudar:** "Mais de 2.000 km num serviço. Confira a quilometragem do
  painel." está bom (diz o que fazer); "Danos invalidos." e "Foto de dano invalida."
  não dizem o quê.

## 4. Roteiro para testar as exceções (celular, perfil socorrista)

| Teste | Como provocar | Esperado |
|---|---|---|
| Sem sinal | Modo avião e tocar em "Iniciar serviço" ou "Entrar" | "Sem conexão com a internet. Confira o sinal e tente de novo." |
| Senha errada | Entrar com senha errada | "E-mail ou senha incorretos." |
| Muitas tentativas | Errar a senha várias vezes seguidas | "Muitas tentativas. Espere um minuto…" |
| Sessão vencida | Deixar o app aberto até vencer o token e tocar em algo | "Sessão expirada. Entre novamente." |
| Km menor que o anterior | Iniciar serviço com km menor que o último | Aviso vermelho e botão travado |
| Dois serviços abertos | Iniciar outro serviço sem finalizar o primeiro | "Finalize o serviço da OS … antes de iniciar outro." |
| Fechar turno sem fotos | Fechar sem as fotos do checklist | "Falta a foto "…" do checklist." |
| Despesa sem categoria | Salvar sem escolher | "Informe a categoria da despesa." |
| Arquivo errado | Anexar comprovante de outro tipo ou maior que 10 MB | "Envie um comprovante em PDF, JPG, PNG ou WEBP." / "…excede o tamanho máximo de 10 MB." |
