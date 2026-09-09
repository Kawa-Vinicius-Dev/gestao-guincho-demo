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

test('a tela de configurações é alcançável e troca a senha pelo backend', async () => {
  let enviado: Record<string, unknown> | null = null
  servidor.use(http.put('/api/auth/senha', async ({ request }) => {
    enviado = await request.json() as Record<string, unknown>
    return new HttpResponse(null, { status: 204 })
  }))
  const user = userEvent.setup()
  abrir('/configuracoes')

  expect(await screen.findByRole('heading', { name: /configurações/i })).toBeInTheDocument()
  await user.type(screen.getByLabelText(/senha atual/i), 'Admin@123')
  await user.type(screen.getByLabelText(/nova senha/i), 'SenhaNova@2026')
  await user.click(screen.getByRole('button', { name: /alterar senha/i }))

  expect(await screen.findByText(/senha alterada/i)).toBeInTheDocument()
  expect(enviado).toEqual({ senhaAtual: 'Admin@123', novaSenha: 'SenhaNova@2026' })
})

test('erro do backend ao trocar a senha aparece na tela', async () => {
  servidor.use(http.put('/api/auth/senha', () => HttpResponse.json(
    { detalhe: 'A senha atual não confere.' }, { status: 400 })))
  const user = userEvent.setup()
  abrir('/configuracoes')

  await screen.findByRole('heading', { name: /configurações/i })
  await user.type(screen.getByLabelText(/senha atual/i), 'ErradaDemais')
  await user.type(screen.getByLabelText(/nova senha/i), 'SenhaNova@2026')
  await user.click(screen.getByRole('button', { name: /alterar senha/i }))

  expect(await screen.findByText('A senha atual não confere.')).toBeInTheDocument()
})
