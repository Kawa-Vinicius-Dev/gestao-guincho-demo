import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

/**
 * Km dos servicos, no celular. A regra que importa: o km vai para o turno aberto
 * junto com o numero da OS normalizado igual ao da importacao da Porto, que e
 * por onde ele se junta a OS depois.
 */
const SUPA = 'https://projeto-teste.supabase.co'

const semTurno = {
  socorrista: { id: 1, nome: 'JEFERSON MARTINS DA SILVA', qra: 'JM-12' },
  hoje: '2026-09-24',
  turnoAberto: null as unknown,
  turnosDevolvidos: [], ultimosTurnos: [], viaturas: [], veiculoSugerido: null,
}
const comTurno = {
  ...semTurno,
  turnoAberto: {
    id: 7, data: '2026-09-24', abertoEm: '2026-09-24T08:00:00Z', veiculoId: 2, veiculo: 'L168',
    hodometroInicial: 148320, temFotoAbertura: true, deDiaAnterior: false, observacoes: null,
  },
}

async function abrir() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  const { esquecerCliente } = await import('../dados/cliente')
  esquecerCliente()
  const { default: Pagina } = await import('./ServicosPage')
  render(<MemoryRouter><Pagina/></MemoryRouter>)
}

afterEach(() => vi.unstubAllEnvs())

test('sem turno aberto, manda abrir o turno primeiro', async () => {
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/meu_turno_do_dia`, () => HttpResponse.json(semTurno)))
  await abrir()

  expect(await screen.findByRole('heading', { name: 'Nenhum turno aberto' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ir para o turno' })).toHaveAttribute('href', '/turno')
})

test('lanca o numero da OS e o km, e soma o turno', async () => {
  let lancados = [{ id: 1, turno_id: 7, numero_os: '1111111-26', km: 12 }]
  let enviado: Record<string, unknown> | null = null
  servidor.use(
    http.post(`${SUPA}/rest/v1/rpc/meu_turno_do_dia`, () => HttpResponse.json(comTurno)),
    http.get(`${SUPA}/rest/v1/servicos_do_turno`, () => HttpResponse.json(lancados)),
    http.post(`${SUPA}/rest/v1/rpc/lancar_servico_do_turno`, async ({ request }) => {
      enviado = await request.json() as Record<string, unknown>
      lancados = [...lancados, { id: 2, turno_id: 7, numero_os: '1234567-26', km: 23.5 }]
      return HttpResponse.json(2)
    }),
  )
  const user = userEvent.setup({ delay: null })
  await abrir()

  expect(await screen.findByText('OS 1111111-26')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Lançar serviço' })).toBeDisabled()

  await user.type(screen.getByLabelText('Número da OS'), '1234567-26')
  await user.type(screen.getByLabelText('Km do serviço'), '23,5')
  await user.click(screen.getByRole('button', { name: 'Lançar serviço' }))

  expect(await screen.findByText('OS 1234567-26 lançada: 23,5 km.')).toBeInTheDocument()
  expect(enviado).toEqual({ p_numero_os: '1234567-26', p_numero_normalizado: '123456726', p_km: 23.5 })
  expect(await screen.findByText('OS 1234567-26')).toBeInTheDocument()
  expect(screen.getByText('2 serviços')).toBeInTheDocument()
  expect(screen.getByText('35,5 km')).toBeInTheDocument()
})
