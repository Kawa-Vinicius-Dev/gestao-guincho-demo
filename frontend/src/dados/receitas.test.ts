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
  return import('./receitas')
}

function responder(request: Request, linhas: Record<string, unknown>[]) {
  const objeto = request.headers.get('Accept')?.includes('pgrst.object')
  return HttpResponse.json(objeto ? linhas[0] ?? null : linhas)
}

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.unstubAllEnvs())

const MANUAL = {
  id: 4, descricao: 'Serviço avulso', valor: '500.00', data_competencia: '2026-09-10',
  data_recebimento: '2026-09-10', status: 'RECEBIDA', recorrente: false,
  observacoes: null, manual: true, contratante_id: 1, categoria_id: 2, veiculo_id: 3,
  conta_receber_id: null,
  contratantes: { nome: 'Porto Seguro' }, categorias: { nome: 'Guincho' },
  veiculos: { identificacao: 'L168' },
}

test('sem o modulo ligado, continua no backend antigo', async () => {
  servidor.use(http.get('/api/receitas', () => HttpResponse.json([{ id: 1, descricao: 'Antiga' }])))
  const { listarReceitas } = await carregar('')

  expect((await listarReceitas())[0].descricao).toBe('Antiga')
})

test('a linha chega no formato que a tabela ja usa', async () => {
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/receitas`, () => HttpResponse.json([MANUAL])))
  const { listarReceitas } = await carregar('auth,receitas')

  const [receita] = await listarReceitas()

  expect(receita.valor).toBe(500)
  expect(receita.contratante).toBe('Porto Seguro')
  expect(receita.categoria).toBe('Guincho')
  expect(receita.veiculo).toBe('L168')
  expect(receita.manual).toBe(true)
})

// `manual` e coluna gerada pelo banco a partir da origem. A tela usa esse campo
// para decidir se mostra editar/excluir — precisa chegar certo.
test('receita vinda da Porto chega marcada como nao-manual', async () => {
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/receitas`, () => HttpResponse.json([
    { ...MANUAL, id: 5, manual: false },
  ])))
  const { listarReceitas } = await carregar('auth,receitas')

  expect((await listarReceitas())[0].manual).toBe(false)
})

test('traz colunas nomeadas, com teto e da mais recente para a mais antiga', async () => {
  let colunas: string | null = null, limite: string | null = null, ordem: string | null = null
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/receitas`, ({ request }) => {
    const url = new URL(request.url)
    colunas = url.searchParams.get('select')
    limite = url.searchParams.get('limit')
    ordem = url.searchParams.get('order')
    return HttpResponse.json([])
  }))
  const { listarReceitas, TETO_DA_LISTA } = await carregar('auth,receitas')

  await listarReceitas()

  expect(colunas).not.toContain('*')
  expect(colunas).toContain('contratantes(nome)')
  expect(limite).toBe(String(TETO_DA_LISTA))
  expect(ordem).toContain('data_competencia.desc')
})

test('criar envia snake_case', async () => {
  let corpo: Record<string, unknown> = {}
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/receitas`, async ({ request }) => {
    corpo = await request.json() as Record<string, unknown>
    return responder(request, [MANUAL])
  }))
  const { criarReceita } = await carregar('auth,receitas')

  await criarReceita({
    descricao: 'Serviço avulso', valor: 500, dataCompetencia: '2026-09-10',
    dataRecebimento: '2026-09-10', status: 'RECEBIDA', recorrente: false,
    contratanteId: 1, categoriaId: 2, veiculoId: 3, observacoes: '',
  })

  expect(corpo.data_competencia).toBe('2026-09-10')
  expect(corpo.contratante_id).toBe(1)
  expect(corpo.observacoes).toBeNull()
})

test('editar manda PATCH filtrando pelo id', async () => {
  let filtro: string | null = null
  servidor.use(http.patch(`${URL_SUPABASE}/rest/v1/receitas`, ({ request }) => {
    filtro = new URL(request.url).searchParams.get('id')
    return responder(request, [MANUAL])
  }))
  const { atualizarReceita } = await carregar('auth,receitas')

  await atualizarReceita(4, {
    descricao: 'Ajustada', valor: 550, dataCompetencia: '2026-09-10',
    status: 'RECEBIDA', recorrente: false,
  })

  expect(filtro).toBe('eq.4')
})

test('excluir receita manual funciona', async () => {
  servidor.use(http.delete(`${URL_SUPABASE}/rest/v1/receitas`, ({ request }) =>
    responder(request, [{ id: 4 }])))
  const { excluirReceita } = await carregar('auth,receitas')

  await expect(excluirReceita(4)).resolves.toBeUndefined()
})

// A policy filtra por `manual` no USING: a linha da Porto nao e encontrada e o
// delete volta "0 linhas", sem erro. Sem o aviso, a tela fecharia o dialogo de
// confirmacao e a receita continuaria na lista — sucesso silencioso, o pior caso.
test('excluir receita da Porto avisa em vez de fingir que apagou', async () => {
  servidor.use(http.delete(`${URL_SUPABASE}/rest/v1/receitas`, ({ request }) =>
    responder(request, [])))
  const { excluirReceita } = await carregar('auth,receitas')

  await expect(excluirReceita(5)).rejects.toThrow(
    'Receitas originadas da Porto ou de importação não podem ser excluídas manualmente.',
  )
})

test('lista vazia e estado vazio, nao erro', async () => {
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/receitas`, () => HttpResponse.json([])))
  const { listarReceitas } = await carregar('auth,receitas')

  await expect(listarReceitas()).resolves.toEqual([])
})
