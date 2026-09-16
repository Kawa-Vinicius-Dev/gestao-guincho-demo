import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../../test/servidor'

/**
 * O fechamento do dia da operação. O que importa checar aqui é a honestidade do
 * número: o painel diário não traz preço, então serviço sem valor não pode sair
 * como R$ 0,00 — zero é uma afirmação, e a afirmação certa é "ainda não sei".
 */
const SUPA = 'https://projeto-teste.supabase.co'

let csv = ''

async function carregar() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('../cliente')
  esquecerCliente()
  return import('../porto')
}

beforeEach(() => {
  csv = ''
  sessionStorage.clear()
  // O arquivo nao chega a existir no teste: o que interessa e o texto que iria
  // para dentro dele. O Blob do jsdom nao tem `text()`, entao o conteudo e
  // capturado na criacao.
  const BlobOriginal = globalThis.Blob
  class BlobEspiao extends BlobOriginal {
    constructor(partes: BlobPart[], opcoes?: BlobPropertyBag) {
      super(partes, opcoes)
      csv = partes.map(String).join('')
    }
  }
  globalThis.Blob = BlobEspiao as unknown as typeof Blob
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true, value: vi.fn(() => 'blob:teste'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  HTMLAnchorElement.prototype.click = vi.fn()
})
afterEach(() => vi.unstubAllEnvs())

const servicos = [
  { id: 1, numero: '5673329/26', valor_total: 205, especialidade: 'SOCORRO',
    sigla_viatura: 'L168', socorrista: 'LUIZ FELIPE DA SILVA', qra: '622786',
    data_atendimento: '2026-09-14', data_hora_atendimento: '2026-09-14T06:34:00-03:00',
    seguradora: 'PORTO SEGURO', status_operacional: 'NORMAL', status_financeiro: 'RECEBIDO',
    ciclos_atraso: 0, motoristas: { nome: 'Luiz Felipe da Silva' } },
  { id: 2, numero: '5673528/26', valor_total: 0, especialidade: 'SOCORRO',
    sigla_viatura: 'L25', socorrista: 'QEBSON RAMOS DA SILVA', qra: '609690',
    data_atendimento: '2026-09-14', data_hora_atendimento: '2026-09-14T06:57:00-03:00',
    seguradora: 'AZUL SEGUROS', status_operacional: 'NORMAL', status_financeiro: 'AGUARDANDO_OP',
    ciclos_atraso: 0, motoristas: { nome: 'Qebson Ramos da Silva' } },
  { id: 3, numero: '5677129/26', valor_total: 0, especialidade: 'SOCORRO',
    sigla_viatura: null, socorrista: null, qra: null,
    data_atendimento: '2026-09-14', data_hora_atendimento: '2026-09-14T09:02:00-03:00',
    seguradora: 'PORTO SEGURO', status_operacional: 'CANCELADO', status_financeiro: 'AGUARDANDO_OP',
    ciclos_atraso: 0, motoristas: null },
]

test('o relatório do dia separa o que tem preço do que ainda não tem', async () => {
  servidor.use(http.get(`${SUPA}/rest/v1/ordens_servico_porto`, () => HttpResponse.json(servicos)))
  const { baixarRelatorioDiarioPorto } = await carregar()

  await baixarRelatorioDiarioPorto('2026-09-14')
  expect(csv).not.toBe('')

  expect(csv).toContain('Serviços prestados em 14/09/2026')
  // O cancelado nao conta como servico prestado, mas fica registrado no resumo.
  expect(csv).toContain('Serviços;2')
  expect(csv).toContain('Cancelados;1')
  expect(csv).toContain('a precificar')
  expect(csv).not.toContain('R$ 0,00')
})

test('soma por socorrista e por especialidade, na ordem do que produziu mais', async () => {
  servidor.use(http.get(`${SUPA}/rest/v1/ordens_servico_porto`, () => HttpResponse.json(servicos)))
  const { baixarRelatorioDiarioPorto } = await carregar()

  await baixarRelatorioDiarioPorto('2026-09-14')
  expect(csv).not.toBe('')

  expect(csv).toContain('Por socorrista')
  expect(csv).toContain('Luiz Felipe da Silva;1;R$ 205,00')
  expect(csv).toContain('Por especialidade')
  expect(csv).toContain('SOCORRO;2;R$ 205,00')
})
