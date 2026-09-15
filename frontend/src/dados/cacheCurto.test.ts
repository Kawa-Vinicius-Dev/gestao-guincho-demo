import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

const U = 'https://projeto-teste.supabase.co'

async function carregar() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', U)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'k')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('./cliente')
  esquecerCliente()
  const { limparCacheCurto } = await import('./cacheCurto')
  limparCacheCurto()
  return {
    ...(await import('./veiculos')),
    ...(await import('./cadastros')),
    ...(await import('./cacheCurto')),
  }
}

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.unstubAllEnvs())

// Medido antes do cache: navegar entre telas refazia a mesma lista de veiculos
// sete vezes. Sao dezenas de linhas que quase nao mudam — o custo e a ida e
// volta, nao o tamanho.
test('a mesma lista nao e buscada duas vezes na janela do cache', async () => {
  let idas = 0
  servidor.use(http.get(`${U}/rest/v1/veiculos`, () => {
    idas++
    return HttpResponse.json([{ id: 1, identificacao: 'L168', placa: 'A', modelo: null, custo_por_km: '2', sigla_porto: null, ativo: true }])
  }))
  const { listarVeiculos } = await carregar()

  await listarVeiculos()
  await listarVeiculos()
  await listarVeiculos()

  expect(idas).toBe(1)
})

// Duas telas montando ao mesmo tempo pedem o mesmo seletor; sem coalescer, as
// duas saem antes de qualquer resposta chegar e o cache nao ajuda.
test('chamadas simultaneas viram uma so ida', async () => {
  let idas = 0
  servidor.use(http.get(`${U}/rest/v1/veiculos`, async () => {
    idas++
    await new Promise(r => setTimeout(r, 30))
    return HttpResponse.json([])
  }))
  const { listarVeiculos } = await carregar()

  await Promise.all([listarVeiculos(), listarVeiculos(), listarVeiculos()])

  expect(idas).toBe(1)
})

// Cadastro que nao aparece logo depois de salvo parece cadastro perdido.
test('criar um veiculo derruba o cache na hora', async () => {
  let idas = 0
  servidor.use(
    http.get(`${U}/rest/v1/veiculos`, () => { idas++; return HttpResponse.json([]) }),
    http.post(`${U}/rest/v1/veiculos`, ({ request }) => {
      const linha = { id: 9, identificacao: 'L200', placa: 'B', modelo: null, custo_por_km: '3', sigla_porto: null, ativo: true }
      return HttpResponse.json(request.headers.get('Accept')?.includes('pgrst.object') ? linha : [linha])
    }),
  )
  const { listarVeiculos, criarVeiculo } = await carregar()

  await listarVeiculos()
  await criarVeiculo({ identificacao: 'L200', placa: 'B', custoPorKm: 3 })
  await listarVeiculos()

  expect(idas).toBe(2)
})

// Categoria de despesa e de receita sao consultas diferentes: nao podem
// compartilhar a mesma entrada de cache.
test('cada tipo de categoria tem a propria entrada', async () => {
  const tipos: string[] = []
  servidor.use(http.get(`${U}/rest/v1/categorias`, ({ request }) => {
    tipos.push(new URL(request.url).searchParams.get('tipo') ?? 'sem-filtro')
    return HttpResponse.json([])
  }))
  const { listarCategorias } = await carregar()

  await listarCategorias('DESPESA')
  await listarCategorias('RECEITA')
  await listarCategorias('DESPESA')

  expect(tipos).toEqual(['eq.DESPESA', 'eq.RECEITA'])
})

// Cadastro nao e segredo, mas um cache que sobrevive a sessao envelhece sem
// ninguem perceber: o socorrista desativado continuaria no seletor amanha.
test('nada do cache encosta no localStorage', async () => {
  servidor.use(http.get(`${U}/rest/v1/veiculos`, () => HttpResponse.json([])))
  const { listarVeiculos } = await carregar()

  await listarVeiculos()

  expect(localStorage.length).toBe(0)
})

test('resposta iniciada antes da limpeza não repovoa o cache', async () => {
  const { comCacheCurto, limparCacheCurto } = await carregar()
  let liberar!: (valor: string) => void
  const antiga = comCacheCurto('categorias:DESPESA', () =>
    new Promise<string>(resolve => { liberar = resolve }))

  limparCacheCurto()
  liberar('sessão anterior')
  await antiga

  let novasBuscas = 0
  await comCacheCurto('categorias:DESPESA', async () => { novasBuscas++; return 'sessão nova' })
  expect(novasBuscas).toBe(1)
})
