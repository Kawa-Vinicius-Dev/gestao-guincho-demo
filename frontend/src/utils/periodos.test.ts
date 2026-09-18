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

// As 16 OPs reais do banco, com o periodo que cada uma tem (da primeira a ultima
// OS dela). Kawa viu o seletor mostrar "19/06 a 13/08" e "13/05 a 15/06": um
// servico atrasado esticava o inicio da OP e o periodo cruzava quinzenas.
test('com as OPs reais, cada periodo e uma quinzena encaixada na anterior', () => {
  const periodos = agruparPorPeriodo([
    op(19, '06389821', '2026-03-30', '2026-04-29'),
    op(18, '06400330', '2026-04-29', '2026-05-28'),
    op(17, '06405579', '2026-05-21', '2026-06-15'),
    op(16, '06405580', '2026-05-13', '2026-06-15'),
    op(14, '06411002', '2026-06-15', '2026-06-29'),
    op(15, '06411001', '2026-06-15', '2026-06-30'),
    op(13, '06416626', '2026-06-23', '2026-07-14'),
    op(12, '06416627', '2026-06-29', '2026-07-14'),
    op(9, '06422282', '2026-07-15', '2026-07-29'),
    op(11, '06422281', '2026-07-01', '2026-07-30'),
    op(7, '06427803', '2026-07-15', '2026-08-12'),
    op(8, '06427802', '2026-06-19', '2026-08-13'),
    op(6, '06433184', '2026-08-12', '2026-08-26'),
    op(5, '06433185', '2026-08-13', '2026-08-26'),
    op(4, '06438808', '2026-08-27', '2026-09-14'),
    op(10, '06438807', '2026-08-27', '2026-09-15'),
  ])

  expect(periodos.map(rotuloPeriodo)).toEqual([
    '27/08/2026 a 15/09/2026 · OPs 06438807 e 06438808',
    '14/08/2026 a 26/08/2026 · OPs 06433184 e 06433185',
    '31/07/2026 a 13/08/2026 · OPs 06427802 e 06427803',
    '15/07/2026 a 30/07/2026 · OPs 06422281 e 06422282',
    '01/07/2026 a 14/07/2026 · OPs 06416626 e 06416627',
    '16/06/2026 a 30/06/2026 · OPs 06411001 e 06411002',
    '29/05/2026 a 15/06/2026 · OPs 06405579 e 06405580',
    '30/04/2026 a 28/05/2026 · OP 06400330',
    '30/03/2026 a 29/04/2026 · OP 06389821',
  ])
})

// Depois de Kawa informar a quinzena da Porto em quatro OPs (Data inicio e Data
// entrega), o periodo delas passa a ser a quinzena. As OPs parceiras (Taxi e
// Guincho da mesma quinzena) ainda sem data seguem no grupo sem esticar o inicio.
test('a quinzena informada pela Porto define o periodo do grupo', () => {
  const periodos = agruparPorPeriodo([
    op(11, '06422281', '2026-07-01', '2026-07-30'),
    op(9, '06422282', '2026-07-15', '2026-07-29'),
    op(7, '06427803', '2026-08-01', '2026-08-14'),
    op(8, '06427802', '2026-06-19', '2026-08-13'),
    op(6, '06433184', '2026-08-12', '2026-08-26'),
    op(5, '06433185', '2026-08-15', '2026-08-28'),
    op(4, '06438808', '2026-09-01', '2026-09-16'),
    op(10, '06438807', '2026-09-01', '2026-09-16'),
  ])

  expect(periodos.map(rotuloPeriodo).slice(0, 3)).toEqual([
    '01/09/2026 a 16/09/2026 · OPs 06438807 e 06438808',
    '15/08/2026 a 28/08/2026 · OPs 06433184 e 06433185',
    '01/08/2026 a 14/08/2026 · OPs 06427802 e 06427803',
  ])
})
