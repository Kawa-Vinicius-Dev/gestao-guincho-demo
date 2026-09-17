# Plano — Diário Operacional × OP (competência, pendências e valor manual)

Especificação do Kawã em 17/09/2026, com as decisões do grill-me. O que já existe
é mantido; cada etapa sai num PR separado para testar.

## Conceitos

| Conceito | Significado no sistema |
|---|---|
| Operacional | OS registradas pelo Diário (consulta de serviços colada, 1 a 15 dias) |
| Data do serviço | `data_atendimento` da OS. Nunca muda |
| OP | Fonte financeira oficial, importada quando a Porto disponibiliza |
| Competência | Janela financeira. Passado: sai das OPs importadas (OPs que fecham com até 7 dias de diferença são uma competência). Futuro: padrão provisório fechando no dia 15 e no último dia do mês |
| Competência da OS | Com OP: a competência da OP. Sem OP: a da data do serviço, ou a primeira competência seguinte ainda sem OP, se a da data já teve OP importada e a OS não estava nela |
| Valor oficial | `valor_total` vindo da OP |
| Valor manual | `valor_manual`, informado antes da OP. Previsto, marcado como manual, sem comissão |
| Crédito da OP | Valor da OP = serviços + créditos − descontos. O crédito não é de nenhuma OS: é receita lançada na aba Créditos, datada na competência, sem comissão. Nunca vira divergência de OS nem "OS não encontrada" |
| Situação da OS | `AGUARDANDO_ANALISE` (sem OP, sem valor) · `VALOR_MANUAL` (sem OP, com valor manual) · `AGUARDANDO_PROXIMA_OP` (competência já teve OP e ela não estava) · `CONCILIADA` (na OP) · `DIVERGENTE` (na OP com valor diferente do manual) |

## Regras já atendidas (não mexer)

- Diário importa vários dias, com viatura e socorrista, sem pedir OP.
- OP acha a OS pelo número normalizado, grava valor e OP, marca recebida.
- Receita e conta a receber datadas pelo fim do período da OP (`porto_fechar_op`).
- Comissão só de OS dentro de uma OP (`porto_sincronizar_comissoes`).
- Conciliação por período: OPs do mesmo período agrupadas (`agruparPorPeriodo`).
- Auxiliar só para OS sem nome; viatura em lote; confirmações; exportações.
- Layout da Visão geral: não mexer.

## Etapas

1. **Banco**
   - Colunas `valor_manual`, `valor_manual_em`, `valor_manual_por` na OS.
   - `porto_competencias()` com as competências reais e provisórias.
   - `porto_os_situacao()` com a competência, a situação, o valor previsto e a divergência de cada OS.
   - `porto_informar_valor_manual()`, com `porto_resolver_pendencias` passando a gravar em `valor_manual`.
   - A importação da OP devolve as OS da competência não encontradas e as divergentes.
2. **Aba Diário Operacional**
   - Menu próprio.
   - Colar a consulta, com no máximo 15 dias.
   - Mapa dos dias já importados desde 30/03/2026.
3. **Importar OP**
   - Aviso de "N serviços do Operacional não foram encontrados nesta OP", com lista.
   - Aviso de OS com valor divergente do manual, com lista.
   - Diferença entre o Valor da OP e a soma dos serviços mostrada como "provável crédito", com atalho para lançar na aba Créditos (não como erro de OS).
4. **Ordens de serviço**
   - Filtro por situação e por competência ou data do serviço.
   - Informar o valor manual, com confirmação.
   - Mostrar o valor manual × o valor da OP.
5. **Dashboard Porto**
   - Cards de sem valor, aguardando próxima OP e divergentes, com projeção na competência seguinte.
   - Total da competência separado em serviços (oficial + previsto) e créditos lançados, para bater com o Valor da OP.
   - Contagem por socorrista e viatura incluindo as OS sem valor.
   - Cards clicáveis, abrindo a lista filtrada.
6. **Resto do sistema**
   - Opção Mês no seletor de período.
   - Comissão prevista, separada da confirmada: Comissões, ficha do socorrista e Minha comissão.
   - Pendências nas fichas e em Veículos.
   - Contas a receber e Pendências do período com os mesmos estados.
   - Cards clicáveis nas outras telas.

Depois: aba de Socorristas (acesso) e quilometragem.
