import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, test } from 'vitest'
import { periodoPortoDoGlobal, usePeriodoGlobal } from './periodoGlobal'
import type { PeriodoPorto } from './periodos'

beforeEach(() => sessionStorage.clear())

// Kawa: o periodo vale em todas as telas, com a opcao de alterar em qualquer uma.
test('trocar o período numa tela troca nas outras abertas e nas que abrirem depois', () => {
  const visao = renderHook(() => usePeriodoGlobal())
  const extrato = renderHook(() => usePeriodoGlobal())

  act(() => visao.result.current[1]({ inicio: '2026-08-27', fim: '2026-09-15', op: '9-10' }))

  expect(extrato.result.current[0]).toEqual({ inicio: '2026-08-27', fim: '2026-09-15', op: '9-10' })
  expect(renderHook(() => usePeriodoGlobal()).result.current[0].inicio).toBe('2026-08-27')
})

test('data pela metade não vai para as outras telas', () => {
  const visao = renderHook(() => usePeriodoGlobal())
  const antes = visao.result.current[0]
  const extrato = renderHook(() => usePeriodoGlobal())

  act(() => visao.result.current[1]({ ...antes, inicio: '' }))

  expect(extrato.result.current[0]).toEqual(antes)
})

const PERIODOS: PeriodoPorto[] = [
  { id: '9-10', ids: [9, 10], numeros: ['06438807', '06438808'], periodoInicio: '2026-08-27', periodoFim: '2026-09-15' },
  { id: '11-12', ids: [11, 12], numeros: ['06433184', '06433185'], periodoInicio: '2026-08-12', periodoFim: '2026-08-26' },
]

test('comissões abrem na quinzena que cruza o período escolhido', () => {
  expect(periodoPortoDoGlobal(PERIODOS, { inicio: '2026-09-01', fim: '2026-09-30' })?.id).toBe('9-10')
  expect(periodoPortoDoGlobal(PERIODOS, { inicio: '2026-08-15', fim: '2026-08-20' })?.id).toBe('11-12')
  expect(periodoPortoDoGlobal(PERIODOS, { inicio: '2026-01-01', fim: '2026-01-31' })?.id).toBe('9-10')
})
