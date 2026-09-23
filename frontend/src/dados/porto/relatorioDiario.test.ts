import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../../test/servidor'

/**
 * O fechamento do dia da operacao. O que importa checar aqui e a honestidade do
 * numero: o painel diario nao traz preco, entao servico sem valor nao pode sair
 * como R$ 0,00 — zero e uma afirmacao, e a afirmacao certa e "ainda nao sei".
 */
const SUPA = 'https://projeto-teste.supabase.co'

async function carregar() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('../cliente')
  esquecerCliente()
  return import('./relatorios')
}

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.unstubAllEnvs())

// A lista padrao (porto_listar_os) ja vem sem o cancelado; a hora e o
// cancelado chegam numa leitura curta da tabela.
const lista = {
  total: 3, semViatura: 0, valorTotal: 205, valorPrevisto: 385, semValor: 1, divergentes: 0, comissaoTotal: 41,
  itens: [
    { id: 1, numero: '5673329/26', especialidade: 'SOCORRO', viatura: 'V01', motoristaId: 1, motorista: 'SOCORRISTA UM',
      valorTotal: 205, valorPrevisto: 205, semValor: false, situacao: 'CONCILIADA', dataAtendimento: '2026-09-14' },
    { id: 2, numero: '5673528/26', especialidade: 'SOCORRO', viatura: 'V02', motoristaId: 2, motorista: 'SOCORRISTA DOIS',
      valorTotal: 0, valorPrevisto: null, semValor: true, situacao: 'AGUARDANDO_ANALISE', dataAtendimento: '2026-09-14' },
    // Valor informado a mao antes da OP: tem valor, nao e "a precificar".
    { id: 4, numero: '5679999/26', especialidade: 'REMOCAO', viatura: 'V02', motoristaId: 2, motorista: 'SOCORRISTA DOIS',
      valorTotal: 0, valorPrevisto: 180, valorManual: 180, semValor: false, situacao: 'VALOR_MANUAL', dataAtendimento: '2026-09-14' },
  ],
}
const extras = [
  { id: 1, data_hora_atendimento: '2026-09-14T09:34:00+00:00', status_operacional: 'NORMAL' },
  { id: 2, data_hora_atendimento: '2026-09-14T09:57:00+00:00', status_operacional: 'NORMAL' },
  { id: 3, data_hora_atendimento: '2026-09-14T12:02:00+00:00', status_operacional: 'CANCELADO' },
  { id: 4, data_hora_atendimento: '2026-09-14T13:10:00+00:00', status_operacional: 'NORMAL' },
]
const servidorDoDia = () => servidor.use(
  http.post(`${SUPA}/rest/v1/rpc/porto_listar_os`, () => HttpResponse.json(lista)),
  http.get(`${SUPA}/rest/v1/ordens_servico_porto`, () => HttpResponse.json(extras)),
)

test('o relatório do dia separa o que tem preço do que ainda não tem', async () => {
  servidorDoDia()
  const { relatorioDiarioPorto } = await carregar()

  const relatorio = await relatorioDiarioPorto('2026-09-14')

  expect(relatorio.titulo).toBe('Serviços prestados em 14/09/2026')
  // O cancelado nao conta como servico prestado, mas fica registrado no resumo.
  expect(relatorio.resumo).toContainEqual(['Serviços', '3'])
  expect(relatorio.resumo).toContainEqual(['Cancelados', '1'])
  expect(relatorio.resumo).toContainEqual(['Sem valor ainda', '1'])
  const linhas = relatorio.secoes[0].linhas
  expect(linhas).toHaveLength(3)
  expect(linhas[1].at(-1)).toBe('a precificar')
  // O valor informado a mao aparece; antes saia "a precificar".
  expect(linhas[2].at(-1)).toBe(180)
})

test('a hora é a de Brasília, e não a UTC que o banco devolve', async () => {
  servidorDoDia()
  const { relatorioDiarioPorto } = await carregar()

  const relatorio = await relatorioDiarioPorto('2026-09-14')

  expect(relatorio.secoes[0].linhas[0][1]).toBe('06:34')
})

test('soma por socorrista e por especialidade, na ordem do que produziu mais', async () => {
  servidorDoDia()
  const { relatorioDiarioPorto } = await carregar()

  const relatorio = await relatorioDiarioPorto('2026-09-14')

  const porSocorrista = relatorio.secoes.find(s => s.titulo === 'Por socorrista')!
  // Nome curto: os dois comecam com SOCORRISTA, entao entra o ultimo nome.
  expect(porSocorrista.linhas).toEqual([['SOCORRISTA UM', 1, 205], ['SOCORRISTA DOIS', 2, 180]])
  const porEspecialidade = relatorio.secoes.find(s => s.titulo === 'Por especialidade')!
  expect(porEspecialidade.linhas[0]).toEqual(['SOCORRO', 2, 205])
})
