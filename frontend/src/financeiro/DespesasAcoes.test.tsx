import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from '../App'
import { servidor } from '../test/servidor'

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

// O formulario pedia viatura E socorrista, mas a despesa so chegava na viatura:
// no painel, despesa com viatura preenchida e custo da viatura, e o socorrista
// so recebe a que nao tem viatura ou a que e alimentacao dele. Alimentacao e
// sempre do socorrista, entao a viatura sai do caminho.
test('escolher Alimentação desativa a viatura e exige o socorrista', async () => {
  abrir()

  await userEvent.click(await screen.findByRole('button', { name: /^registrar despesa$/i }))
  const janela = screen.getByRole('dialog', { name: /registrar despesa/i })
  await userEvent.selectOptions(within(janela).getByLabelText('Categoria'), '2')
  expect(within(janela).getByLabelText('Veículo')).toBeEnabled()

  await userEvent.selectOptions(within(janela).getByLabelText('Categoria'), '3')

  expect(within(janela).getByLabelText('Veículo')).toBeDisabled()
  expect(within(janela).getByLabelText('Socorrista')).toBeRequired()
  expect(within(janela).getByText(/custo do socorrista, não da viatura/i)).toBeInTheDocument()
})

test('a despesa de alimentação sai marcada e sem viatura', async () => {
  let enviado: Record<string, unknown> = {}
  servidor.use(http.post('/api/despesas', async ({ request }) => {
    enviado = await request.json() as Record<string, unknown>
    return HttpResponse.json({ ...diesel, id: 99 }, { status: 201 })
  }))
  abrir()

  await userEvent.click(await screen.findByRole('button', { name: /^registrar despesa$/i }))
  const janela = screen.getByRole('dialog', { name: /registrar despesa/i })
  await userEvent.type(within(janela).getByLabelText('Descrição'), 'Almoço de Fulano')
  await userEvent.type(within(janela).getByLabelText('Valor'), '5000')
  await userEvent.selectOptions(within(janela).getByLabelText('Categoria'), '3')
  await userEvent.selectOptions(within(janela).getByLabelText('Socorrista'), '7')
  await userEvent.click(within(janela).getByRole('button', { name: /enviar despesa/i }))

  expect(enviado.natureza).toBe('ALIMENTACAO_FUNCIONARIO')
  expect(enviado.motoristaId).toBe(7)
  expect(enviado.veiculoId).toBeNull()
})

// O <select> de categoria nao tem opcao vazia: abre ja na primeira da lista.
// O estado nascia em '' enquanto a tela mostrava "Alimentação", entao o campo de
// veiculo so desativava depois de reescolher a opcao que ja estava a vista.
test('a categoria que o campo já mostra ao abrir é a que vale', async () => {
  abrir()

  await userEvent.click(await screen.findByRole('button', { name: /^registrar despesa$/i }))
  const janela = screen.getByRole('dialog', { name: /registrar despesa/i })

  // Alimentação é a primeira da lista devolvida pelo servidor deste teste.
  expect(within(janela).getByLabelText('Categoria')).toHaveValue('3')
  expect(within(janela).getByLabelText('Veículo')).toBeDisabled()
  expect(within(janela).getByText(/custo do socorrista, não da viatura/i)).toBeInTheDocument()
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
