import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import App from '../App'
import { servidor } from '../test/servidor'

const TOKEN_KEY = 'fluxo-gestao:token:v1'

function abrir() {
  sessionStorage.setItem(TOKEN_KEY, 'token-admin-teste')
  window.history.replaceState({}, '', '/despesas')
  return render(<App />)
}

const semComprovante = {
  id: 7, descricao: 'Troca de óleo', categoria: 'Manutenção', valor: 180, data: '2026-08-02',
  status: 'PENDENTE', aprovada: true, criadoPor: 'Administrador',
}
const comComprovante = {
  ...semComprovante, comprovanteNomeOriginal: 'nota-fiscal.pdf', comprovanteTamanhoBytes: 40960,
}

test('anexa um comprovante e passa a mostrar o link para ver e remover', async () => {
  let despesas: Record<string, unknown>[] = [semComprovante]
  servidor.use(
    http.get('/api/despesas', () => HttpResponse.json(despesas)),
    http.post('/api/despesas/:id/comprovante', () => {
      despesas = [comComprovante]
      return HttpResponse.json(comComprovante)
    }),
  )
  const user = userEvent.setup()
  abrir()

  await screen.findByText('Troca de óleo')
  const arquivo = new File(['conteudo'], 'nota-fiscal.pdf', { type: 'application/pdf' })
  await user.upload(screen.getByLabelText(/anexar/i), arquivo)

  expect(await screen.findByRole('button', { name: /^ver$/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /remover/i })).toBeInTheDocument()
})

test('abre o link assinado do comprovante numa nova aba', async () => {
  servidor.use(
    http.get('/api/despesas', () => HttpResponse.json([comComprovante])),
    http.get('/api/despesas/:id/comprovante', () => HttpResponse.json({ url: 'https://storage.exemplo/comprovante-assinado' })),
  )
  const abrirJanela = vi.fn()
  vi.stubGlobal('open', abrirJanela)
  const user = userEvent.setup()
  abrir()

  await user.click(await screen.findByRole('button', { name: /^ver$/i }))

  expect(abrirJanela).toHaveBeenCalledWith('https://storage.exemplo/comprovante-assinado', '_blank', 'noopener')
  vi.unstubAllGlobals()
})

test('remove o comprovante anexado', async () => {
  let despesas: Record<string, unknown>[] = [comComprovante]
  let removeu = false
  servidor.use(
    http.get('/api/despesas', () => HttpResponse.json(despesas)),
    http.delete('/api/despesas/:id/comprovante', () => {
      removeu = true
      despesas = [semComprovante]
      return HttpResponse.json(semComprovante)
    }),
  )
  const user = userEvent.setup()
  abrir()

  await user.click(await screen.findByRole('button', { name: /remover/i }))

  expect(removeu).toBe(true)
  expect(await screen.findByLabelText(/anexar/i)).toBeInTheDocument()
})
