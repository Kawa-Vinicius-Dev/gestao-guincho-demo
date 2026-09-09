import { afterEach, expect, test, vi } from 'vitest'
import { hojeIso } from './formatadores'

afterEach(() => vi.useRealTimers())

// 01/09 às 02:30 UTC é 31/08 às 23:30 em Brasília. A data do formulário tem de ser a do relógio
// de quem preenche: o plantão vira a noite e um lançamento com a data de amanhã cai na quinzena
// errada. A comparação é com o calendário local, então vale em qualquer fuso.
test('a data padrão é a do calendário local, não a de UTC', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-01T02:30:00Z'))

  expect(hojeIso()).toBe(new Date().toLocaleDateString('en-CA'))
})

test('a data padrão continua correta no meio do dia', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-01T15:00:00Z'))

  expect(hojeIso()).toBe(new Date().toLocaleDateString('en-CA'))
})
