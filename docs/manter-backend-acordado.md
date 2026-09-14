# Manter o backend acordado no plano gratuito do Render

**Situação:** pendente. Decidido em 13/09/2026, ainda não implementado.

## O problema

O plano gratuito do Render hiberna o serviço web após **15 minutos sem tráfego**, e
religar leva **cerca de 1 minuto**. Na prática, o primeiro acesso de cada dia trava
por um minuto — todo dia, para quem abrir o sistema primeiro.

## A decisão

**Pingar o backend a cada 10 minutos, das 07h às 19h, de segunda a sexta.**

O que foi descartado, e por quê:

| Alternativa | Por que não |
|---|---|
| Ping 24/7 | O gratuito dá **750 horas de instância/mês** e o serviço só consome hora enquanto acordado. Um mês tem ~730 h, então sobra margem de 20 h. Estourar **suspende todos os serviços gratuitos até o mês seguinte** — e qualquer outro serviço no mesmo workspace divide a mesma cota. |
| Plano pago (Starter) | Resolve de vez, mas custa ~US$ 7–13/mês. Só se o cliente passar a acessar fora do expediente com frequência. |
| Não fazer nada | O cliente paga 1 minuto de espera toda manhã. |

Horário comercial gasta **12 h × 22 dias úteis ≈ 264 h/mês** das 750. Margem larga,
e o ping das 07h paga o tempo de partida **antes de alguém chegar**: quem usa o
sistema nunca sente a hibernação.

## Como fazer

### 1. Criar um endpoint de saúde público

Hoje **não existe**. O `pom.xml` não tem Actuator, e as únicas rotas públicas em
`SecurityConfig` são `OPTIONS /**`, `POST /api/auth/login` e `/error`.

Adicionar um `GET /api/health` que devolve 200 sem autenticação, e liberá-lo no
`SecurityConfig` junto das outras rotas públicas. Não deve tocar o banco — o ponto
é ser barato: quem chama é um robô, a cada 10 minutos.

Dá para pingar `/error` sem mexer em nada, mas é remendo: qualquer mudança no
tratamento de erro quebra o monitoramento sem aviso.

### 2. Agendar o ping

Usar **cron-job.org** ou **UptimeRobot** — ambos gratuitos e feitos para isso.

```
URL:        https://<backend>.onrender.com/api/health
Intervalo:  10 minutos
Janela:     07:00–19:00, segunda a sexta
```

Evitar GitHub Actions: agendamento lá atrasa e às vezes pula execução, que é
exatamente o que não pode acontecer aqui.

### 3. Conferir depois de um mês

No painel do Render, ver as horas de instância consumidas. A previsão é ~264 h.
Se passar muito disso, alguma coisa está pingando fora da janela.

## Quando revisitar

Se o cliente começar a usar o sistema à noite ou em fim de semana, a janela deixa
de cobrir e volta a hibernação. Aí a conversa passa a ser o plano pago, não uma
janela maior — alargar até 24/7 é que estoura a cota.
