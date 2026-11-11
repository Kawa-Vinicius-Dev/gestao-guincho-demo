# Fila offline do socorrista

Na rua o sinal cai. Antes, "Iniciar serviço" e "Finalizar serviço" falhavam na hora,
a tela virava erro e o socorrista perdia a foto e o km que tinha acabado de preencher.
Agora o toque fica guardado no celular e segue sozinho quando o sinal volta.
(Referência de mercado: o app do motorista do Uber e o ServiceTitan fazem o mesmo.
Fontes em `docs/comparativo-e-mensagens.md`.)

## O que a pessoa vê
- Sem sinal, "Iniciar serviço" responde: "Sem sinal. O serviço da OS … ficou salvo no
  celular e vai sozinho quando o sinal voltar." A tela segue normal: mostra o serviço
  em andamento (com a hora do toque) e deixa finalizar e iniciar o próximo.
- Na lista, o serviço mostra "aguardando envio". O botão "Remover" some enquanto
  houver algo dele na fila.
- No alto de todas as telas do socorrista, um aviso: "N envios guardados no celular"
  (azul), com "Enviar agora" quando há sinal.
- Se o banco **recusar** um envio (ex.: km menor que o do turno), o aviso fica vermelho
  com a frase do banco e duas ações: **Tentar de novo** e **Descartar** (pede
  confirmação). Os envios seguintes esperam, porque a ordem importa. Nada é apagado
  sozinho.
- "Fechar turno" fica travado enquanto houver envio de serviço esperando.

## Como funciona (`frontend/src/dados/filaOffline.ts`)
- IndexedDB, uma fila por usuário. Três passos, na ordem em que acontecem:
  `INICIAR` (cria o serviço) → `FOTO_INICIO` → `FINALIZAR`.
- Cada passo chama as mesmas funções de `turnos.ts`; a fila não decide regra nenhuma,
  o banco continua dizendo sim ou não.
- Tenta ao abrir a tela, no evento `online` do celular e a cada 20 s enquanto houver
  item. Uma execução por vez (também entre abas).
- **Resposta perdida** (o banco gravou, o celular não soube): antes de concluir, confere
  no banco. Se a OS já está no turno com o mesmo km, adota o serviço em vez de duplicar;
  se o serviço já foi finalizado com o mesmo km, conta como enviado. OS repetida de
  verdade (km diferente) bloqueia.
- Sem internet é espera, não erro: não conta tentativa. Outros erros inesperados
  bloqueiam o item depois de 5 tentativas.
- A tela abre sem sinal com o último estado conhecido (guardado na aba), em vez de
  mostrar erro.

## Mudança no banco (migration `20261111170000_hora_real_do_servico.sql`)
`iniciado_em`/`finalizado_em` eram `now()` do banco. Um serviço enviado 40 minutos depois
apareceria para o dono, em "Km dos turnos", com a hora do envio e não a do toque. As
funções `iniciar_servico_do_turno` e `finalizar_servico_do_turno` ganharam o parâmetro
**opcional** `p_ocorrido_em` (sem ele, nada muda). Limites: não pode estar mais de
5 minutos no futuro e não pode ser anterior ao turno (iniciar) nem ao início do serviço
(finalizar), com 5 minutos de folga. Suíte nova: `99t` (16 verificações); `99k` continua passando.

**Ordem de publicação: aplicar a migration antes de publicar o frontend.** O frontend só
manda `p_ocorrido_em` para itens que passaram pela fila; envio direto, com sinal, é
idêntico ao de antes.

## Limites (de propósito)
- Só serviço (iniciar, finalizar, foto do início). Abrir/fechar turno, checklist, despesas
  e danos continuam exigindo sinal.
- Sair do app (`Sair`) não apaga a fila: os envios ficam para a mesma pessoa. Outra
  pessoa que entre no mesmo celular não os envia. A sessão fica só na aba, então, se a
  aba for fechada, é preciso entrar de novo (com sinal) para a fila seguir.
- O relógio do celular vale (dentro dos limites acima). Relógio adiantado mais de
  5 minutos é recusado com "Acerte o relógio e tente de novo."
- Celular que bloqueia IndexedDB (alguns modos privados): o envio normal, com sinal,
  funciona como sempre; sem sinal avisa "este celular não consegue guardar o envio".

## Como testar
1. Iniciar o serviço com o celular em modo avião: deve aparecer "ficou salvo no celular".
2. Finalizar ainda em modo avião: o serviço mostra o km e "aguardando envio".
3. Tentar "Fechar turno": travado, com o motivo.
4. Desligar o modo avião: o aviso some sozinho em alguns segundos; conferir em
   "Km dos turnos" (dono) que as horas são as do toque.
5. Fechar o app com algo na fila, reabrir, entrar: o envio segue.
