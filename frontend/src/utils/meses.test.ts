import { expect, test } from 'vitest'
import { inicioDeMesesAtras, mesesDoPeriodo, nomeDoMes } from './meses'

test('os meses do período, virando o ano', () => {
  expect(mesesDoPeriodo('2026-11-15', '2027-02-03')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  expect(mesesDoPeriodo('2026-09-01', '2026-09-30')).toEqual(['2026-09'])
})

test('seis meses para trás começam no dia 1', () => {
  expect(inicioDeMesesAtras('2026-09-23', 5)).toBe('2026-04-01')
  expect(inicioDeMesesAtras('2026-02-10', 5)).toBe('2025-09-01')
})

test('nome curto do mês, com o ano', () => {
  expect(nomeDoMes('2026-07')).toMatch(/^Jul/)
  expect(nomeDoMes('2026-07')).toContain('2026')
})
