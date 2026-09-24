import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import { URL_SUPABASE, servidor } from '../test/servidor'

/**
 * Manutencao (Kawa, 24/09/2026): o km vem do odometro dos turnos; a troca avisa
 * 1.000 km antes; o dano do checklist fica aberto ate alguem resolver.
 */
const planos = [
  { id: 1, veiculo_id: 2, viatura: 'L168', item: 'Troca de óleo', intervalo_km: 10000, ultimo_km: '140000.00',
    ultima_data: '2026-06-10', km_atual: '150400.00', faltam_km: '-400.00' },
  { id: 2, veiculo_id: 2, viatura: 'L168', item: 'Pneus', intervalo_km: 40000, ultimo_km: '120000.00',
    ultima_data: null, km_atual: '150400.00', faltam_km: '9600.00' },
]
const danos = [
  { id: 7, veiculo_id: 2, turno_id: 31, motorista_id: 4, descricao: 'Retrovisor direito quebrado', visto_em: '2026-09-22',
    resolvido_em: null, observacao: null, veiculos: { identificacao: 'L168' }, motoristas: { nome: 'DJALMA BEZERRA' } },
]

async function abrir() {
  let atualizado: unknown = null
  servidor.use(
    http.post(`${URL_SUPABASE}/rest/v1/rpc/manutencao_da_frota`, () => HttpResponse.json(planos)),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/km_atual_das_viaturas`, () => HttpResponse.json([{ veiculo_id: 2, km_atual: '150400.00' }])),
    http.get(`${URL_SUPABASE}/rest/v1/viatura_danos`, () => HttpResponse.json(danos)),
    http.patch(`${URL_SUPABASE}/rest/v1/:tabela`, async ({ request }) => {
      atualizado = await request.json(); return HttpResponse.json([{ id: 1 }])
    }),
  )
  const { default: Pagina } = await import('./ManutencaoPage')
  render(<MemoryRouter><Pagina /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Manutenção', level: 1 })
  return () => atualizado
}

test('troca vencida e dano aberto aparecem contados e na lista', async () => {
  await abrir()

  expect(screen.getByRole('link', { name: /Troca vencida/ })).toHaveTextContent('1')
  expect(screen.getByRole('link', { name: /Danos em aberto/ })).toHaveTextContent('1')
  const oleo = screen.getByText('Troca de óleo').closest('tr')!
  expect(within(oleo).getByText('passou 400 km')).toBeInTheDocument()
  expect(within(oleo).getByText('Vencida')).toBeInTheDocument()
  const dano = screen.getByText('Retrovisor direito quebrado').closest('tr')!
  expect(within(dano).getByText('no checklist do turno')).toBeInTheDocument()
  expect(within(dano).getByRole('link', { name: 'DJALMA' })).toBeInTheDocument()
})

test('registrar a troca recomeça a contagem do odômetro atual', async () => {
  const atualizado = await abrir()
  const user = userEvent.setup({ delay: null })

  const oleo = screen.getByText('Troca de óleo').closest('tr')!
  await user.click(within(oleo).getByRole('button', { name: 'Registrar troca' }))
  expect(screen.getByLabelText('Odômetro na troca')).toHaveValue('150400')
  await user.click(screen.getByRole('button', { name: 'Salvar troca' }))

  expect(await screen.findByText(/Troca de óleo da L168 registrado com 150\.400 km/)).toBeInTheDocument()
  expect(atualizado()).toMatchObject({ ultimo_km: 150400 })
})

test('dano resolvido sai da lista de abertos', async () => {
  const atualizado = await abrir()
  const user = userEvent.setup({ delay: null })

  const dano = screen.getByText('Retrovisor direito quebrado').closest('tr')!
  await user.click(within(dano).getByRole('button', { name: 'Resolvido' }))
  await user.type(screen.getByLabelText('Observação'), 'Trocado na oficina do Zé')
  await user.click(screen.getByRole('button', { name: 'Marcar como resolvido' }))

  expect(await screen.findByText('Dano da L168 marcado como resolvido.')).toBeInTheDocument()
  expect(atualizado()).toMatchObject({ observacao: 'Trocado na oficina do Zé' })
})
