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

const socorrista = { id: 9, nome: 'Anderson Ribeiro', email: 'anderson@jms.local', perfil: 'FUNCIONARIO', ativo: true }

test('o dono redefine a senha e vê a provisória uma vez', async () => {
  let pedidos = 0
  servidor.use(
    http.get('/api/usuarios', () => HttpResponse.json([socorrista])),
    http.patch('/api/usuarios/9/redefinir-senha', () => {
      pedidos++
      return HttpResponse.json({ usuarioId: 9, nome: 'Anderson Ribeiro', email: 'anderson@jms.local', senhaProvisoria: 'kjhs-2mp4-7xqt' })
    }),
  )
  const user = userEvent.setup()
  abrir('/configuracoes')

  await user.click(await screen.findByRole('button', { name: /redefinir senha/i }))

  expect(await screen.findByText('kjhs-2mp4-7xqt')).toBeInTheDocument()
  expect(screen.getByText(/uma única vez/i)).toBeInTheDocument()
  expect(pedidos).toBe(1)
})

test('quem está com senha provisória cai na troca e não navega para outra tela', async () => {
  servidor.use(http.get('/api/auth/me', () => HttpResponse.json({
    id: 9, nome: 'Anderson Ribeiro', email: 'anderson@jms.local', perfil: 'FUNCIONARIO', senhaProvisoria: true,
  })))

  abrir('/despesas')

  expect(await screen.findByRole('heading', { name: /troque sua senha/i })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /^despesas$/i })).not.toBeInTheDocument()
})

test('depois de trocar, o acesso antigo é encerrado e a tela manda entrar de novo', async () => {
  let enviado: Record<string, unknown> | null = null
  servidor.use(
    http.get('/api/auth/me', () => HttpResponse.json({
      id: 9, nome: 'Anderson Ribeiro', email: 'anderson@jms.local', perfil: 'FUNCIONARIO', senhaProvisoria: true,
    })),
    http.put('/api/auth/senha', async ({ request }) => {
      enviado = await request.json() as Record<string, unknown>
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const user = userEvent.setup()
  abrir('/minha-comissao')

  await screen.findByRole('heading', { name: /troque sua senha/i })
  await user.type(screen.getByLabelText(/senha atual/i), 'kjhs-2mp4-7xqt')
  await user.type(screen.getByLabelText(/nova senha/i), 'MinhaSenha@2026')
  await user.click(screen.getByRole('button', { name: /salvar nova senha/i }))

  expect(await screen.findByText(/acessos abertos foram encerrados/i)).toBeInTheDocument()
  expect(enviado).toEqual({ senhaAtual: 'kjhs-2mp4-7xqt', novaSenha: 'MinhaSenha@2026' })
})
