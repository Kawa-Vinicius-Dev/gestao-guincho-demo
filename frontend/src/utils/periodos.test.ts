import { expect, test } from 'vitest'
import type { OrdemPagamentoPorto } from '../types/modelos'
import { agruparPorPeriodo, opCorrente, periodoCorrente, rotuloOp, rotuloPeriodo } from './periodos'

const op = (
  id: number, numero: string, inicio?: string, fim?: string,
): OrdemPagamentoPorto => ({
  id, numero, valorTotal: 1000, situacao: 'RECEBIDO',
  quantidadeOrdensServico: 10, valorOrdensServico: 1000, divergencia: 0,
  statusConciliacao: 'CONCILIADA', periodoInicio: inicio, periodoFim: fim,
})

test('abre na OP mais recente, e a ordem da lista nao importa', () => {
  const ops = [
    op(1, 'A', '2026-03-30', '2026-04-29'),
    op(3, 'C', '2026-06-01', '2026-06-28'),
    op(2, 'B', '2026-05-01', '2026-05-30'),
  ]

  expect(opCorrente(ops)?.id).toBe(3)
})

// OP cadastrada a mao ainda nao tem periodo: sem as OS dela, nao ha de onde
// tirar. Ela nao pode sumir da lista por causa disso.
test('OP sem periodo cai para a data programada', () => {
  const semPeriodo = { ...op(9, 'Z'), dataPagamentoProgramada: '2026-12-01' }
  const ops = [op(1, 'A', '2026-03-30', '2026-04-29'), semPeriodo]

  expect(opCorrente(ops)?.id).toBe(9)
})

test('lista vazia nao escolhe nada', () => {
  expect(opCorrente([])).toBeUndefined()
})

test('o rotulo diz o numero e a janela que a OP cobre', () => {
  expect(rotuloOp(op(1, '06389821', '2026-03-30', '2026-04-29')))
    .toBe('OP 06389821 · 30/03/2026 a 29/04/2026')
})

test('sem periodo, o rotulo fica so com o numero', () => {
  expect(rotuloOp(op(1, '06389821'))).toBe('OP 06389821')
})

// A Porto paga a mesma quinzena em mais de uma OP: Taxi e Guincho, as duas de
// 27/08 a 14-15/09. Para quem olha, e um periodo so.
test('OPs da mesma quinzena viram um período só', () => {
  const periodos = agruparPorPeriodo([
    op(1, '06389821', '2026-03-30', '2026-04-29'),
    op(6, '06438808', '2026-08-27', '2026-09-14'),
    op(7, '06438807', '2026-08-27', '2026-09-15'),
  ])

  expect(periodos.map(p => p.id)).toEqual(['6-7', '1'])
  expect(periodos[0].ids.sort()).toEqual([6, 7])
  expect(rotuloPeriodo(periodos[0])).toBe('27/08/2026 a 15/09/2026 · OPs 06438807 e 06438808')
  expect(rotuloPeriodo(periodos[1])).toBe('30/03/2026 a 29/04/2026 · OP 06389821')
  expect(periodoCorrente(periodos)?.id).toBe('6-7')
})

// A OP da quinzena seguinte pode trazer uma OS atrasada e cruzar a anterior; ela
// continua sendo outro periodo, porque fecha duas semanas depois.
test('OS atrasada não junta quinzenas diferentes', () => {
  const periodos = agruparPorPeriodo([
    op(7, '06438807', '2026-08-27', '2026-09-15'),
    op(8, '06500000', '2026-09-12', '2026-09-30'),
  ])

  expect(periodos.map(p => p.id)).toEqual(['8', '7'])
})
