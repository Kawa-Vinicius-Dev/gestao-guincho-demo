import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, test } from 'vitest'
import App from '../App'
import { servidor } from '../test/servidor'

const TOKEN_KEY = 'fluxo-gestao:token:v1'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})

async function entrar(email = 'admin@fluxogestao.local', senha = 'Admin@123') {
  const user = userEvent.setup()
  await user.clear(await screen.findByLabelText(/e-mail/i))
  await user.type(screen.getByLabelText(/e-mail/i), email)
  await user.clear(screen.getByLabelText(/senha/i))
  await user.type(screen.getByLabelText(/senha/i), senha)
  await user.click(screen.getByRole('button', { name: /entrar no sistema/i }))
  return user
}

test('login chama o backend real, armazena apenas o token retornado e redireciona', async () => {
  let credenciais: { email: string; senha: string } | undefined
  servidor.use(http.post('/api/auth/login', async ({ request }) => {
    credenciais = await request.json() as { email: string; senha: string }
    return HttpResponse.json({
      token: 'token-real-do-backend',
      usuario: { id: 1, nome: 'Administrador', email: 'admin@fluxogestao.local', perfil: 'ADMINISTRADOR' },
    })
  }))

  render(<App />)
  await entrar('  ADMIN@FLUXOGESTAO.LOCAL  ', 'Admin@123')

  expect(await screen.findByRole('heading', { name: /visão financeira/i })).toBeInTheDocument()
  expect(credenciais).toEqual({ email: 'admin@fluxogestao.local', senha: 'Admin@123' })
  expect(sessionStorage.getItem(TOKEN_KEY)).toBe('token-real-do-backend')
  expect(sessionStorage.getItem(TOKEN_KEY)).not.toBe('demo:admin')
  expect(sessionStorage.getItem(TOKEN_KEY)).not.toMatch(/^demo:/)
})

test('requisição Porto usa Authorization Bearer com o token real', async () => {
  let authorization: string | null = null
  servidor.use(http.get('/api/porto/ordens-pagamento', ({ request }) => {
    authorization = request.headers.get('Authorization')
    return HttpResponse.json([])
  }))

  render(<App />)
  const user = await entrar()
  await user.click(await screen.findByRole('link', { name: /ordens de pagamento/i }))

  expect(await screen.findByRole('heading', { name: /ordens de pagamento/i })).toBeInTheDocument()
  expect(authorization).toBe('Bearer token-admin-teste')
})

test('credenciais inválidas exibem uma mensagem clara e não criam sessão', async () => {
  servidor.use(http.post('/api/auth/login', () => HttpResponse.json(
    { detalhe: 'E-mail ou senha inválidos.' },
    { status: 400 },
  )))

  render(<App />)
  await entrar('admin@fluxogestao.local', 'senha-incorreta')

  expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.')
  expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
})

test('atualização restaura a sessão e logout remove o token', async () => {
  let tokenRestaurado: string | null = null
  sessionStorage.setItem(TOKEN_KEY, 'token-sessao-existente')
  servidor.use(http.get('/api/auth/me', ({ request }) => {
    tokenRestaurado = request.headers.get('Authorization')
    return HttpResponse.json({
      id: 1, nome: 'Administrador', email: 'admin@fluxogestao.local', perfil: 'ADMINISTRADOR',
    })
  }))

  render(<App />)
  expect(await screen.findByRole('heading', { name: /visão financeira/i })).toBeInTheDocument()
  expect(tokenRestaurado).toBe('Bearer token-sessao-existente')

  await userEvent.click(screen.getByRole('button', { name: /^sair$/i }))
  expect(await screen.findByRole('heading', { name: /entre na sua conta/i })).toBeInTheDocument()
  expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
})

test('rota Porto sem token redireciona para o login', async () => {
  window.history.replaceState({}, '', '/porto/importacoes')
  render(<App />)

  expect(await screen.findByRole('heading', { name: /entre na sua conta/i })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/login')
})
