import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import EquipePage from '../pages/EquipePage'
import { servidor } from '../test/servidor'

// a tela tem Link para o detalhe do socorrista, entao precisa de rota em volta
const comRota = (elemento: React.ReactNode) => render(<MemoryRouter>{elemento}</MemoryRouter>)

const socorrista = { id: 4, nome: 'Anderson Ribeiro', telefone: '(85) 90000-0000', qra: 'QRA-1', ativo: true, veiculoId: 7, veiculo: 'VTR-01' }

function comEquipe(lista: Record<string, unknown>[]) {
  servidor.use(
    http.get('/api/motoristas', () => HttpResponse.json(lista)),
    http.get('/api/veiculos', () => HttpResponse.json([{ id: 7, identificacao: 'VTR-01', placa: 'ABC1D23', custoPorKm: 2, ativo: true }])),
  )
}

test('edita um socorrista já cadastrado', async () => {
  let enviado: Record<string, unknown> | null = null
  comEquipe([socorrista])
  servidor.use(http.put('/api/motoristas/4', async ({ request }) => {
    enviado = await request.json() as Record<string, unknown>
    return HttpResponse.json({ ...socorrista, ...enviado, id: 4 })
  }))
  const user = userEvent.setup()
  comRota(<EquipePage />)

  await user.click(await screen.findByRole('button', { name: /editar/i }))
  const dialogo = screen.getByRole('dialog')
  const nome = within(dialogo).getByLabelText(/nome/i)
  await user.clear(nome); await user.type(nome, 'Anderson Ribeiro da Silva')
  await user.click(within(dialogo).getByRole('button', { name: /salvar alterações/i }))

  expect(enviado).toMatchObject({ nome: 'Anderson Ribeiro da Silva', qra: 'QRA-1', veiculoId: 7 })
  expect(await screen.findByText('Anderson Ribeiro da Silva')).toBeInTheDocument()
})

test('desativa sem sumir com o socorrista da tela', async () => {
  comEquipe([socorrista])
  servidor.use(http.patch('/api/motoristas/4/desativar', () => HttpResponse.json({ ...socorrista, ativo: false })))
  const user = userEvent.setup()
  comRota(<EquipePage />)

  await user.click(await screen.findByRole('button', { name: /desativar/i }))

  expect(await screen.findByText('Inativo')).toBeInTheDocument()
  expect(screen.getByText('Anderson Ribeiro')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /reativar/i })).toBeInTheDocument()
})

test('erro do backend ao desativar aparece na tela', async () => {
  comEquipe([socorrista])
  servidor.use(http.patch('/api/motoristas/4/desativar', () => HttpResponse.json({ detalhe: 'Socorrista não encontrado.' }, { status: 404 })))
  const user = userEvent.setup()
  comRota(<EquipePage />)

  await user.click(await screen.findByRole('button', { name: /desativar/i }))

  expect(await screen.findByText('Socorrista não encontrado.')).toBeInTheDocument()
})

test('socorrista desativado não é oferecido para vincular uma OS', async () => {
  const { default: PortoOrdensServicoPage } = await import('../pages/PortoOrdensServicoPage')
  servidor.use(
    http.get('/api/motoristas', () => HttpResponse.json([socorrista, { id: 5, nome: 'Quem Saiu', qra: 'QRA-2', ativo: false }])),
    http.get('/api/porto/ordens-servico', () => HttpResponse.json([{ id: 3, numero: 'OS-SEM', valorTotal: 300, qra: 'QRA-X', dataAtendimento: '2026-07-02' }])),
  )
  const user = userEvent.setup()
  comRota(<PortoOrdensServicoPage />)

  await user.click(await screen.findByRole('button', { name: /associar socorrista/i }))
  const opcoes = within(screen.getByRole('dialog')).getByLabelText(/socorrista respons/i)

  expect(within(opcoes).getByRole('option', { name: /anderson ribeiro/i })).toBeInTheDocument()
  expect(within(opcoes).queryByRole('option', { name: /quem saiu/i })).not.toBeInTheDocument()
})
