# Regras de negócio iniciais

Estas regras orientam a primeira implementação e podem ser refinadas após validar a rotina real da empresa.

## Financeiro

- Todo lançamento deve ter tipo, valor, data e categoria.
- Entradas aumentam o resultado do período; saídas reduzem.
- O saldo do período é calculado por: **total de entradas - total de saídas**.
- Uma despesa pode estar vinculada a um veículo e/ou funcionário, mas esse vínculo é opcional no MVP.
- Um lançamento não deve ser apagado sem confirmação. Em uma versão futura, a baixa pode ser feita por estorno para manter o histórico.

## Km morto

- No MVP, km morto é registrado como uma categoria específica de custo.
- O cálculo detalhado por quilometragem, rota e custo por km será definido depois de entender como a empresa mede esse dado na prática.

## Importações

- Relatórios de parceiros, como Porto Seguro, poderão ser recebidos em PDF, CSV ou Excel.
- A primeira etapa é aceitar o arquivo e validar os dados antes de criar lançamentos automaticamente.
- Nenhuma importação deve duplicar um lançamento já registrado.
