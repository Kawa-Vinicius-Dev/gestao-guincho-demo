import { expect, test } from 'vitest'
import type { ResultadoVeiculo } from '../types/modelos'
import { resultadoComRateio } from './resultadoViaturas'

/**
 * Kawa, 24/09/2026: a despesa sem viatura (aluguel, contador) entra no resultado
 * de cada viatura na proporcao da receita.
 */
const viatura = (veiculoId: number, veiculo: string, receitas: number, despesas: number): ResultadoVeiculo => ({
  veiculoId, veiculo, receitas, despesas, resultado: receitas - despesas, kmMorto: 0, custoKmMorto: 0,
})

test('despesas gerais divididas pela receita de cada viatura', () => {
  // Pagas 5.000: 3.000 das viaturas e 2.000 gerais.
  const frota = resultadoComRateio({ despesasPagas: 5000, resultadoPorVeiculo: [
    viatura(1, 'L168', 7500, 2000), viatura(2, 'L204', 2500, 1000),
  ] })
  expect(frota.despesasGerais).toBe(2000)
  expect(frota.viaturas.map(v => [v.veiculo, v.rateio, v.resultado])).toEqual([
    ['L168', 1500, 4000], ['L204', 500, 1000],
  ])
})

test('a viatura que so parecia dar lucro aparece no prejuizo', () => {
  const frota = resultadoComRateio({ despesasPagas: 4000, resultadoPorVeiculo: [
    viatura(1, 'L168', 9000, 1000), viatura(2, 'L204', 1000, 900),
  ] })
  const l204 = frota.viaturas.find(v => v.veiculo === 'L204')!
  expect(l204.resultadoDireto).toBe(100)
  expect(l204.resultado).toBe(-110)
  // Ordenado do melhor para o pior.
  expect(frota.viaturas.at(-1)!.veiculo).toBe('L204')
})

test('sem receita no periodo, divide igual', () => {
  const frota = resultadoComRateio({ despesasPagas: 1000, resultadoPorVeiculo: [viatura(1, 'A', 0, 0), viatura(2, 'B', 0, 0)] })
  expect(frota.viaturas.map(v => v.rateio)).toEqual([500, 500])
  expect(frota.viaturas[0].margem).toBeNull()
})
