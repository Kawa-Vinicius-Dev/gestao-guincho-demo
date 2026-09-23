import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

const URL_SUPABASE = 'https://projeto-teste.supabase.co'

async function carregar(modulos: string) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', URL_SUPABASE)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', modulos)
  const { esquecerCliente } = await import('./cliente')
  esquecerCliente()
  return import('./motoristas')
}

function responder(request: Request, linhas: Record<string, unknown>[]) {
  const objeto = request.headers.get('Accept')?.includes('pgrst.object')
  return HttpResponse.json(objeto ? linhas[0] ?? null : linhas)
}

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.unstubAllEnvs())

const LINHA = {
  id: 3, nome: 'Anderson Ribeiro', telefone: '11999990000', documento: null,
  qra: 'QRA7', ativo: true, veiculo_id: 5,
  perfil_id: '33333333-3333-3333-3333-333333333333',
  veiculos: { identificacao: 'L168' },
}

test('a viatura vem no mesmo select, sem uma consulta por socorrista', async () => {
  let colunas: string | null = null
  let idas = 0
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/motoristas`, ({ request }) => {
    idas++
    colunas = new URL(request.url).searchParams.get('select')
    return HttpResponse.json([LINHA, { ...LINHA, id: 4, veiculos: { identificacao: 'L200' } }])
  }))
  const { listarMotoristas } = await carregar('auth,motoristas')

  const lista = await listarMotoristas()

  expect(idas).toBe(1)
  expect(colunas).toContain('veiculos(identificacao)')
  expect(lista.map(m => m.veiculo)).toEqual(['L168', 'L200'])
})

test('a linha chega no formato que a tela ja usa', async () => {
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/motoristas`, () => HttpResponse.json([LINHA])))
  const { listarMotoristas } = await carregar('auth,motoristas')

  expect((await listarMotoristas())[0]).toEqual({
    id: 3, nome: 'Anderson Ribeiro', telefone: '11999990000', documento: undefined,
    qra: 'QRA7', codigosPorto: [], ativo: true, veiculoId: 5, veiculo: 'L168',
    usuarioId: '33333333-3333-3333-3333-333333333333',
  })
})

// A tela mostra "Vinculado"/"Nao vinculado" e libera o botao "Criar acesso" so
// para quem nao tem login. O uuid precisa ser lido como vinculo existente.
test('socorrista com perfil aparece como vinculado; sem perfil, nao', async () => {
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/motoristas`, () => HttpResponse.json([
    LINHA, { ...LINHA, id: 9, perfil_id: null, veiculos: null },
  ])))
  const { listarMotoristas } = await carregar('auth,motoristas')

  const [comLogin, semLogin] = await listarMotoristas()
  expect(Boolean(comLogin.usuarioId)).toBe(true)
  expect(Boolean(semLogin.usuarioId)).toBe(false)
  expect(semLogin.veiculo).toBeUndefined()
})

test('cadastrar envia snake_case e nao manda o vinculo de usuario', async () => {
  let corpo: Record<string, unknown> = {}
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/motoristas`, async ({ request }) => {
    corpo = await request.json() as Record<string, unknown>
    return responder(request, [LINHA])
  }))
  const { criarMotorista } = await carregar('auth,motoristas')

  await criarMotorista({ nome: 'Novo', telefone: '', qra: 'QRA9', veiculoId: 5 })

  expect(corpo).toEqual({
    nome: 'Novo', telefone: null, documento: null, qra: 'QRA9', veiculo_id: 5,
  })
  // Quem tem login e assunto do Auth; a tela de cadastro nao mexe nisso.
  expect(corpo).not.toHaveProperty('perfil_id')
})

test('desativar nao apaga: so vira ativo=false', async () => {
  let corpo: Record<string, unknown> = {}
  let filtro: string | null = null
  servidor.use(http.patch(`${URL_SUPABASE}/rest/v1/motoristas`, async ({ request }) => {
    corpo = await request.json() as Record<string, unknown>
    filtro = new URL(request.url).searchParams.get('id')
    return responder(request, [{ ...LINHA, ativo: false }])
  }))
  const { alternarAtivoMotorista } = await carregar('auth,motoristas')

  const atualizado = await alternarAtivoMotorista({ id: 3, nome: 'Anderson', ativo: true })

  expect(corpo).toEqual({ ativo: false })
  expect(filtro).toBe('eq.3')
  expect(atualizado.ativo).toBe(false)
})

test('reativar volta ativo=true', async () => {
  let corpo: Record<string, unknown> = {}
  servidor.use(http.patch(`${URL_SUPABASE}/rest/v1/motoristas`, async ({ request }) => {
    corpo = await request.json() as Record<string, unknown>
    return responder(request, [LINHA])
  }))
  const { alternarAtivoMotorista } = await carregar('auth,motoristas')

  await alternarAtivoMotorista({ id: 3, nome: 'Anderson', ativo: false })

  expect(corpo).toEqual({ ativo: true })
})

test('QRA repetido vira frase que a pessoa entende', async () => {
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/motoristas`, () => HttpResponse.json({
    code: '23505', message: 'duplicate key value violates unique constraint "motoristas_qra_unico"',
  }, { status: 409 })))
  const { criarMotorista } = await carregar('auth,motoristas')

  await expect(criarMotorista({ nome: 'X', qra: 'QRA7' }))
    .rejects.toThrow('Já existe um socorrista com este QRA.')
})

test('lista vazia e estado vazio, nao erro', async () => {
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/motoristas`, () => HttpResponse.json([])))
  const { listarMotoristas } = await carregar('auth,motoristas')

  await expect(listarMotoristas()).resolves.toEqual([])
})
