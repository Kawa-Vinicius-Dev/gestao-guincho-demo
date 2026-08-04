import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function carregarApiUrl(baseUrl:string) {
  vi.stubEnv('VITE_API_URL', baseUrl)
  return (await import('./url')).apiUrl
}

test('mantém a rota local quando VITE_API_URL está vazia',async()=>{
  const apiUrl=await carregarApiUrl('')
  expect(apiUrl('/api/auth/login')).toBe('/api/auth/login')
})

test('usa o backend configurado em VITE_API_URL',async()=>{
  const apiUrl=await carregarApiUrl('https://gestao-guincho-demo-production.up.railway.app')
  expect(apiUrl('/api/auth/login')).toBe('https://gestao-guincho-demo-production.up.railway.app/api/auth/login')
})

test('remove barras finais da URL base',async()=>{
  const apiUrl=await carregarApiUrl('https://gestao-guincho-demo-production.up.railway.app///')
  expect(apiUrl('/api/auth/login')).toBe('https://gestao-guincho-demo-production.up.railway.app/api/auth/login')
})

test('aceita caminho sem barra inicial',async()=>{
  const apiUrl=await carregarApiUrl('https://gestao-guincho-demo-production.up.railway.app')
  expect(apiUrl('api/auth/login')).toBe('https://gestao-guincho-demo-production.up.railway.app/api/auth/login')
})
