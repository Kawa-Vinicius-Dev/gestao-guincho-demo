import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from '../App'
import { servidor } from '../test/servidor'

const TOKEN_KEY = 'fluxo-gestao:token:v1'

function abrir(path: string) {
  sessionStorage.setItem(TOKEN_KEY, 'token-admin-teste')
  window.history.replaceState({}, '', path)
  return render(<App />)
}

// O backend hiberna no plano gratuito da Render: a primeira chamada depois da pausa costuma
// falhar. A tela precisa dizer isso, e nao aparecer vazia como se nao houvesse nada cadastrado.
test('falha ao carregar despesas aparece na tela', async () => {
  servidor.use(http.get('/api/despesas', () => HttpResponse.json({ detalhe: 'Serviço indisponível.' }, { status: 503 })))

  abrir('/despesas')

  expect(await screen.findByText('Serviço indisponível.')).toBeInTheDocument()
})

test('falha ao aprovar uma despesa aparece na tela', async () => {
  servidor.use(
    http.get('/api/despesas', () => HttpResponse.json([{
      id: 7, descricao: 'Gasolina do plantão', categoria: 'Combustível', valor: 250,
      data: '2026-08-02', status: 'PENDENTE', aprovada: false, criadoPor: 'Socorrista',
    }])),
    http.patch('/api/despesas/7/aprovar', () => HttpResponse.json({ detalhe: 'Despesa já aprovada.' }, { status: 400 })),
  )
  const user = userEvent.setup()
  abrir('/despesas')

  await user.click(await screen.findByRole('button', { name: /aprovar/i }))

  expect(await screen.findByText('Despesa já aprovada.')).toBeInTheDocument()
})

test('falha ao carregar receitas aparece na tela', async () => {
  servidor.use(http.get('/api/receitas', () => HttpResponse.json({ detalhe: 'Serviço indisponível.' }, { status: 503 })))

  abrir('/receitas')

  expect(await screen.findByText('Serviço indisponível.')).toBeInTheDocument()
})
