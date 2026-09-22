import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

/**
 * O socorrista nao escolhe quem ele e nem em que viatura estava: as duas coisas
 * vem do turno aberto. Escolher abria caminho para o gasto cair no nome de
 * outro, ou numa viatura que ele nao dirigiu — e quem confere depois nao tem
 * como saber que foi troca.
 */
const SUPA = 'https://projeto-teste.supabase.co'

const turnoAberto = {
  socorrista: { id: 7, nome: 'ANDERSON JORGE RIBEIRO', qra: 'AJ-01' },
  hoje: '2026-09-22',
  turnoAberto: { id: 3, data: '2026-09-22', abertoEm: '2026-09-22T06:00:00Z',
    veiculoId: 2, veiculo: 'L168', hodometroInicial: 148320, temFotoAbertura: true,
    deDiaAnterior: false },
  turnosDevolvidos: [], ultimosTurnos: [], viaturas: [], veiculoSugerido: 2,
}

async function abrir(turno: Record<string, unknown>) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  servidor.use(
    http.post(`${SUPA}/rest/v1/rpc/meu_turno_do_dia`, () => HttpResponse.json(turno)),
    http.get(`${SUPA}/rest/v1/categorias`, () => HttpResponse.json([{ id: 1, nome: 'Alimentação', tipo: 'DESPESA', ativo: true }])),
    http.get(`${SUPA}/rest/v1/veiculos`, () => HttpResponse.json([])),
    http.get(`${SUPA}/rest/v1/motoristas`, () => HttpResponse.json([])),
    http.get(`${SUPA}/rest/v1/despesas_recorrentes`, () => HttpResponse.json([])),
  )
  const { esquecerCliente } = await import('../dados/cliente')
  esquecerCliente()
  const { AuthProvider } = await import('../auth/AuthContext')
  const { default: Pagina } = await import('./DespesasPage')
  render(<MemoryRouter><AuthProvider><Pagina/></AuthProvider></MemoryRouter>)
}

beforeEach(() => { sessionStorage.clear() })
afterEach(() => vi.unstubAllEnvs())

test('o gasto sai no nome do socorrista e na viatura do turno, sem ele escolher', async () => {
  let enviado: Record<string, unknown> | null = null
  await abrir(turnoAberto)
  servidor.use(http.post(`${SUPA}/rest/v1/despesas`, async ({ request }) => {
    enviado = await request.json() as Record<string, unknown>
    return HttpResponse.json([{ id: 1, descricao: 'Alimentação', valor: 40, status: 'PENDENTE' }])
  }))
  const user = userEvent.setup({ delay: null })

  // A chamada ja diz de quem e a viatura antes de abrir o formulario.
  expect(await screen.findByText('ANDERSON JORGE RIBEIRO')).toBeInTheDocument()
  expect(screen.getByText('L168')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /registrar um gasto/i }))

  // Dentro do formulario continuam sendo fato, e nao campo para escolher.
  expect(screen.queryByLabelText(/^socorrista$/i)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/^viatura$/i)).not.toBeInTheDocument()
})

test('sem turno aberto não dá para lançar: a tela manda abrir o turno', async () => {
  await abrir({ ...turnoAberto, turnoAberto: null })

  expect(await screen.findByText(/abra o turno antes/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /registrar um gasto/i })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /abrir turno/i })).toBeInTheDocument()
})
