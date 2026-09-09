import { afterEach, expect, test, vi } from 'vitest'
import type { CalendarioPorto } from '../types/modelos'
import { periodoCorrente } from './periodos'

afterEach(() => vi.useRealTimers())

const ciclo = (id: number, dataPagamento: string, ativo = true): CalendarioPorto => ({
  id, dataPagamento, competenciaInicio: '2026-08-16', competenciaFim: '2026-08-31',
  descricao: `ciclo ${id}`, ativo, criadoEm: '', atualizadoEm: '',
})

test('abre no último ciclo já pago, não no último cadastrado', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-20T12:00:00'))
  const periodos = [ciclo(1, '2026-08-14'), ciclo(2, '2026-09-16'), ciclo(3, '2026-10-15'), ciclo(4, '2026-11-16')]

  expect(periodoCorrente(periodos)?.id).toBe(2)
})

test('antes do primeiro pagamento, cai no ciclo mais próximo disponível', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-01T12:00:00'))
  const periodos = [ciclo(1, '2026-08-14'), ciclo(2, '2026-09-16')]

  expect(periodoCorrente(periodos)?.id).toBe(2)
})

test('ciclo inativo não é escolhido quando há ativo pago', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-20T12:00:00'))
  const periodos = [ciclo(1, '2026-08-14'), ciclo(2, '2026-09-16', false)]

  expect(periodoCorrente(periodos)?.id).toBe(1)
})

test('lista vazia não escolhe nada', () => {
  expect(periodoCorrente([])).toBeUndefined()
})
