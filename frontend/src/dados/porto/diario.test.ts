import { expect, test } from 'vitest'
import { diasColados, LIMITE_DE_DIAS } from './diario'

const registro = (numero: string, dia: string) =>
  `PORTO SEGURO\t${numero}/26\tSOCORRO\tL25\tQEBSON RAMOS DA SILV\t${dia}\t06:49\t06:49\tACIONADO/FINAL\tFINALIZADO\tNão`

const COLADO = [
  registro('5673329', '01/09/2026'),
  registro('5673528', '01/09/2026'),
  registro('5677129', '03/09/2026'),
].join('\n')

test('conta os dias e o intervalo da colagem', async () => {
  const colado = await diasColados(COLADO)

  expect(colado.dias).toEqual(['2026-09-01', '2026-09-03'])
  expect(colado.inicio).toBe('2026-09-01')
  expect(colado.fim).toBe('2026-09-03')
  // Contando as pontas: 01, 02 e 03.
  expect(colado.intervalo).toBe(3)
  expect(colado.servicos).toBe(3)
})

test('o intervalo cobre os dias vazios entre a primeira e a ultima data', async () => {
  const colado = await diasColados([registro('5673329', '01/09/2026'), registro('5677129', '15/09/2026')].join('\n'))

  expect(colado.dias).toHaveLength(2)
  expect(colado.intervalo).toBe(15)
})

// A quinzena real: 16/03 a 31/03 sao 16 dias corridos, e a exportacao da Porto
// vem assim. O limite tem de aceitar a colagem normal do dia a dia.
test('a segunda quinzena de um mes de 31 dias cabe no limite', async () => {
  const colado = await diasColados([registro('2400947', '16/03/2026'), registro('2707679', '31/03/2026')].join('\n'))

  expect(colado.intervalo).toBe(16)
  expect(colado.intervalo).toBeLessThanOrEqual(LIMITE_DE_DIAS)
})

test('colagem maior que o limite e reconhecida pelo intervalo, nao pela quantidade de dias', async () => {
  const colado = await diasColados([registro('5673329', '01/09/2026'), registro('5677129', '17/09/2026')].join('\n'))

  expect(colado.intervalo).toBeGreaterThan(LIMITE_DE_DIAS)
})

test('colagem sem data nenhuma nao passa', async () => {
  await expect(diasColados('qualquer coisa colada')).rejects.toThrow(/painel do dia/i)
})
