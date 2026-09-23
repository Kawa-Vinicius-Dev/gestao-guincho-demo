import { expect, test } from 'vitest'
import type { Dashboard, LancamentoFinanceiro } from '../types/modelos'
import { diasDoPeriodo, montarDre, relatorioDaDre } from './dre'
import type { LinhaOs } from './porto/listaOs'

const financeiro = { receitaRecebida: 1100, despesasPagas: 300 } as Dashboard

const lanc = (id: string, extra: Partial<LancamentoFinanceiro>): LancamentoFinanceiro => ({
  id, tipo: 'DESPESA', referenciaId: 1, descricao: id, categoria: 'Combustível', valor: 0,
  data: '2026-09-07', status: 'PAGO', realizado: true, origem: 'MANUAL', ...extra,
} as LancamentoFinanceiro)

const extrato = [
  lanc('R1', { tipo: 'RECEITA', categoria: 'Crédito da OP', valor: 100, status: 'RECEBIDA' }),
  lanc('R2', { tipo: 'RECEITA', categoria: 'Guincho', valor: 1000, status: 'RECEBIDA', origem: 'IMPORTADA' }),
  lanc('D1', { valor: 200 }),
  lanc('D2', { valor: 50, data: '2026-09-05' }),
  lanc('D3', { categoria: 'Manutenção', valor: 50 }),
  // Nao paga: fora das despesas pagas.
  lanc('D4', { valor: 999, status: 'PENDENTE', realizado: false }),
]

const os = (i: number, extra: Partial<LinhaOs>): LinhaOs => ({
  id: i, numero: `OS-${i}`, valorTotal: 0, situacao: 'CONCILIADA', semValor: false,
  motoristaId: 1, motorista: 'DJALMA BEZERRA', viatura: 'K85', dataAtendimento: '2026-09-07', ...extra,
})
const servicos = [os(1, { valorPrevisto: 500, numeroOp: '06438807' }), os(2, { valorPrevisto: 500 }), os(3, { semValor: true })]

test('receita: serviços da Porto e cada receita avulsa, fechando com o total', () => {
  const dre = montarDre(financeiro, extrato, servicos, 1)
  expect(dre.receitasAvulsas).toEqual([{ categoria: 'Crédito da OP', valor: 100 }])
  expect(dre.receitaServicos).toBe(1000)
  expect(dre.lucro).toBe(800)
})

test('despesas pagas por categoria, com cada gasto dentro', () => {
  const dre = montarDre(financeiro, extrato, servicos, 1)
  expect(dre.despesas.map(d => [d.categoria, d.valor, d.itens.length])).toEqual([
    ['Combustível', 250, 2], ['Manutenção', 50, 1],
  ])
  // Do mais antigo para o mais novo, dentro da categoria.
  expect(dre.despesas[0]!.itens.map(l => l.id)).toEqual(['D2', 'D1'])
})

test('até 8 dias, os serviços um a um; acima, resumidos', () => {
  expect(diasDoPeriodo('2026-09-07', '2026-09-07')).toBe(1)
  const dia = montarDre(financeiro, extrato, servicos, diasDoPeriodo('2026-09-01', '2026-09-08'))
  expect(dia.servicos).toMatchObject({ detalhado: true, total: 3, semValor: 1, valor: 1000 })
  expect(relatorioDaDre(dia, '2026-09-01', '2026-09-08').secoes.map(s => s.titulo))
    .toEqual(['Resultado', 'Serviços por socorrista', 'Serviços por viatura', 'Serviços prestados, por socorrista', 'Despesas pagas, gasto por gasto'])

  const mes = montarDre(financeiro, extrato, servicos, diasDoPeriodo('2026-09-01', '2026-09-30'))
  expect(mes.servicos.detalhado).toBe(false)
  expect(relatorioDaDre(mes, '2026-09-01', '2026-09-30').secoes.map(s => s.titulo))
    .toEqual(['Resultado', 'Serviços por socorrista', 'Serviços por viatura', 'Despesas pagas, gasto por gasto'])
})

test('no relatório do dia, o serviço sem valor aparece como "Sem valor", não como R$ 0,00', () => {
  const secao = relatorioDaDre(montarDre(financeiro, extrato, servicos, 1), '2026-09-07', '2026-09-07').secoes[3]!
  expect(secao.linhas.map(l => l.at(-1))).toContain('Sem valor')
  // Agrupado por socorrista, com o nome curto na primeira coluna.
  expect(secao.linhas[0]![0]).toBe('DJALMA')
})
