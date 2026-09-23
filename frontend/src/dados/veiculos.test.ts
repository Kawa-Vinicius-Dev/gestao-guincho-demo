import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

/**
 * O repositorio de veiculos nos dois modos.
 *
 * `modo.ts` le a variavel de ambiente uma vez, quando o modulo carrega — entao
 * cada caso precisa definir o ambiente ANTES de importar, e por isso os imports
 * aqui sao dinamicos com resetModules. Importar no topo fixaria o modo do
 * primeiro caso para todos os outros.
 */

const URL_SUPABASE = 'https://projeto-teste.supabase.co'

async function carregar(modulos: string) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', URL_SUPABASE)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', modulos)
  const { esquecerCliente } = await import('./cliente')
  esquecerCliente()
  return import('./veiculos')
}

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.unstubAllEnvs())

const LINHA = {
  id: 7, identificacao: 'L168', placa: 'ABC1D23', modelo: 'Iveco',
  custo_por_km: '2.5000', sigla_porto: 'L168', ativo: true,
}

/**
 * Responde como o PostgREST responde.
 *
 * Com `.single()` o supabase-js manda Accept: application/vnd.pgrst.object+json
 * e o servidor devolve um objeto; sem ele, um array. Um mock que devolvesse
 * sempre array passaria no teste e quebraria em producao — que foi exatamente o
 * que aconteceu na primeira versao deste arquivo.
 */
function responder(request: Request, linhas: Record<string, unknown>[]) {
  const objeto = request.headers.get('Accept')?.includes('pgrst.object')
  return HttpResponse.json(objeto ? linhas[0] ?? null : linhas)
}

// A migracao so vale se o dado chegar na tela com a mesma forma de antes: a tela
// faz conta com custoPorKm e nao saberia o que fazer com custo_por_km em texto.
test('no Supabase, a linha do banco chega no formato que a tela ja usa', async () => {
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/veiculos`, () => HttpResponse.json([LINHA])))
  const { listarVeiculos } = await carregar('auth,veiculos')

  const [veiculo] = await listarVeiculos()

  expect(veiculo).toEqual({
    id: 7, identificacao: 'L168', placa: 'ABC1D23', modelo: 'Iveco',
    custoPorKm: 2.5, siglaPorto: 'L168', ativo: true,
  })
})

test('pede so as colunas que a tela usa, nao a linha inteira', async () => {
  let colunas: string | null = null
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/veiculos`, ({ request }) => {
    colunas = new URL(request.url).searchParams.get('select')
    return HttpResponse.json([])
  }))
  const { listarVeiculos } = await carregar('auth,veiculos')

  await listarVeiculos()

  expect(colunas).toBe('id,identificacao,placa,modelo,custo_por_km,sigla_porto,ativo')
  expect(colunas).not.toContain('*')
  expect(colunas).not.toContain('criado_em')
})

test('lista vazia nao vira erro — e o estado vazio da tela', async () => {
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/veiculos`, () => HttpResponse.json([])))
  const { listarVeiculos } = await carregar('auth,veiculos')

  await expect(listarVeiculos()).resolves.toEqual([])
})

test('cadastrar envia o corpo em snake_case e devolve o veiculo salvo', async () => {
  let corpo: unknown = null
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/veiculos`, async ({ request }) => {
    corpo = await request.json()
    return responder(request, [LINHA])
  }))
  const { criarVeiculo } = await carregar('auth,veiculos')

  const salvo = await criarVeiculo({
    identificacao: 'L168', placa: 'ABC1D23', modelo: 'Iveco',
    custoPorKm: 2.5, siglaPorto: 'L168',
  })

  expect(corpo).toEqual({
    identificacao: 'L168', placa: 'ABC1D23', modelo: 'Iveco',
    custo_por_km: 2.5, sigla_porto: 'L168',
  })
  expect(salvo.id).toBe(7)
})

// Campo opcional em branco precisa virar null, e nao "": a coluna tem indice
// unico, e duas viaturas com sigla vazia colidiriam entre si.
test('sigla e modelo em branco viram null', async () => {
  let corpo: Record<string, unknown> = {}
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/veiculos`, async ({ request }) => {
    corpo = await request.json() as Record<string, unknown>
    return responder(request, [LINHA])
  }))
  const { criarVeiculo } = await carregar('auth,veiculos')

  await criarVeiculo({ identificacao: 'L1', placa: 'AAA0A00', modelo: '', custoPorKm: 0, siglaPorto: '' })

  expect(corpo.sigla_porto).toBeNull()
  expect(corpo.modelo).toBeNull()
})

test('editar manda PATCH filtrando pelo id', async () => {
  let filtro: string | null = null
  servidor.use(http.patch(`${URL_SUPABASE}/rest/v1/veiculos`, ({ request }) => {
    filtro = new URL(request.url).searchParams.get('id')
    return responder(request, [LINHA])
  }))
  const { atualizarVeiculo } = await carregar('auth,veiculos')

  const salvo = await atualizarVeiculo(7, { identificacao: 'L168', placa: 'ABC1D23', custoPorKm: 3 })

  expect(filtro).toBe('eq.7')
  expect(salvo.identificacao).toBe('L168')
})

// A tela mostra `erro.message` cru. Sem traducao, quem cadastra um guincho leria
// "duplicate key value violates unique constraint veiculos_placa_unica".
test('placa repetida vira frase que a pessoa entende', async () => {
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/veiculos`, () => HttpResponse.json({
    code: '23505',
    message: 'duplicate key value violates unique constraint "veiculos_placa_unica"',
  }, { status: 409 })))
  const { criarVeiculo } = await carregar('auth,veiculos')

  await expect(criarVeiculo({ identificacao: 'L1', placa: 'ABC1D23', custoPorKm: 1 }))
    .rejects.toThrow('Já existe um veículo com esta placa.')
})

test('recusa da policy vira aviso de permissao, nao erro tecnico', async () => {
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/veiculos`, () => HttpResponse.json({
    code: '42501', message: 'new row violates row-level security policy for table "veiculos"',
  }, { status: 403 })))
  const { criarVeiculo } = await carregar('auth,veiculos')

  await expect(criarVeiculo({ identificacao: 'L1', placa: 'AAA0A00', custoPorKm: 1 }))
    .rejects.toThrow('Você não tem permissão para esta operação.')
})

test('falha de carregamento chega na tela com mensagem', async () => {
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/veiculos`, () => HttpResponse.json(
    { code: '57014', message: 'canceling statement due to statement timeout' }, { status: 500 })))
  const { listarVeiculos } = await carregar('auth,veiculos')

  await expect(listarVeiculos()).rejects.toThrow()
})
