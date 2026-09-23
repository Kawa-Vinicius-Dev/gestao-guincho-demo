import type { PeriodoGlobal } from './periodoGlobal'

/**
 * As tres formas de filtrar tem logicas diferentes (Kawa, 23/09/2026):
 *
 *  - Periodo da OP: pelo periodo da OP (a competencia) — o servico conta na OP
 *    em que entrou.
 *  - Mes: do dia 1 ao ultimo dia do mes, pela data do servico.
 *  - De–ate: as OS com data dentro do intervalo.
 *
 * Despesas seguem a mesma logica: pela data do lancamento dentro das datas.
 * O seletor marca `op` quando o periodo veio de uma OP; sem isso, e por data.
 */
export const porCompetenciaDaOp = (periodo: PeriodoGlobal) => Boolean(periodo.op)
