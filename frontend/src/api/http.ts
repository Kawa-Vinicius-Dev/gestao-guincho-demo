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

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStorage.get()
  const isForm = init.body instanceof FormData
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      ...(isForm ? {} : init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
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

export function downloadCsv(tipo:string,inicio:string,fim:string) {
  const token=tokenStorage.get()
  return fetch(apiUrl(`/api/relatorios/${tipo}.csv?inicio=${inicio}&fim=${fim}`), { headers: token ? {Authorization:`Bearer ${token}`} : {} })
    .then(async response => {
      if(!response.ok) throw new ApiError('Não foi possível exportar o relatório.',response.status)
      const blob=await response.blob()
      const url=URL.createObjectURL(blob)
      const a=document.createElement('a');a.href=url;a.download=`${tipo}.csv`;a.click();URL.revokeObjectURL(url)
    })
}
