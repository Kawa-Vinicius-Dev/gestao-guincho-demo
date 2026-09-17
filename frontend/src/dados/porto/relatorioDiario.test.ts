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

const servicos = [
  { id: 1, numero: '5673329/26', valor_total: 205, especialidade: 'SOCORRO',
    sigla_viatura: 'V01', socorrista: 'SOCORRISTA UM', qra: '000001',
    data_atendimento: '2026-09-14', data_hora_atendimento: '2026-09-14T06:34:00-03:00',
    seguradora: 'PORTO SEGURO', status_operacional: 'NORMAL', status_financeiro: 'RECEBIDO',
    ciclos_atraso: 0, motoristas: { nome: 'Socorrista Um' } },
  { id: 2, numero: '5673528/26', valor_total: 0, especialidade: 'SOCORRO',
    sigla_viatura: 'V02', socorrista: 'SOCORRISTA DOIS', qra: '000002',
    data_atendimento: '2026-09-14', data_hora_atendimento: '2026-09-14T06:57:00-03:00',
    seguradora: 'PORTO SEGURO', status_operacional: 'NORMAL', status_financeiro: 'AGUARDANDO_OP',
    ciclos_atraso: 0, motoristas: { nome: 'Socorrista Dois' } },
  { id: 3, numero: '5677129/26', valor_total: 0, especialidade: 'SOCORRO',
    sigla_viatura: null, socorrista: null, qra: null,
    data_atendimento: '2026-09-14', data_hora_atendimento: '2026-09-14T09:02:00-03:00',
    seguradora: 'PORTO SEGURO', status_operacional: 'CANCELADO', status_financeiro: 'AGUARDANDO_OP',
    ciclos_atraso: 0, motoristas: null },
]

test('o relatório do dia separa o que tem preço do que ainda não tem', async () => {
  servidor.use(http.get(`${SUPA}/rest/v1/ordens_servico_porto`, () => HttpResponse.json(servicos)))
  const { relatorioDiarioPorto } = await carregar()

  const relatorio = await relatorioDiarioPorto('2026-09-14')

  expect(relatorio.titulo).toBe('Serviços prestados em 14/09/2026')
  // O cancelado nao conta como servico prestado, mas fica registrado no resumo.
  expect(relatorio.resumo).toContainEqual(['Serviços', '2'])
  expect(relatorio.resumo).toContainEqual(['Cancelados', '1'])
  const linhas = relatorio.secoes[0].linhas
  expect(linhas).toHaveLength(2)
  expect(linhas[1].at(-1)).toBe('a precificar')
})

test('soma por socorrista e por especialidade, na ordem do que produziu mais', async () => {
  servidor.use(http.get(`${SUPA}/rest/v1/ordens_servico_porto`, () => HttpResponse.json(servicos)))
  const { relatorioDiarioPorto } = await carregar()

  const relatorio = await relatorioDiarioPorto('2026-09-14')

  const porSocorrista = relatorio.secoes.find(s => s.titulo === 'Por socorrista')!
  expect(porSocorrista.linhas[0]).toEqual(['Socorrista Um', 1, 205])
  const porEspecialidade = relatorio.secoes.find(s => s.titulo === 'Por especialidade')!
  expect(porEspecialidade.linhas[0]).toEqual(['SOCORRO', 2, 205])
})
