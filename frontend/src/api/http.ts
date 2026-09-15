import { apiUrl } from './url'

const TOKEN_KEY = 'fluxo-gestao:token:v1'

export const tokenStorage = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public campos?: Record<string,string>) { super(message) }
}

/**
 * Teto de espera por resposta.
 *
 * Sem ele, uma requisicao que nunca volta — servidor hibernando, rede caida,
 * deploy no meio — deixa a tela girando para sempre, sem dizer nada e com os
 * botoes travados. Era o que acontecia na importacao: o painel ficava em
 * "validando" indefinidamente e nao havia como saber que o problema era o
 * servidor. Melhor falhar com uma frase do que pendurar em silencio.
 *
 * Generoso de proposito: o backend no plano gratuito hiberna e a primeira
 * chamada depois disso paga o tempo de acordar a aplicacao inteira.
 */
const ESPERA_MAXIMA_MS = 60_000

/** Junta o abort de quem chamou com o do timeout: o que vier primeiro vence. */
function comTimeout(externo?: AbortSignal | null) {
  const porTempo = new AbortController()
  const relogio = setTimeout(() => porTempo.abort(new DOMException('timeout', 'TimeoutError')),
    ESPERA_MAXIMA_MS)
  const encerrar = () => clearTimeout(relogio)
  if (!externo) return { signal: porTempo.signal, encerrar }
  if (externo.aborted) porTempo.abort()
  else externo.addEventListener('abort', () => porTempo.abort(), { once: true })
  return { signal: porTempo.signal, encerrar }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStorage.get()
  const isForm = init.body instanceof FormData
  const metric = `api:${init.method ?? 'GET'} ${path}`
  const start = `${metric}:start:${crypto.randomUUID()}`
  const end = `${metric}:end:${crypto.randomUUID()}`
  performance.mark(start)
  const espera = comTimeout(init.signal)
  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      signal: espera.signal,
      headers: {
        ...(isForm ? {} : init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })
  } catch (erro) {
    // Quem chamou cancelou de proposito (trocou de tela, digitou de novo):
    // repassa como abort, para o chamador ignorar em silencio.
    if (init.signal?.aborted) throw erro
    throw new ApiError(
      'O servidor não respondeu a tempo. Verifique a conexão e tente de novo.', 504)
  } finally {
    espera.encerrar()
    performance.mark(end)
    performance.measure(metric, start, end)
  }
  if (response.status === 401 && path !== '/api/auth/login') {
    tokenStorage.clear()
    window.dispatchEvent(new Event('auth:expired'))
  }
  if (!response.ok) {
    const erro = await response.json().catch(() => null) as { detalhe?:string; campos?:Record<string,string> } | null
    throw new ApiError(erro?.detalhe ?? 'Não foi possível concluir a operação.', response.status, erro?.campos)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

