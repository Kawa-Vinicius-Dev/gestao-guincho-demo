import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

// A marca so existia no formulario de despesa nova: o almoco do Jeferson, lancado
// antes, nao tinha como descontar. Agora marca direto na lista.
test('despesa já lançada pode passar a descontar da comissão', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://projeto-teste.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  vi.resetModules()
  const { esquecerCliente } = await import('../dados/cliente')
  esquecerCliente()
  let enviado: Record<string, unknown> = {}
  servidor.use(http.patch('https://projeto-teste.supabase.co/rest/v1/despesas', async ({ request }) => {
    enviado = await request.json() as Record<string, unknown>
    return HttpResponse.json([{ id: 6 }])
  }))
  const { marcarDescontoComissao } = await import('../dados/despesas')

  await marcarDescontoComissao(6, true)

  expect(enviado).toEqual({ desconta_comissao: true })
  vi.unstubAllEnvs()
})
