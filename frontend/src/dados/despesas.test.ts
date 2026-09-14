import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

const URL_SUPABASE = 'https://projeto-teste.supabase.co'
const ID_USUARIO = '33333333-3333-3333-3333-333333333333'

/** Sessao do Supabase como o supabase-js a grava, para o insert achar o uid. */
function comSessao() {
  sessionStorage.setItem('fluxo-gestao:sessao:v1', JSON.stringify({
    access_token: 'jwt-de-teste', refresh_token: 'r', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
    user: { id: ID_USUARIO, email: 'ana@teste.local', aud: 'authenticated' },
  }))
}

async function carregar(modulos: string) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', URL_SUPABASE)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', modulos)
  const { esquecerCliente } = await import('./cliente')
  esquecerCliente()
  return import('./despesas')
}

function responder(request: Request, linhas: Record<string, unknown>[]) {
  const objeto = request.headers.get('Accept')?.includes('pgrst.object')
  return HttpResponse.json(objeto ? linhas[0] ?? null : linhas)
}

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.unstubAllEnvs())

const LINHA = {
  id: 12, descricao: 'Diesel', valor: '250.00', data_lancamento: '2026-09-08',
  vencimento: null, data_pagamento: null, forma_pagamento: null,
  status: 'PENDENTE', aprovada: false, protocolo: null, observacoes: null,
  comprovante_arquivo: null, comprovante_nome_original: null, comprovante_tamanho_bytes: null,
  categorias: { nome: 'Combustível' }, veiculos: { identificacao: 'L168' },
  motoristas: { nome: 'Anderson' }, perfis: { nome: 'Ana' },
}

test('sem o modulo ligado, continua no backend antigo', async () => {
  servidor.use(http.get('/api/despesas', () => HttpResponse.json([{ id: 1, descricao: 'Antiga' }])))
  const { listarDespesas } = await carregar('')

  expect((await listarDespesas())[0].descricao).toBe('Antiga')
})

test('a linha chega no formato que a tabela ja usa, com os nomes resolvidos', async () => {
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/despesas`, () => HttpResponse.json([LINHA])))
  const { listarDespesas } = await carregar('auth,despesas')

  const [despesa] = await listarDespesas()

  expect(despesa.categoria).toBe('Combustível')
  expect(despesa.veiculo).toBe('L168')
  expect(despesa.motorista).toBe('Anderson')
  expect(despesa.criadoPor).toBe('Ana')
  expect(despesa.valor).toBe(250)
})

// Sem os joins embutidos, montar a tabela exigiria buscar categoria, viatura,
// socorrista e autor de cada linha — o N+1 que derruba a tela com 200 despesas.
test('traz tudo numa consulta so, com colunas nomeadas', async () => {
  let idas = 0
  let colunas: string | null = null
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/despesas`, ({ request }) => {
    idas++
    colunas = new URL(request.url).searchParams.get('select')
    return HttpResponse.json([LINHA, { ...LINHA, id: 13 }])
  }))
  const { listarDespesas } = await carregar('auth,despesas')

  await listarDespesas()

  expect(idas).toBe(1)
  expect(colunas).toContain('categorias(nome)')
  expect(colunas).not.toContain('*')
})

// A tela nao tem paginacao e o backend devolvia a tabela inteira. Sem teto, cada
// abertura cresce para sempre.
test('a listagem tem teto e vem da mais recente para a mais antiga', async () => {
  let limite: string | null = null
  let ordem: string | null = null
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/despesas`, ({ request }) => {
    const url = new URL(request.url)
    limite = url.searchParams.get('limit')
    ordem = url.searchParams.get('order')
    return HttpResponse.json([])
  }))
  const { listarDespesas, TETO_DA_LISTA } = await carregar('auth,despesas')

  await listarDespesas()

  expect(TETO_DA_LISTA).toBe(300)
  expect(limite).toBe(String(TETO_DA_LISTA))
  expect(ordem).toContain('data_lancamento.desc')
})

test('lancar carimba quem lancou a partir da sessao, e nasce pendente', async () => {
  comSessao()
  let corpo: Record<string, unknown> = {}
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/despesas`, async ({ request }) => {
    corpo = await request.json() as Record<string, unknown>
    return responder(request, [LINHA])
  }))
  const { criarDespesa } = await carregar('auth,despesas')

  await criarDespesa({
    descricao: 'Diesel', categoriaId: 1, valor: 250, data: '2026-09-08', status: 'PAGO',
  })

  expect(corpo.criado_por).toBe(ID_USUARIO)
  // "Paga sem aprovacao" e justamente o estado que o fluxo de aprovacao impede;
  // a propria tela avisa "Aprove para inclui-la nos totais".
  expect(corpo.status).toBe('PENDENTE')
  expect(corpo.aprovada).toBe(false)
})

test('sem sessao, lancar avisa que precisa entrar de novo', async () => {
  const { criarDespesa } = await carregar('auth,despesas')

  await expect(criarDespesa({ descricao: 'X', categoriaId: 1, valor: 1, data: '2026-09-08' }))
    .rejects.toThrow('Sessão expirada. Entre novamente.')
})

test('aprovar vai por RPC, nao por update de coluna', async () => {
  comSessao()
  let corpo: unknown = null
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/aprovar_despesa`, async ({ request }) => {
    corpo = await request.json()
    return HttpResponse.json(null)
  }))
  const { aprovarDespesa } = await carregar('auth,despesas')

  await aprovarDespesa(12)

  expect(corpo).toEqual({ p_despesa_id: 12 })
})

test('pagar vai por RPC com data e forma', async () => {
  comSessao()
  let corpo: unknown = null
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/pagar_despesa`, async ({ request }) => {
    corpo = await request.json()
    return HttpResponse.json(null)
  }))
  const { pagarDespesa } = await carregar('auth,despesas')

  await pagarDespesa(12, '2026-09-10', 'PIX')

  expect(corpo).toEqual({
    p_despesa_id: 12, p_data_pagamento: '2026-09-10', p_forma_pagamento: 'PIX',
  })
})

// A regra do banco e escrita em portugues pensando em quem le; o repositorio
// repassa sem reescrever.
test('recusa de aprovar o proprio lancamento chega com a frase do banco', async () => {
  comSessao()
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/aprovar_despesa`, () => HttpResponse.json({
    code: 'P0001', message: 'Ninguem aprova o proprio lancamento.',
  }, { status: 400 })))
  const { aprovarDespesa } = await carregar('auth,despesas')

  await expect(aprovarDespesa(12)).rejects.toThrow('Ninguem aprova o proprio lancamento.')
})

test('pagar sem aprovar chega com a frase do banco', async () => {
  comSessao()
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/pagar_despesa`, () => HttpResponse.json({
    code: 'P0001', message: 'Despesa precisa ser aprovada antes de ser paga.',
  }, { status: 400 })))
  const { pagarDespesa } = await carregar('auth,despesas')

  await expect(pagarDespesa(12, '2026-09-10'))
    .rejects.toThrow('Despesa precisa ser aprovada antes de ser paga.')
})

test('lista vazia e estado vazio, nao erro', async () => {
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/despesas`, () => HttpResponse.json([])))
  const { listarDespesas } = await carregar('auth,despesas')

  await expect(listarDespesas()).resolves.toEqual([])
})
