import { expect, test, vi } from 'vitest'

/**
 * A variavel e escrita a mao por quem configura o deploy. Estes testes existem
 * porque um nome que nao casa falha em silencio: o modulo volta para o backend
 * antigo sem avisar ninguem.
 */
async function carregar(modulos: string, comCredenciais = true) {
  vi.stubEnv('VITE_SUPABASE_URL', comCredenciais ? 'https://x.supabase.co' : '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', comCredenciais ? 'sb_publishable_abc' : '')
  vi.stubEnv('VITE_SUPABASE_MODULOS', modulos)
  vi.resetModules()
  return import('./modo')
}

test('modulo de nome composto liga quando nomeado, nao so por "tudo"', async () => {
  const { moduloNoSupabase } = await carregar('auth,despesasFixas')
  expect(moduloNoSupabase('despesasFixas')).toBe(true)
})

test('a caixa do que foi digitado nao importa', async () => {
  const { moduloNoSupabase } = await carregar('AUTH, DespesasFixas , PORTO')
  expect(moduloNoSupabase('despesasFixas')).toBe(true)
  expect(moduloNoSupabase('porto')).toBe(true)
})

test('"tudo" liga todos os modulos', async () => {
  const { moduloNoSupabase, modulosLigados } = await carregar('tudo')
  expect(moduloNoSupabase('despesasFixas')).toBe(true)
  expect(moduloNoSupabase('usuarios')).toBe(true)
  expect(modulosLigados()).toHaveLength(14)
})

test('modulo nao listado continua no backend antigo', async () => {
  const { moduloNoSupabase } = await carregar('auth,veiculos')
  expect(moduloNoSupabase('veiculos')).toBe(true)
  expect(moduloNoSupabase('porto')).toBe(false)
})

test('sem "auth" nenhum modulo liga: a sessao nao seria a do Supabase', async () => {
  const { moduloNoSupabase, modulosLigados } = await carregar('veiculos,porto')
  expect(moduloNoSupabase('veiculos')).toBe(false)
  expect(modulosLigados()).toEqual([])
})

test('sem URL e chave, nada liga mesmo com a lista preenchida', async () => {
  const { moduloNoSupabase } = await carregar('tudo', false)
  expect(moduloNoSupabase('veiculos')).toBe(false)
})
