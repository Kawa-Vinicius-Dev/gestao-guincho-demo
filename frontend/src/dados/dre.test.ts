import { expect, test } from 'vitest'
import type { Dashboard, LancamentoFinanceiro } from '../types/modelos'
import { diasDoPeriodo, montarDre, relatorioDaDre } from './dre'
import { montarPdf } from './exportar'
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
  const dre = montarDre(financeiro, extrato, servicos)
  expect(dre.receitasAvulsas).toEqual([{ categoria: 'Crédito da OP', valor: 100 }])
  expect(dre.receitaServicos).toBe(1000)
  expect(dre.lucro).toBe(800)
})

test('despesas pagas por categoria, com cada gasto dentro', () => {
  const dre = montarDre(financeiro, extrato, servicos)
  expect(dre.despesas.map(d => [d.categoria, d.valor, d.itens.length])).toEqual([
    ['Combustível', 250, 2], ['Manutenção', 50, 1],
  ])
  // Do mais antigo para o mais novo, dentro da categoria.
  expect(dre.despesas[0]!.itens.map(l => l.id)).toEqual(['D2', 'D1'])
})

// Kawa, 23/09/2026: a DRE sai em uma folha A4, sem um servico por linha, em
// qualquer periodo; o um a um vai em abas do Excel.
test('a folha da DRE resume; serviço a serviço fica só no Excel', () => {
  expect(diasDoPeriodo('2026-09-07', '2026-09-07')).toBe(1)
  const dre = montarDre(financeiro, extrato, servicos)
  expect(dre.servicos).toMatchObject({ total: 3, semValor: 1, valor: 1000 })
  const relatorio = relatorioDaDre(dre, '2026-09-01', '2026-09-30')
  expect(relatorio.folhaUnica).toBe(true)
  expect(relatorio.secoes.filter(s => !s.aba).map(s => s.titulo)).toEqual([
    'Demonstrativo', 'Serviços por especialidade', 'Serviços por socorrista', 'Serviços por viatura', 'Conferência'])
  expect(relatorio.secoes.filter(s => s.aba).map(s => s.aba)).toEqual(['Serviços', 'Despesas'])
  expect(relatorio.resumo?.at(-1)).toEqual(['Situação', 'DRE parcial: 1 de 3 serviços aguardando OP'])
})

test('mês cheio de serviços continua em uma folha', async () => {
  const muitos = Array.from({ length: 600 }, (_, i) => os(i + 10, {
    valorPrevisto: 100, motoristaId: i % 30, motorista: `SOCORRISTA ${i % 30}`, viatura: `V${i % 20}`,
    especialidade: `Especialidade ${i % 15}`,
  }))
  const relatorio = relatorioDaDre(montarDre(financeiro, extrato, muitos), '2026-09-01', '2026-09-30')
  // As listas longas viram as maiores e "Outros".
  expect(relatorio.secoes[2]!.linhas).toHaveLength(8)
  expect(String(relatorio.secoes[2]!.linhas.at(-1)![0])).toMatch(/^Outros \(\d+\)$/)
  const bytes = new Uint8Array(await montarPdf(relatorio))
  const texto = new TextDecoder('latin1').decode(bytes)
  // O objeto /Pages do PDF diz quantas paginas ha.
  expect(/\/Count (\d+)/.exec(texto)?.[1]).toBe('1')
})

test('o arquivo da quinzena leva os números das OPs no nome', () => {
  const dre = montarDre(financeiro, extrato, servicos)
  expect(relatorioDaDre(dre, '2026-09-01', '2026-09-16', ['06438807', '06438808']).nomeArquivo).toBe('dre-OPs-06438807-06438808')
  expect(relatorioDaDre(dre, '2026-09-01', '2026-09-16').nomeArquivo).toBe('dre-2026-09-01-a-2026-09-16')
})

test('no Excel, o serviço sem valor aparece como "Sem valor", não como R$ 0,00', () => {
  const secao = relatorioDaDre(montarDre(financeiro, extrato, servicos), '2026-09-07', '2026-09-07').secoes.find(s => s.aba === 'Serviços')!
  expect(secao.linhas.map(l => l.at(-1))).toContain('Sem valor')
  expect(secao.linhas[0]![3]).toBe('DJALMA')
})
