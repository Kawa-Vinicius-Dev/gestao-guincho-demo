import type { CalendarioPorto } from '../types/modelos'
import { hojeIso } from './formatadores'

/**
 * O calendário da Porto é cadastrado com meses de antecedência, então o último ciclo da lista
 * está no futuro e ainda não tem OS paga. A tela precisa abrir no último ciclo que já foi pago,
 * que é onde a conferência acontece.
 */
export function periodoCorrente(periodos: CalendarioPorto[]): CalendarioPorto | undefined {
  const hoje = hojeIso(), doFimParaOInicio = [...periodos].reverse()
  return doFimParaOInicio.find(p => p.ativo && p.dataPagamento <= hoje)
    ?? doFimParaOInicio.find(p => p.ativo)
    ?? periodos.at(-1)
}
