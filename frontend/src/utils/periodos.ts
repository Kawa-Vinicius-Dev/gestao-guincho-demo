import type { OrdemPagamentoPorto } from '../types/modelos'
import { data } from './formatadores'

/**
 * O periodo, nas telas de comissao, e a ordem de pagamento.
 *
 * Antes era o ciclo do calendario, cadastrado a mao com meses de antecedencia —
 * e a tela precisava adivinhar qual ciclo ja tinha sido pago para abrir no lugar
 * certo. A OP nao tem esse problema: ela so existe depois de paga. A mais
 * recente e a que interessa, e e nela que a conferencia acontece.
 */
export function opCorrente(
  ops: OrdemPagamentoPorto[],
): OrdemPagamentoPorto | undefined {
  return [...ops].sort((a, b) =>
    (b.periodoFim ?? b.dataPagamentoProgramada ?? '')
      .localeCompare(a.periodoFim ?? a.dataPagamentoProgramada ?? ''))[0]
}

/** "OP 06389821 · 30/03/2026 a 29/04/2026" — o numero e a janela que ele cobre. */
export function rotuloOp(op: OrdemPagamentoPorto): string {
  const janela = op.periodoInicio && op.periodoFim
    ? ` · ${data(op.periodoInicio)} a ${data(op.periodoFim)}`
    : ''
  return `OP ${op.numero}${janela}`
}
