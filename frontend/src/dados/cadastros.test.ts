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
  return import('./cadastros')
}

function responder(request: Request, linhas: Record<string, unknown>[]) {
  const objeto = request.headers.get('Accept')?.includes('pgrst.object')
  return HttpResponse.json(objeto ? linhas[0] ?? null : linhas)
}

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.unstubAllEnvs())

// O filtro por tipo tem de ir para o banco. Trazer receita e despesa para
// descartar metade no browser e egress pago a cada abertura de formulario.
test('o filtro por tipo vai na consulta, nao no browser', async () => {
  let tipo: string | null = null
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/categorias`, ({ request }) => {
    tipo = new URL(request.url).searchParams.get('tipo')
    return HttpResponse.json([{ id: 1, nome: 'Combustível', tipo: 'DESPESA', ativo: true }])
  }))
  const { listarCategorias } = await carregar('auth,categorias')

  await listarCategorias('DESPESA')

  expect(tipo).toBe('eq.DESPESA')
})

test('sem tipo, nao manda filtro nenhum', async () => {
  let tipo: string | null = 'nao-chamado'
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/categorias`, ({ request }) => {
    tipo = new URL(request.url).searchParams.get('tipo')
    return HttpResponse.json([])
  }))
  const { listarCategorias } = await carregar('auth,categorias')

  await listarCategorias()

  expect(tipo).toBeNull()
})

test('pede colunas nomeadas, nao a linha inteira', async () => {
  let colunas: string | null = null
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/categorias`, ({ request }) => {
    colunas = new URL(request.url).searchParams.get('select')
    return HttpResponse.json([])
  }))
  const { listarCategorias } = await carregar('auth,categorias')

  await listarCategorias()

  expect(colunas).toBe('id,nome,tipo,ativo,socorrista_pode')
})

test('cadastrar categoria devolve a linha salva', async () => {
  let corpo: unknown = null
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/categorias`, async ({ request }) => {
    corpo = await request.json()
    return responder(request, [{ id: 9, nome: 'Pedágio', tipo: 'DESPESA', ativo: true, socorrista_pode: true }])
  }))
  const { criarCategoria } = await carregar('auth,categorias')

  const salva = await criarCategoria('Pedágio', 'DESPESA')

  expect(corpo).toEqual({ nome: 'Pedágio', tipo: 'DESPESA' })
  expect(salva).toEqual({ id: 9, nome: 'Pedágio', tipo: 'DESPESA', ativo: true, socorristaPode: true })
})

test('categoria repetida vira frase que a pessoa entende', async () => {
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/categorias`, () => HttpResponse.json({
    code: '23505', message: 'duplicate key value violates unique constraint "categorias_nome_por_tipo_unico"',
  }, { status: 409 })))
  const { criarCategoria } = await carregar('auth,categorias')

  await expect(criarCategoria('Pedágio', 'DESPESA'))
    .rejects.toThrow('Já existe uma categoria com este nome.')
})

test('contratante: documento em branco vira null', async () => {
  let corpo: Record<string, unknown> = {}
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/contratantes`, async ({ request }) => {
    corpo = await request.json() as Record<string, unknown>
    return responder(request, [{ id: 2, nome: 'Porto Seguro', documento: null, ativo: true }])
  }))
  const { criarContratante } = await carregar('auth,contratantes')

  const salvo = await criarContratante('Porto Seguro', '')

  expect(corpo.documento).toBeNull()
  expect(salvo.documento).toBeUndefined()
})

test('lista vazia e estado vazio, nao erro', async () => {
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/contratantes`, () => HttpResponse.json([])))
  const { listarContratantes } = await carregar('auth,contratantes')

  await expect(listarContratantes()).resolves.toEqual([])
})
