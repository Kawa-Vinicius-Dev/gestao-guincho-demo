import type { PeriodoGlobal } from './periodoGlobal'

/**
 * Como o periodo escolhido recorta servicos e dinheiro. Toda tela passa por
 * aqui: e o unico lugar que decide o modo (Kawa, 23/09/2026).
 *
 *  - Periodo da OP: pela competencia — o servico conta na OP em que entrou.
 *  - Mes (escolhido na lista de meses): pela competencia tambem — as quinzenas
 *    que fecham no mes, inclusive o que ainda aguarda OP.
 *  - De–ate: pela data do servico, de qualquer tamanho. Um dia, uma semana, de
 *    uma quinzena a outra ou o ano inteiro. Houve um limite de 8 dias, e Kawa o
 *    tirou: "se eu quiser pegar o ano inteiro? e por ai que eu faco".
 *
 * Despesas sempre pela data do lancamento.
 */
export function porCompetencia(periodo: PeriodoGlobal): boolean {
  return Boolean(periodo.op) || Boolean(periodo.mes)
}
