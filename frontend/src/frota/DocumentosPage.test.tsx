import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { URL_SUPABASE, servidor } from '../test/servidor'
import { escolher } from '../test/dropdown'

/** Documentos (Kawa, 24/09/2026): vencido e vencendo aparecem primeiro, e cada quadro filtra. */
const documentos = [
  { id: 1, tipo: 'CRLV', vence_em: '2026-09-20', observacao: null, veiculo_id: 2, motorista_id: null,
    veiculos: { identificacao: 'L168' }, motoristas: null },
  { id: 2, tipo: 'Seguro', vence_em: '2026-10-10', observacao: 'Apólice 123', veiculo_id: 2, motorista_id: null,
    veiculos: { identificacao: 'L168' }, motoristas: null },
  { id: 3, tipo: 'CNH', vence_em: '2027-05-01', observacao: null, veiculo_id: null, motorista_id: 4,
    veiculos: null, motoristas: { nome: 'DJALMA BEZERRA' } },
]

async function abrir(caminho = '/documentos') {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-24T12:00:00'))
  let criado: unknown = null
  servidor.use(
    http.get(`${URL_SUPABASE}/rest/v1/documentos`, () => HttpResponse.json(documentos)),
    http.post(`${URL_SUPABASE}/rest/v1/documentos`, async ({ request }) => {
      criado = await request.json(); return HttpResponse.json([{ id: 9 }], { status: 201 })
    }),
    http.get(`${URL_SUPABASE}/rest/v1/veiculos`, () => HttpResponse.json([
      { id: 2, identificacao: 'L168', placa: 'ABC1D23', modelo: null, custo_por_km: 2.5, sigla_porto: 'L168', ativo: true }])),
  )
  const { default: Pagina } = await import('./DocumentosPage')
  render(<MemoryRouter initialEntries={[caminho]}><Pagina /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Documentos', level: 1 })
  vi.useRealTimers()
  return () => criado
}

test('conta vencidos e os que vencem em 30 dias, e diz quanto falta', async () => {
  await abrir()

  expect(screen.getByRole('link', { name: /Vencidos/ })).toHaveTextContent('1')
  expect(screen.getByRole('link', { name: /Vencem em 30 dias/ })).toHaveTextContent('1')
  expect(screen.getByText('vencido há 4 dias')).toBeInTheDocument()
  expect(screen.getByText('vence em 16 dias')).toBeInTheDocument()
})

test('o filtro da URL mostra só os vencidos', async () => {
  await abrir('/documentos?filtro=VENCIDO')

  const tabela = screen.getByRole('table')
  expect(within(tabela).getByText('CRLV')).toBeInTheDocument()
  expect(within(tabela).queryByText('CNH')).not.toBeInTheDocument()
})

test('cadastra o documento de uma viatura', async () => {
  const criado = await abrir()
  const user = userEvent.setup({ delay: null })

  await user.click(screen.getByRole('button', { name: 'Novo documento' }))
  await escolher(user, 'Viatura', 'L168')
  await user.type(screen.getByLabelText('Documento'), 'Tacógrafo')
  await user.type(screen.getByLabelText('Vence em'), '2027-01-15')
  await user.click(screen.getByRole('button', { name: 'Salvar documento' }))

  expect(await screen.findByText('Documento Tacógrafo cadastrado.')).toBeInTheDocument()
  expect(criado()).toMatchObject({ tipo: 'Tacógrafo', vence_em: '2027-01-15', veiculo_id: 2, motorista_id: null })
})
