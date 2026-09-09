import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from '../App'
import { servidor } from '../test/servidor'

const TOKEN_KEY = 'fluxo-gestao:token:v1'

function abrir() {
  sessionStorage.setItem(TOKEN_KEY, 'token-admin-teste')
  window.history.replaceState({}, '', '/despesas')
  return render(<App />)
}

const aluguel = {
  id: 1, descricao: 'Aluguel do pátio', categoria: 'Combustível', categoriaId: 2,
  valor: 2500, diaVencimento: 10, ativo: true,
}

test('cadastra uma despesa fixa', async () => {
  let enviado: Record<string, unknown> | null = null
  let fixas: Record<string, unknown>[] = []
  servidor.use(
    http.get('/api/despesas-recorrentes', () => HttpResponse.json(fixas)),
    http.post('/api/despesas-recorrentes', async ({ request }) => {
      enviado = await request.json() as Record<string, unknown>
      fixas = [aluguel]
      return HttpResponse.json(aluguel, { status: 201 })
    }),
  )
  const user = userEvent.setup()
  abrir()

  await user.type(await screen.findByLabelText(/descrição da despesa fixa/i), 'Aluguel do pátio')
  await user.type(screen.getByLabelText(/valor da despesa fixa/i), '2500')
  await user.type(screen.getByLabelText(/dia do vencimento/i), '10')
  await user.click(screen.getByRole('button', { name: /adicionar/i }))

  expect(enviado).toMatchObject({ descricao: 'Aluguel do pátio', valor: 2500, diaVencimento: 10 })
  expect(await screen.findByText('Aluguel do pátio')).toBeInTheDocument()
})

test('lança o mês e conta o que já existia', async () => {
  let pedido = ''
  servidor.use(
    http.get('/api/despesas-recorrentes', () => HttpResponse.json([aluguel])),
    http.post('/api/despesas-recorrentes/lancamentos', ({ request }) => {
      pedido = new URL(request.url).searchParams.get('mes') ?? ''
      return HttpResponse.json({ mes: pedido, lancadas: 1, jaExistiam: 2, valorLancado: 2500, despesas: [] }, { status: 201 })
    }),
  )
  const user = userEvent.setup()
  abrir()

  await user.click(await screen.findByRole('button', { name: /lançar as fixas do mês/i }))

  expect(pedido).toMatch(/^\d{4}-\d{2}$/)
  expect(await screen.findByText(/1 despesa fixa lançada/i)).toBeInTheDocument()
  expect(screen.getByText(/2 já estavam lançadas/i)).toBeInTheDocument()
})

test('sem despesa fixa ativa não há o que lançar', async () => {
  servidor.use(http.get('/api/despesas-recorrentes', () => HttpResponse.json([{ ...aluguel, ativo: false }])))
  abrir()

  // espera a lista chegar: com a lista ainda vazia o botao ja estaria desabilitado por outro motivo
  expect(await screen.findByRole('button', { name: /reativar/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /lançar as fixas do mês/i })).toBeDisabled()
})
