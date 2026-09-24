import type { Dashboard } from '../types/modelos'

/**
 * Resultado de cada viatura com as despesas gerais rateadas (Kawa, 24/09/2026).
 *
 * A despesa ligada a uma viatura (combustivel, pneu, seguro dela) ja entra no
 * resultado dela. A que nao e de viatura nenhuma (aluguel, contador, sistema)
 * ficava de fora, e o resultado de cada uma parecia maior do que e. Aqui ela e
 * dividida entre as viaturas na proporcao da receita: quem fatura mais carrega
 * mais. Sem receita no periodo, divide igual.
 */

export interface ResultadoDaViatura {
  veiculoId: number
  veiculo: string
  receitas: number
  despesasProprias: number
  /** A parte das despesas gerais que cabe a esta viatura. */
  rateio: number
  /** Receita menos despesas proprias. */
  resultadoDireto: number
  /** Depois do rateio: o que a viatura deixa de fato. */
  resultado: number
  /** Resultado sobre a receita, em %; sem receita, null. */
  margem: number | null
}

export interface ResultadoDaFrota {
  viaturas: ResultadoDaViatura[]
  /** Despesas pagas sem viatura, rateadas entre todas. */
  despesasGerais: number
}

export function resultadoComRateio(financeiro: Pick<Dashboard, 'despesasPagas' | 'resultadoPorVeiculo'> | null): ResultadoDaFrota {
  const linhas = financeiro?.resultadoPorVeiculo ?? []
  const proprias = linhas.reduce((t, r) => t + r.despesas, 0)
  const despesasGerais = Math.max((financeiro?.despesasPagas ?? 0) - proprias, 0)
  const receitaTotal = linhas.reduce((t, r) => t + Math.max(r.receitas, 0), 0)
  const viaturas = linhas.map(r => {
    const parte = receitaTotal > 0 ? Math.max(r.receitas, 0) / receitaTotal : linhas.length ? 1 / linhas.length : 0
    const rateio = Math.round(despesasGerais * parte * 100) / 100
    const resultadoDireto = r.receitas - r.despesas
    const resultado = resultadoDireto - rateio
    return {
      veiculoId: r.veiculoId, veiculo: r.veiculo, receitas: r.receitas, despesasProprias: r.despesas,
      rateio, resultadoDireto, resultado, margem: r.receitas > 0 ? resultado / r.receitas * 100 : null,
    }
  }).sort((a, b) => b.resultado - a.resultado)
  return { viaturas, despesasGerais }
}
