import type { PeriodoGlobal } from './periodoGlobal'

/**
 * Como o periodo escolhido recorta servicos e dinheiro. Toda tela passa por
 * aqui: e o unico lugar que decide o modo (Kawa, 23/09/2026, grill-me).
 *
 *  - Periodo da OP: pela competencia — o servico conta na OP em que entrou.
 *  - Mes: pela competencia tambem — as quinzenas que fecham no mes, inclusive o
 *    que ainda aguarda OP.
 *  - De–ate de ate 8 dias: pela data do servico, dia a dia, com ou sem valor.
 *  - De–ate maior que 8 dias: pela competencia, com aviso. A OP traz servico de
 *    outra quinzena (uma OS de 28/08 na OP de 01/09 a 15/09), e num intervalo
 *    longo contar pela data confunde a leitura.
 *
 * Despesas sempre pela data do lancamento.
 */
export const LIMITE_DIAS_POR_DATA = 8

const DIA_MS = 86_400_000

export function diasDoPeriodo({ inicio, fim }: PeriodoGlobal): number {
  if (!inicio || !fim) return 0
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / DIA_MS) + 1
}

/** O periodo conta servicos e receita pela competencia (e nao pela data do servico)? */
export function porCompetencia(periodo: PeriodoGlobal): boolean {
  return Boolean(periodo.op) || diasDoPeriodo(periodo) > LIMITE_DIAS_POR_DATA
}

/**
 * O De–ate passou do limite e mudou de modo sozinho: a tela avisa. Periodo da
 * OP e mes ja sao por competencia por definicao, entao nao ha o que avisar.
 */
export function passouDoLimite(periodo: PeriodoGlobal, mesFechado: boolean): boolean {
  return !periodo.op && !mesFechado && diasDoPeriodo(periodo) > LIMITE_DIAS_POR_DATA
}
