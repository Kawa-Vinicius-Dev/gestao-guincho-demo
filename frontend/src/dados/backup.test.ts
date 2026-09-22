import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

/**
 * O banco nao tem backup automatico: esta copia e a unica protecao do dono.
 * Ela ja falhou de duas formas — pedindo coluna que nao existe, e levando so as
 * primeiras 1000 linhas de cada tabela por causa do `max_rows` do PostgREST.
 * A segunda e a pior: o arquivo baixa e parece completo.
 */
const SUPA = 'https://projeto-teste.supabase.co'
const gerados: string[][][] = []

vi.mock('./relatorios', () => ({
  paraCsv: (linhas: string[][]) => { gerados.push(linhas); return 'csv' },
  baixarArquivoCsv: () => {},
}))

async function importar() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('./cliente')
  esquecerCliente()
  return import('./backup')
}

beforeEach(() => { sessionStorage.clear(); gerados.length = 0 })
afterEach(() => vi.unstubAllEnvs())

test('a cópia pagina até o fim e não para nas primeiras mil linhas', async () => {
  const TOTAL = 2500
  const pedidos: string[] = []
  servidor.use(http.get(`${SUPA}/rest/v1/:tabela`, ({ request, params }) => {
    if (params.tabela !== 'receitas') return HttpResponse.json([])
    // supabase-js manda a faixa pelo cabecalho Range; alguns caminhos usam
    // offset/limit na query. O teste aceita os dois e registra o que veio.
    const url = new URL(request.url)
    const cabecalho = request.headers.get('range')
    const de = cabecalho ? Number(cabecalho.split('-')[0]) : Number(url.searchParams.get('offset') ?? 0)
    const ate = cabecalho ? Number(cabecalho.split('-')[1])
      : de + Number(url.searchParams.get('limit') ?? 1000) - 1
    pedidos.push(`${de}-${ate}`)
    const linhas = []
    for (let i = de; i <= Math.min(ate, TOTAL - 1); i++) linhas.push({ id: i + 1, descricao: `R${i + 1}` })
    return HttpResponse.json(linhas)
  }))

  const { baixarCopiaDosDados } = await importar()
  await baixarCopiaDosDados()

  // Tres paginas: a ultima volta incompleta e encerra.
  expect(pedidos).toEqual(['0-999', '1000-1999', '2000-2999'])
  const texto = JSON.stringify(gerados)
  expect(texto).toContain('"R1"')
  expect(texto).toContain(`"R${TOTAL}"`)
})
