import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from '../App'
import { servidor } from '../test/servidor'

const TOKEN_KEY = 'fluxo-gestao:token:v1'

function abrir() {
  sessionStorage.setItem(TOKEN_KEY, 'token-admin-teste')
  window.history.replaceState({}, '', '/configuracoes?aba=financeiro')
  return render(<App />)
}

/**
 * Despesas fixas moram em Configuracoes > Financeiro: cadastra uma vez e ela
 * entra sozinha, ja paga, no vencimento de cada mes (o banco lanca).
 */
const aluguel = {
  id: 1, descricao: 'Aluguel do pátio', categoria: 'Combustível', categoriaId: 2,
  valor: 2500, diaVencimento: 10, ativo: true,
}

async function cadastrar(user: ReturnType<typeof userEvent.setup>, campos: Record<string, string>) {
  await user.click(await screen.findByRole('button', { name: /nova despesa fixa/i }))
  const janela = await screen.findByRole('dialog', { name: /nova despesa fixa/i })
  if ('total de parcelas' in campos) await user.click(within(janela).getByRole('button', { name: 'Parcelada' }))
  for (const [rotulo, valor] of Object.entries(campos)) {
    await user.type(within(janela).getByLabelText(new RegExp(rotulo, 'i')), valor)
  }
  await user.click(within(janela).getByRole('button', { name: /cadastrar despesa fixa/i }))
}

test('cadastra uma despesa fixa e avisa que ela entra sozinha', async () => {
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
  const user = userEvent.setup({ delay: null })
  abrir()
  // Mascara de centavos: 250000 digitado vira R$ 2.500,00.
  await cadastrar(user, { '^descrição': 'Aluguel do pátio', 'valor por mês': '250000', 'dia do vencimento': '10' })

  expect(enviado).toMatchObject({ descricao: 'Aluguel do pátio', valor: 2500, diaVencimento: 10, totalParcelas: null })
  expect(await screen.findByText(/entra sozinha, já paga, todo dia 10/i)).toBeInTheDocument()
  expect(await screen.findByText('Aluguel do pátio')).toBeInTheDocument()
})

test('cadastra 10 parcelas com 3 já pagas, e a lista mostra a próxima', async () => {
  let enviado: Record<string, unknown> | null = null
  const seguro = { ...aluguel, id: 2, descricao: 'Seguro dos caminhões', valor: 5716.4,
    totalParcelas: 10, parcelaInicial: 4, proximaParcela: 4 }
  let fixas: Record<string, unknown>[] = []
  servidor.use(
    http.get('/api/despesas-recorrentes', () => HttpResponse.json(fixas)),
    http.post('/api/despesas-recorrentes', async ({ request }) => {
      enviado = await request.json() as Record<string, unknown>
      fixas = [seguro]
      return HttpResponse.json(seguro, { status: 201 })
    }),
  )
  const user = userEvent.setup({ delay: null })
  abrir()
  await cadastrar(user, { '^descrição': 'Seguro dos caminhões', 'valor por mês': '571640', 'dia do vencimento': '18',
    'total de parcelas': '10', 'parcelas já pagas': '3' })

  // 10 parcelas com 3 ja pagas: a proxima a entrar e a 4a.
  expect(enviado).toMatchObject({ parcelaInicial: 4, totalParcelas: 10 })
  expect(await screen.findByText('3 de 10 pagas · próxima 4ª')).toBeInTheDocument()
})

// Seguro e valor fixo de verdade: sem parcela, os campos de parcelas nem aparecem.
test('valor fixo todo mês não pede parcelas; parcelada pede', async () => {
  servidor.use(http.get('/api/despesas-recorrentes', () => HttpResponse.json([])))
  const user = userEvent.setup({ delay: null })
  abrir()
  await user.click(await screen.findByRole('button', { name: /nova despesa fixa/i }))
  const janela = await screen.findByRole('dialog', { name: /nova despesa fixa/i })
  expect(within(janela).getByRole('button', { name: 'Valor fixo todo mês' })).toHaveAttribute('aria-pressed', 'true')
  expect(within(janela).queryByLabelText(/total de parcelas/i)).not.toBeInTheDocument()
  await user.click(within(janela).getByRole('button', { name: 'Parcelada' }))
  expect(within(janela).getByLabelText(/total de parcelas/i)).toBeInTheDocument()
  expect(within(janela).getByLabelText(/parcelas já pagas/i)).toBeInTheDocument()
})
