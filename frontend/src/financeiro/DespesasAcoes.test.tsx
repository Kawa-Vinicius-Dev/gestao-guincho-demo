import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from '../App'
import { servidor } from '../test/servidor'
import { escolher } from '../test/dropdown'

const TOKEN_KEY = 'fluxo-gestao:token:v1'

const diesel = {
  id: 12, descricao: 'Almoço de Fulano', categoria: 'Alimentação', valor: 50,
  data: '2026-04-02', veiculo: 'L168', status: 'PAGO', aprovada: true, criadoPor: 'Kawã Viana',
}

function abrir() {
  servidor.use(
    http.get('/api/despesas', () => HttpResponse.json([diesel])),
    http.get('/api/categorias', () => HttpResponse.json([
      { id: 3, nome: 'Alimentação', tipo: 'DESPESA', ativo: true },
      { id: 2, nome: 'Combustível', tipo: 'DESPESA', ativo: true },
    ])),
    http.get('/api/motoristas', () => HttpResponse.json([{ id: 7, nome: 'Anderson Ribeiro', ativo: true }])),
  )
  sessionStorage.setItem(TOKEN_KEY, 'token-admin-teste')
  window.history.replaceState({}, '', '/despesas')
  return render(<App />)
}

// A lixeira fica no fim de uma linha larga, ao lado de "Registrar pagamento":
// errar o alvo e apagar dinheiro do resultado sem chance de desfazer.
test('a lixeira pergunta antes, mostrando qual despesa é', async () => {
  let pediuExclusao = false
  servidor.use(http.delete('/api/despesas/:id', () => { pediuExclusao = true; return HttpResponse.json({}) }))
  abrir()

  await userEvent.click(await screen.findByRole('button', { name: /excluir despesa almoço de fulano/i }))

  const janela = screen.getByRole('dialog', { name: /excluir despesa almoço de fulano/i })
  expect(within(janela).getByText('Almoço de Fulano')).toBeInTheDocument()
  expect(within(janela).getByText('Alimentação')).toBeInTheDocument()
  expect(within(janela).getByText('R$ 50,00')).toBeInTheDocument()
  expect(within(janela).getByText('02/04/2026')).toBeInTheDocument()
  expect(pediuExclusao).toBe(false)
})

test('manter despesa fecha a janela sem excluir nada', async () => {
  let pediuExclusao = false
  servidor.use(http.delete('/api/despesas/:id', () => { pediuExclusao = true; return HttpResponse.json({}) }))
  abrir()

  await userEvent.click(await screen.findByRole('button', { name: /excluir despesa almoço de fulano/i }))
  await userEvent.click(screen.getByRole('button', { name: /manter despesa/i }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(pediuExclusao).toBe(false)
  expect(screen.getByText('Almoço de Fulano')).toBeInTheDocument()
})

// Alimentação não tem viatura de propósito, e a coluna ficava com um traço: a
// linha não dizia de quem era o almoço. O nome já vinha na consulta.
test('a lista mostra de quem é a despesa, e não só a viatura', async () => {
  servidor.use(http.get('/api/despesas', () => HttpResponse.json([
    { ...diesel, id: 31, descricao: 'Almoço', categoria: 'Alimentação',
      veiculo: null, motorista: 'Anderson Ribeiro' },
    { ...diesel, id: 32, descricao: 'Diesel', categoria: 'Combustível',
      veiculo: 'L168', motorista: null },
  ])))
  sessionStorage.setItem(TOKEN_KEY, 'token-admin-teste')
  window.history.replaceState({}, '', '/despesas')
  render(<App />)

  const almoco = (await screen.findByText('Almoço')).closest('tr')!
  expect(within(almoco).getByText('Anderson Ribeiro')).toBeInTheDocument()

  // A despesa de viatura segue sem socorrista, e a coluna diz isso com um traço
  // em vez de repetir a viatura no lugar errado.
  const linhas = [...screen.getAllByRole('row')]
  const diesel2 = linhas.find(l => within(l).queryByText('Diesel'))!
  expect(within(diesel2).getByText('L168')).toBeInTheDocument()
})

// Kawa: registrar despesa estava demorado. O essencial basta: valor, categoria e
// data. Sem descricao, o nome da categoria ja diz o que foi.
test('despesa se registra só com valor e categoria', async () => {
  let enviado: Record<string, unknown> = {}
  servidor.use(http.post('/api/despesas', async ({ request }) => {
    enviado = await request.json() as Record<string, unknown>
    return HttpResponse.json({ ...diesel, id: 99, descricao: 'Combustível', status: 'PAGO' })
  }))
  abrir()
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: /^registrar despesa$/i }))
  const janela = screen.getByRole('dialog', { name: /registrar despesa/i })
  await user.type(within(janela).getByLabelText(/^valor$/i), '12000')
  await escolher(user, /^categoria$/i, 'Combustível', janela)
  await user.click(within(janela).getByRole('button', { name: /salvar despesa/i }))

  expect(enviado).toEqual(expect.objectContaining({ descricao: 'Combustível', valor: 120, categoriaId: 2 }))
})

// So existe de quem descontar quando ha socorrista: a marca aparece com ele.
test('descontar da comissão só aparece com socorrista escolhido', async () => {
  abrir()
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: /^registrar despesa$/i }))
  const janela = screen.getByRole('dialog', { name: /registrar despesa/i })
  expect(within(janela).queryByLabelText(/descontar da comissão/i)).not.toBeInTheDocument()

  await escolher(user, /^socorrista$/i, 'Anderson Ribeiro', janela)

  expect(within(janela).getByLabelText(/descontar da comissão/i)).not.toBeChecked()
})
