import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

const URL_SUPABASE = 'https://projeto-teste.supabase.co'
const ID = '33333333-3333-3333-3333-333333333333'

async function carregar(modulos: string) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', URL_SUPABASE)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', modulos)
  const { esquecerCliente } = await import('./cliente')
  esquecerCliente()
  return import('./sessao')
}

function sessaoGravada(id = ID) {
  sessionStorage.setItem('fluxo-gestao:sessao:v1', JSON.stringify({
    access_token: 'jwt', refresh_token: 'r', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
    user: { id, email: 'ana@teste.local', aud: 'authenticated' },
  }))
}

const PERFIL = {
  id: ID, nome: 'Ana', email: 'ana@teste.local',
  perfil: 'FUNCIONARIO', ativo: true, senha_provisoria: false,
}

beforeEach(() => { sessionStorage.clear(); localStorage.clear() })
afterEach(() => vi.unstubAllEnvs())

test('entrar guarda a sessao e devolve o perfil', async () => {
  servidor.use(
    http.post(`${URL_SUPABASE}/auth/v1/token`, () => HttpResponse.json({
      access_token: 'jwt', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      user: { id: ID, email: 'ana@teste.local', aud: 'authenticated' },
    })),
    http.get(`${URL_SUPABASE}/rest/v1/perfis`, () => HttpResponse.json(PERFIL)),
  )
  const { entrar } = await carregar('auth')

  const usuario = await entrar('  ANA@Teste.Local ', 'senha')

  expect(usuario.perfil).toBe('FUNCIONARIO')
  expect(usuario.nome).toBe('Ana')
})

// Dizer "esta senha existe mas errou" entregaria a lista de quem tem conta.
test('credencial errada nao revela se o e-mail existe', async () => {
  servidor.use(http.post(`${URL_SUPABASE}/auth/v1/token`, () =>
    HttpResponse.json({ error: 'invalid_grant', error_description: 'Invalid login credentials' }, { status: 400 })))
  const { entrar } = await carregar('auth')

  await expect(entrar('ana@teste.local', 'errada')).rejects.toThrow('E-mail ou senha incorretos.')
})

// Conta desativada nao pode ficar "logada" numa tela vazia: sem perfil ativo
// nenhuma policy libera nada.
test('perfil inativo encerra a sessao em vez de entrar', async () => {
  servidor.use(
    http.post(`${URL_SUPABASE}/auth/v1/token`, () => HttpResponse.json({
      access_token: 'jwt', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      user: { id: ID, email: 'ana@teste.local', aud: 'authenticated' },
    })),
    http.get(`${URL_SUPABASE}/rest/v1/perfis`, () => HttpResponse.json({ ...PERFIL, ativo: false })),
    http.post(`${URL_SUPABASE}/auth/v1/logout`, () => new HttpResponse(null, { status: 204 })),
  )
  const { entrar } = await carregar('auth')

  await expect(entrar('ana@teste.local', 'senha'))
    .rejects.toThrow('Seu acesso está inativo. Procure o administrador.')
})

// O perfil vem de uma consulta filtrada pelas policies, nunca de algo que o
// browser possa escrever.
test('o perfil sai do banco, nao da sessao guardada', async () => {
  sessaoGravada()
  let consultou = false
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/perfis`, () => {
    consultou = true
    return HttpResponse.json({ ...PERFIL, perfil: 'ADMINISTRADOR' })
  }))
  const { usuarioAtual } = await carregar('auth')

  const usuario = await usuarioAtual()

  expect(consultou).toBe(true)
  expect(usuario?.perfil).toBe('ADMINISTRADOR')
})

test('sem sessao, nao ha usuario e nem consulta', async () => {
  let consultou = false
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/perfis`, () => {
    consultou = true
    return HttpResponse.json(PERFIL)
  }))
  const { usuarioAtual } = await carregar('auth')

  expect(await usuarioAtual()).toBeNull()
  expect(consultou).toBe(false)
})

// O Supabase nao pede a senha atual no updateUser. Sem conferir, quem
// encontrasse uma aba aberta tomaria a conta sem saber a senha antiga.
test('trocar senha confere a senha atual antes', async () => {
  sessaoGravada()
  servidor.use(http.post(`${URL_SUPABASE}/auth/v1/token`, () =>
    HttpResponse.json({ error: 'invalid_grant' }, { status: 400 })))
  const { trocarSenha } = await carregar('auth')

  await expect(trocarSenha('chute', 'NovaSenha@1')).rejects.toThrow('A senha atual não confere.')
})

test('trocar senha grava e baixa a marca de provisoria, nesta ordem', async () => {
  sessaoGravada()
  const passos: string[] = []
  servidor.use(
    http.post(`${URL_SUPABASE}/auth/v1/token`, () => {
      passos.push('conferiu')
      return HttpResponse.json({
        access_token: 'jwt', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
        user: { id: ID, email: 'ana@teste.local', aud: 'authenticated' },
      })
    }),
    http.put(`${URL_SUPABASE}/auth/v1/user`, () => {
      passos.push('gravou')
      return HttpResponse.json({ id: ID, email: 'ana@teste.local' })
    }),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/concluir_troca_de_senha`, () => {
      passos.push('concluiu')
      return HttpResponse.json(PERFIL)
    }),
  )
  const { trocarSenha } = await carregar('auth')

  await trocarSenha('SenhaAtual@1', 'NovaSenha@1')

  expect(passos).toEqual(['conferiu', 'gravou', 'concluiu'])
})

test('sair encerra a sessao e apaga os numeros da operacao em cache', async () => {
  sessaoGravada()
  let saiu = false
  servidor.use(
    http.post(`${URL_SUPABASE}/rest/v1/rpc/dashboard_resumo`, () => HttpResponse.json({
      financeiro: { saldoRealizado: 10 }, porto: null,
    })),
    http.post(`${URL_SUPABASE}/auth/v1/logout`, () => {
      saiu = true
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { sair } = await carregar('auth,dashboard')
  const { dashboardEmCache, lerDashboard } = await import('./dashboard')

  await lerDashboard('2026-09-01','2026-09-30')
  expect(dashboardEmCache('2026-09-01','2026-09-30')).toBeDefined()

  await sair()

  expect(saiu).toBe(true)
  expect(dashboardEmCache('2026-09-01','2026-09-30')).toBeUndefined()
})

test('sem o modo auth, tudo continua no backend antigo', async () => {
  servidor.use(http.post('/api/auth/login', () => HttpResponse.json({
    token: 'token-admin-teste',
    usuario: { id: 1, nome: 'Administrador', email: 'a@b.c', perfil: 'ADMINISTRADOR' },
  })))
  const { entrar } = await carregar('')

  const usuario = await entrar('a@b.c', 'x')

  expect(usuario.perfil).toBe('ADMINISTRADOR')
  expect(sessionStorage.getItem('fluxo-gestao:token:v1')).toBe('token-admin-teste')
})
