# Porto: ordens, calendário e pagamentos

## Escopo

O módulo controla serviços e ordens de pagamento da Porto a partir de arquivos CSV/TXT ou criação manual. Não existe integração direta com o portal da Porto, scraping, automação de navegador ou conexão com banco cloud.

## Fluxos de importação

1. Envie um CSV/TXT tabular ou cole os blocos de serviços copiados.
2. Confira tipo detectado, linhas, duplicidades, valores, erros e divergências.
3. Corrija e reenvie quando houver erro; conflitos e reassociações exigem confirmação explícita.
4. Confirme para persistir. Cancelar a prévia não persiste OP ou OS.

O TXT em blocos reconhece cada serviço pelo número da OS e extrai prestador, data/hora, seguradora, especialidade, cliente, placa, campos opcionais, valor e situação. O TXT tabular de composição é analisado dentro da OP escolhida.

## Calendário e ciclos

As datas do calendário são configuráveis e cada pagamento informa explicitamente a quinzena de competência atendida. Um serviço aguardando lançamento recebe a primeira data ativa posterior ao atendimento. Quando sua OP usa uma data posterior, o sistema preserva a previsão original, registra a data efetiva e conta os ciclos ultrapassados. Atrasos ficam como `LIBERADO_APOS_ANALISE`.

## OP paga e fluxo financeiro

A confirmação de `OS_VINCULADAS` representa uma OP já paga. O ciclo financeiro vem do calendário associado à OP ou do período selecionado explicitamente pelo administrador; datas de atendimento antigas ou pertencentes a competências distintas não bloqueiam a OP. Para cada OS, cria ou atualiza uma única conta a receber `RECEBIDO` e uma única receita `RECEBIDA`: a competência operacional preserva a data do atendimento e o recebimento usa a data configurada no calendário. Os vínculos por OS, OP e importação tornam a operação idempotente e impedem uma receita total duplicada por OP.

Importações `SERVICOS_AGUARDANDO_LANCAMENTO` permanecem operacionais e não geram conta, receita ou caixa. Para completar uma composição paga confirmada antes desta regra, um administrador autenticado pode executar `POST /api/porto/importacoes/{id}/reprocessar-financeiro`; a ação aceita somente importações confirmadas de `OS_VINCULADAS`, aceita o calendário quando a OP histórica ainda não o possui e pode ser repetida com segurança.

## Comissão

Somente OS recebidas dentro de OP recebida geram comissão. O fechamento agrupa todas as OPs do mesmo calendário por motorista, sem mover serviços antigos para a data de atendimento e sem persistir total paralelo. A regra e os endpoints estão detalhados em [comissoes-funcionarios.md](comissoes-funcionarios.md).

## OP manual e conciliação

Uma OP manual informa número, data prevista, valor, status Porto, situação financeira e observação. Número repetido é rejeitado. A soma da composição é comparada ao valor informado com tolerância de um centavo. Diferenças em OPs manuais exigem motivo e justificativa auditáveis.

`PROCESSADO`, `PROGRAMADO` e `A_CONFIRMAR` não significam dinheiro recebido. O valor entra como recebido somente pelo endpoint/tela de confirmação bancária, com valor e data.

## Dashboard e relatórios

O dashboard aceita dia, semana (segunda a domingo), quinzena, mês ou intervalo personalizado. A visão de produção usa a data do atendimento; programados usam a data da OP; recebidos usam a data bancária. O dashboard financeiro principal exibe o bloco Porto separado, sem somar previsões ao caixa, DRE ou lucro.

O relatório consolidado gera Excel/PDF. O relatório individual de OP gera `Resumo da OP`, `Serviços vinculados`, `Serviços regulares`, `Liberados após análise`, `Divergências`, `Por socorrista` e `Por especialidade`.

## Execução local

```bash
cd backend
./mvnw spring-boot:run "-Dspring-boot.run.profiles=local"

cd ../frontend
npm install
npm run dev
```

Use apenas dados sintéticos em desenvolvimento e testes.
