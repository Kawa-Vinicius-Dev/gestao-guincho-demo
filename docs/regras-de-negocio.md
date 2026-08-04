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

## Porto Seguro

- A prévia de CSV ou TXT não cria OP, OS, pendência, despesa ou recebimento.
- Cada número de OP e de OS é uma chave de negócio única; reimportações atualizam sem duplicar.
- Campo vazio nunca apaga um valor existente e conflitos exigem confirmação explícita.
- Um serviço aguardando lançamento recebe a próxima data ativa do calendário Porto.
- Processar uma OP programa o pagamento, mas não confirma entrada no banco.
- Somente a confirmação manual de recebimento muda a situação para `RECEBIDO`.
- Serviço devolvido é finalizado sem criar despesa ou pendência aberta automaticamente.
- Km excedente é receita; km morto estimado não cria despesa automática.
- Faturamento produzido, valor programado e valor recebido são linhas financeiras distintas.
