import { expect, test, vi, afterEach } from 'vitest'

/**
 * A chave de servico nunca pode chegar ao navegador. Se chegasse, tudo
 * funcionaria — ela ignora RLS —, e e justamente por funcionar que ninguem
 * notaria. O cliente recusa subir.
 */

afterEach(() => vi.unstubAllEnvs())

async function comChave(chave: string) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://projeto.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', chave)
  const { supabase, esquecerCliente } = await import('./cliente')
  esquecerCliente()
  return supabase
}

test('recusa a chave de servico no formato novo', async () => {
  const supabase = await comChave('sb_secret_abc123')
  expect(() => supabase()).toThrow(/chave de serviço não pode ser usada no navegador/i)
})

// JWT classico: o payload e base64, nao cifra — da para ler o papel sem a chave.
test('recusa a chave de servico em JWT classico', async () => {
  const payload = btoa(JSON.stringify({ iss: 'supabase', role: 'service_role' }))
  const supabase = await comChave(`eyJhbGciOiJIUzI1NiJ9.${payload}.assinatura`)
  expect(() => supabase()).toThrow(/chave de serviço não pode ser usada no navegador/i)
})

test('aceita a chave anon, que e publica por natureza', async () => {
  const payload = btoa(JSON.stringify({ iss: 'supabase', role: 'anon' }))
  const supabase = await comChave(`eyJhbGciOiJIUzI1NiJ9.${payload}.assinatura`)
  expect(() => supabase()).not.toThrow()
})

test('sem configuracao, avisa em vez de quebrar em runtime', async () => {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
  const { supabase, esquecerCliente } = await import('./cliente')
  esquecerCliente()
  expect(() => supabase()).toThrow(/não configurada/i)
})
