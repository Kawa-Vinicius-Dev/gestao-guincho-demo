import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

/**
 * Km dos servicos, no celular: iniciar com OS, km do painel e foto; finalizar
 * com km e foto. O numero da OS vai normalizado igual ao da importacao da Porto.
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

const foto = () => new File(['x'], 'painel.jpg', { type: 'image/jpeg' })

test('inicia o servico com OS, km e foto; sem localizacao, registra o motivo', async () => {
  let servicos: Record<string, unknown>[] = [
    { id: 1, turno_id: 7, numero_os: '1111111-26', km: 15, km_inicial: 148320, km_final: 148335,
      iniciado_em: '2026-09-24T09:00:00Z', finalizado_em: '2026-09-24T09:40:00Z', foto_inicio: 'turnos/7/servico-1-inicio.jpg' },
  ]
  let iniciado: Record<string, unknown> | null = null
  let fotoRegistrada: Record<string, unknown> | null = null
  let arquivo = ''
  servidor.use(
    http.post(`${SUPA}/rest/v1/rpc/meu_turno_do_dia`, () => HttpResponse.json(comTurno)),
    http.get(`${SUPA}/rest/v1/servicos_do_turno`, () => HttpResponse.json(servicos)),
    http.post(`${SUPA}/rest/v1/rpc/iniciar_servico_do_turno`, async ({ request }) => {
      iniciado = await request.json() as Record<string, unknown>
      return HttpResponse.json(2)
    }),
    http.post(`${SUPA}/storage/v1/object/comprovantes/*`, ({ request }) => {
      arquivo = new URL(request.url).pathname
      return HttpResponse.json({ Key: 'ok' })
    }),
    http.post(`${SUPA}/rest/v1/rpc/registrar_foto_inicio_servico`, async ({ request }) => {
      fotoRegistrada = await request.json() as Record<string, unknown>
      servicos = [...servicos, { id: 2, turno_id: 7, numero_os: '1234567-26', km: null, km_inicial: 148340, km_final: null,
        iniciado_em: '2026-09-24T10:00:00Z', finalizado_em: null, foto_inicio: 'turnos/7/servico-2-inicio.jpg' }]
      return HttpResponse.json(null)
    }),
  )
  const user = userEvent.setup({ delay: null })
  await abrir()

  expect(await screen.findByText('OS 1111111-26')).toBeInTheDocument()
  const iniciar = screen.getByRole('button', { name: 'Iniciar serviço' })
  expect(iniciar).toBeDisabled()

  await user.type(screen.getByLabelText('Número da OS'), '1234567-26')
  await user.type(screen.getByLabelText('Quilometragem do painel'), '148340')
  expect(iniciar).toBeDisabled()
  await user.upload(screen.getByLabelText(/Foto do painel/), foto())
  await user.click(screen.getByRole('button', { name: 'Iniciar serviço' }))

  expect(await screen.findByText(/Serviço da OS 1234567-26 iniciado\. Sem localização/)).toBeInTheDocument()
  expect(iniciado).toEqual({
    p_numero_os: '1234567-26', p_numero_normalizado: '123456726', p_km_inicial: 148340,
    p_latitude: null, p_longitude: null, p_precisao_m: null, p_sem_local: 'INDISPONIVEL',
  })
  expect(arquivo).toMatch(/turnos\/7\/servico-2-inicio\.jpg$/)
  expect(fotoRegistrada).toEqual({ p_id: 2, p_caminho: 'turnos/7/servico-2-inicio.jpg' })
  expect(await screen.findByRole('heading', { name: 'Serviço em andamento' })).toBeInTheDocument()
  expect(screen.getByText('em andamento')).toBeInTheDocument()
  expect(screen.getByText('1 serviço finalizado')).toBeInTheDocument()
})

test('finaliza o servico em andamento: km do painel e foto', async () => {
  let servicos: Record<string, unknown>[] = [
    { id: 2, turno_id: 7, numero_os: '1234567-26', km: null, km_inicial: 148340, km_final: null,
      iniciado_em: '2026-09-24T10:00:00Z', finalizado_em: null, foto_inicio: 'turnos/7/servico-2-inicio.jpg' },
  ]
  let finalizado: Record<string, unknown> | null = null
  servidor.use(
    http.post(`${SUPA}/rest/v1/rpc/meu_turno_do_dia`, () => HttpResponse.json(comTurno)),
    http.get(`${SUPA}/rest/v1/servicos_do_turno`, () => HttpResponse.json(servicos)),
    http.post(`${SUPA}/storage/v1/object/comprovantes/*`, () => HttpResponse.json({ Key: 'ok' })),
    http.post(`${SUPA}/rest/v1/rpc/finalizar_servico_do_turno`, async ({ request }) => {
      finalizado = await request.json() as Record<string, unknown>
      servicos = [{ ...servicos[0], km: 30, km_final: 148370, finalizado_em: '2026-09-24T11:00:00Z' }]
      return HttpResponse.json(30)
    }),
  )
  const user = userEvent.setup({ delay: null })
  await abrir()

  expect(await screen.findByRole('heading', { name: 'Serviço em andamento' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Iniciar serviço' })).not.toBeInTheDocument()
  await user.type(screen.getByLabelText('Quilometragem do painel agora'), '148370')
  expect(screen.getByText('30 km')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Finalizar serviço' })).toBeDisabled()
  await user.upload(screen.getByLabelText(/Foto do painel/), foto())
  await user.click(screen.getByRole('button', { name: 'Finalizar serviço' }))

  expect(await screen.findByText(/Serviço da OS 1234567-26 finalizado: 30 km\./)).toBeInTheDocument()
  expect(finalizado).toMatchObject({ p_id: 2, p_km_final: 148370, p_foto: 'turnos/7/servico-2-fim.jpg', p_sem_local: 'INDISPONIVEL' })
  expect(await screen.findByRole('button', { name: 'Iniciar serviço' })).toBeInTheDocument()
})
