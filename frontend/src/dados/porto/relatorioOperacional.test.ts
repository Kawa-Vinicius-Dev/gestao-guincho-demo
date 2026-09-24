import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { URL_SUPABASE, servidor } from '../../test/servidor'

/**
 * Relatorio operacional (Kawa, 23/09/2026): De–até pela data do atendimento,
 * todos os servicos, nenhum valor, canceladas marcadas e contadas a parte.
 */
async function carregar() {
  vi.resetModules()
  const { esquecerCliente } = await import('../cliente')
  esquecerCliente()
  return import('./relatorios')
}

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.unstubAllEnvs())

const lista = {
  total: 3, semViatura: 1, valorTotal: 205, valorPrevisto: 385, semValor: 1, divergentes: 0, comissaoTotal: 41,
  itens: [
    { id: 1, numero: '5673329/26', especialidade: 'SOCORRO', viatura: 'V01', motoristaId: 1, motorista: 'SOCORRISTA UM',
      valorTotal: 205, valorPrevisto: 205, semValor: false, situacao: 'CONCILIADA', dataAtendimento: '2026-09-15', numeroOp: '06438807' },
    { id: 2, numero: '5673528/26', especialidade: 'SOCORRO', viatura: null, motoristaId: 2, motorista: 'SOCORRISTA DOIS',
      valorTotal: 0, valorPrevisto: null, semValor: true, situacao: 'AGUARDANDO_ANALISE', dataAtendimento: '2026-09-14' },
    { id: 4, numero: '5679999/26', especialidade: 'REMOCAO', viatura: 'V02', motoristaId: 2, motorista: 'SOCORRISTA DOIS',
      valorTotal: 0, valorPrevisto: 180, semValor: false, situacao: 'VALOR_MANUAL', dataAtendimento: '2026-09-14' },
  ],
}
const canceladas = [{ id: 3, numero: '5670000/26', data_atendimento: '2026-09-14', especialidade: 'SOCORRO',
  sigla_viatura: 'V01', motoristas: { nome: 'SOCORRISTA UM' } }]

function responder() {
  let porCompetencia: unknown
  servidor.use(
    http.post(`${URL_SUPABASE}/rest/v1/rpc/porto_listar_os`, async ({ request }) => {
      porCompetencia = ((await request.json()) as Record<string, unknown>).p_por_competencia
      return HttpResponse.json(lista)
    }),
    http.get(`${URL_SUPABASE}/rest/v1/ordens_servico_porto`, () => HttpResponse.json(canceladas)),
  )
  return () => porCompetencia
}

test('conta pela data do atendimento e não mostra valor nenhum', async () => {
  const modo = responder()
  const { relatorioOperacional } = await carregar()

  const relatorio = await relatorioOperacional('2026-09-14', '2026-09-15')

  expect(modo()).toBe(false)
  const titulos = relatorio.secoes.flatMap(s => s.colunas.map(c => c.titulo))
  expect(titulos).not.toContain('Valor')
  expect(relatorio.secoes.flatMap(s => s.colunas).some(c => c.tipo === 'moeda')).toBe(false)
  expect(relatorio.subtitulo).toBe('Serviços de 14/09/2026 a 15/09/2026')
})

test('lista todos, em ordem de data, com a situação; cancelada marcada e fora do total', async () => {
  responder()
  const { relatorioOperacional } = await carregar()

  const relatorio = await relatorioOperacional('2026-09-14', '2026-09-15')

  expect(relatorio.resumo).toContainEqual(['Serviços', '3'])
  expect(relatorio.resumo).toContainEqual(['Canceladas', '1'])
  expect(relatorio.resumo).toContainEqual(['Já na OP', '1'])
  expect(relatorio.resumo).toContainEqual(['Sem viatura', '1'])
  const servicos = relatorio.secoes.find(s => s.titulo === 'Serviços prestados')!
  expect(servicos.linhas.map(l => [l[0], l[1], l[5]])).toEqual([
    ['2026-09-14', '5670000/26', 'Cancelada'],
    ['2026-09-14', '5673528/26', 'Aguardando OP'],
    ['2026-09-14', '5679999/26', 'Aguardando OP'],
    ['2026-09-15', '5673329/26', 'OP 06438807'],
  ])
  expect(servicos.totais?.at(-1)).toBe('+ 1 cancelada')
})

test('conta por especialidade e por socorrista, com nome curto', async () => {
  responder()
  const { relatorioOperacional } = await carregar()

  const relatorio = await relatorioOperacional('2026-09-14', '2026-09-15')

  expect(relatorio.secoes.find(s => s.titulo === 'Por especialidade')!.linhas).toEqual([['SOCORRO', 2], ['REMOCAO', 1]])
  // Os dois comecam com SOCORRISTA: entra o ultimo nome.
  expect(relatorio.secoes.find(s => s.titulo === 'Por socorrista')!.linhas).toEqual([['SOCORRISTA DOIS', 2], ['SOCORRISTA UM', 1]])
})

// A linha de total escreve "Total" na coluna de Data: o PDF nao pode tentar ler isso como data.
test('o PDF sai, e um dia comum cabe em uma folha', async () => {
  responder()
  const { relatorioOperacional } = await carregar()
  const { folhasDoPdf, montarPdf } = await import('../exportar')

  const bytes = await montarPdf(await relatorioOperacional('2026-09-14', '2026-09-15'))

  expect(folhasDoPdf(bytes)).toBe(1)
})
