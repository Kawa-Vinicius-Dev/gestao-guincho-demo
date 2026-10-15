import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import { URL_SUPABASE, servidor } from '../test/servidor'
import { escolher } from '../test/dropdown'

/**
 * Multas (Kawa, 15/10/2026): viatura, data e hora bastam para o sistema dizer
 * quem estava dirigindo; a multa sai no nome dele, com o desconto marcado.
 */

async function abrir(quem: unknown[]) {
  let pedidoQuem: Record<string, unknown> | null = null
  let lancada: Record<string, unknown> | null = null
  servidor.use(
    http.get(`${URL_SUPABASE}/rest/v1/veiculos`, () => HttpResponse.json([
      { id: 2, identificacao: 'L168', placa: 'ABC1D23', modelo: null, custo_por_km: 2.5, sigla_porto: 'L168', ativo: true }])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/listar_multas`, () => HttpResponse.json([])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/quem_estava_na_viatura`, async ({ request }) => {
      pedidoQuem = await request.json() as Record<string, unknown>
      return HttpResponse.json(quem)
    }),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/registrar_multa`, async ({ request }) => {
      lancada = await request.json() as Record<string, unknown>
      return HttpResponse.json({ id: 40 })
    }),
  )
  const { default: Pagina } = await import('./MultasPage')
  render(<MemoryRouter><Pagina /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Multas', level: 1 })
  return { pedidoQuem: () => pedidoQuem, lancada: () => lancada }
}

async function preencher(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Lançar multa' }))
  await escolher(user, 'Viatura', /L168/)
  fireEvent.change(screen.getByLabelText('Data da infração'), { target: { value: '2026-10-10' } })
  fireEvent.change(screen.getByLabelText('Hora da infração'), { target: { value: '14:30' } })
  await user.type(screen.getByLabelText(/Valor/), '19523')
  await user.type(screen.getByLabelText('Número do auto de infração'), 'SP123456')
}

test('acha quem estava com a viatura e lança no nome dele, com desconto', async () => {
  const user = userEvent.setup({ delay: null })
  const chamadas = await abrir([
    { turnoId: 1, motoristaId: 4, socorrista: 'DJALMA', abertoEm: '2026-10-10T10:00:00Z', fechadoEm: '2026-10-10T22:00:00Z' }])
  await preencher(user)

  expect(await screen.findByText('DJALMA')).toBeInTheDocument()
  expect(chamadas.pedidoQuem()).toEqual({ p_veiculo_id: 2, p_data: '2026-10-10', p_hora: '14:30' })
  expect(screen.getByLabelText('Descontar da comissão de quem estava dirigindo')).toBeChecked()

  await user.click(screen.getAllByRole('button', { name: 'Lançar multa' }).at(-1)!)
  expect(await screen.findByText(/Multa de R\$\s195,23 lançada/)).toBeInTheDocument()
  expect(chamadas.lancada()).toMatchObject({
    p_veiculo_id: 2, p_data: '2026-10-10', p_hora: '14:30', p_valor: 195.23, p_auto: 'SP123456',
    p_motorista_id: 4, p_desconta_comissao: true,
  })
})

test('sem turno no horário, avisa e deixa escolher ou lançar só na viatura', async () => {
  const user = userEvent.setup({ delay: null })
  const chamadas = await abrir([])
  await preencher(user)

  expect(await screen.findByText(/Ninguém estava com a viatura nesse horário/)).toBeInTheDocument()
  expect(screen.getByLabelText('Descontar da comissão de quem estava dirigindo')).toBeDisabled()

  await user.click(screen.getAllByRole('button', { name: 'Lançar multa' }).at(-1)!)
  await screen.findByText(/Multa de R\$\s195,23 lançada\./)
  expect(chamadas.lancada()).toMatchObject({ p_motorista_id: null, p_desconta_comissao: false })
})
