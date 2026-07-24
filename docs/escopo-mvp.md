# Escopo do MVP

## Visão

Uma demo de gestão financeira para uma empresa de guincho. O produto deve ser simples para quem hoje acompanha a operação principalmente pelo banco, mas organizado o suficiente para gerar controle de verdade.

## Módulos prioritários

| Módulo | Objetivo |
| --- | --- |
| Autenticação | Permitir acesso por usuário e proteger os dados da empresa. |
| Dashboard | Mostrar saldo, entradas, saídas e resultado do período. |
| Lançamentos | Registrar receitas e despesas com data, valor, categoria e observação. |
| Veículos | Relacionar custos e resultados a cada veículo quando necessário. |
| Funcionários | Manter os responsáveis pelos registros e futuras permissões. |
| Relatórios | Consultar o financeiro por período e categoria. |

## Dados de um lançamento

- Tipo: entrada ou saída;
- Valor;
- Data;
- Categoria;
- Descrição;
- Veículo (opcional);
- Funcionário responsável (opcional);
- Origem: manual, banco ou importação;
- Comprovante (futuro).

## Categorias iniciais de saída

- Combustível
- Manutenção
- Pedágio
- Alimentação
- Seguro
- Parcela de veículo
- Km morto
- Outros

## Critérios de sucesso da demo

1. Um usuário consegue registrar uma entrada e uma despesa em poucos passos.
2. O dashboard deixa claro o saldo e o resultado do período.
3. É possível identificar quanto foi gasto por categoria.
4. O sistema tem base para evoluir para uso pelos funcionários em celular.
