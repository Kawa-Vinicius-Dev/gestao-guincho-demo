import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ApiError, api } from './http'

/**
 * Sem teto de espera, uma requisicao que nunca volta deixava a tela girando para
 * sempre com os botoes travados — foi o que travou a importacao de uma OP: o
 * painel ficava em "validando" e nao havia como saber que o problema era o
 * servidor, nao o arquivo.
 */
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

test('requisicao que nao volta falha com mensagem, em vez de pendurar', async () => {
  // Um fetch que nunca resolve, mas respeita o abort — como o do navegador.
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_ok, falha) => {
    init.signal?.addEventListener('abort',
      () => falha(new DOMException('aborted', 'AbortError')), { once: true })
  }))

  const chamada = api('/api/dashboard')
  const esperado = expect(chamada).rejects.toBeInstanceOf(ApiError)
  await vi.advanceTimersByTimeAsync(60_000)
  await esperado
  await expect(chamada).rejects.toMatchObject({ status: 504 })
})

test('cancelamento de quem chamou continua sendo abort, nao erro de servidor', async () => {
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_ok, falha) => {
    init.signal?.addEventListener('abort',
      () => falha(new DOMException('aborted', 'AbortError')), { once: true })
  }))

  const controle = new AbortController()
  const chamada = api('/api/dashboard', { signal: controle.signal })
  const esperado = expect(chamada).rejects.toMatchObject({ name: 'AbortError' })
  controle.abort()
  await esperado
})

test('resposta dentro do prazo passa direto', async () => {
  vi.stubGlobal('fetch', async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200 }))

  await expect(api<{ ok: boolean }>('/api/dashboard')).resolves.toEqual({ ok: true })
})
