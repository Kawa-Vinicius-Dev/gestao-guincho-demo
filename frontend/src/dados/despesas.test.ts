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

test('excluir apaga a linha e o comprovante que ficaria órfão no bucket', async () => {
  let apagouLinha = '', apagouArquivo: string[] = []
  servidor.use(
    http.delete(`${URL_SUPABASE}/rest/v1/despesas`, ({ request }) => {
      apagouLinha = new URL(request.url).searchParams.get('id') ?? ''
      return HttpResponse.json([{ id: 12 }])
    }),
    http.delete(`${URL_SUPABASE}/storage/v1/object/comprovantes`, async ({ request }) => {
      apagouArquivo = ((await request.json()) as { prefixes: string[] }).prefixes
      return HttpResponse.json([])
    }),
  )
  comSessao()
  const { excluirDespesa } = await carregar('auth,despesas')

  await excluirDespesa({
    id: 12, descricao: 'Diesel', categoria: 'Combustível', valor: 250,
    data: '2026-09-08', status: 'PENDENTE', aprovada: false, criadoPor: 'Ana',
    comprovante: 'despesas/12/nota.pdf',
  })

  expect(apagouLinha).toBe('eq.12')
  expect(apagouArquivo).toEqual(['despesas/12/nota.pdf'])
})

// O PostgREST responde 200 com lista vazia quando a policy filtra tudo. Sem
// olhar quantas linhas voltaram, a tela diria "excluida" e a despesa seguiria la.
test('exclusão que a policy recusou não passa por bem-sucedida', async () => {
  servidor.use(http.delete(`${URL_SUPABASE}/rest/v1/despesas`, () => HttpResponse.json([])))
  comSessao()
  const { excluirDespesa } = await carregar('auth,despesas')

  await expect(excluirDespesa({
    id: 12, descricao: 'Diesel', categoria: 'Combustível', valor: 250,
    data: '2026-09-08', status: 'PENDENTE', aprovada: false, criadoPor: 'Ana',
  })).rejects.toThrow(/não tem permissão/i)
})

// A despesa que representa o pagamento de uma comissao tem FK com `on delete
// restrict`. A mensagem generica de "registro em uso" nao diz o que fazer.
test('despesa de comissão explica o caminho em vez do erro genérico', async () => {
  servidor.use(http.delete(`${URL_SUPABASE}/rest/v1/despesas`, () => HttpResponse.json({
    code: '23503', message: 'update or delete on table "despesas" violates foreign key '
      + 'constraint "pagamentos_comissao_despesa_id_fkey" on table "pagamentos_comissao"',
  }, { status: 409 })))
  comSessao()
  const { excluirDespesa } = await carregar('auth,despesas')

  await expect(excluirDespesa({
    id: 12, descricao: 'Comissão Anderson', categoria: 'Comissões', valor: 900,
    data: '2026-09-08', status: 'PAGO', aprovada: true, criadoPor: 'Ana',
  })).rejects.toThrow(/cancele o pagamento da comissão/i)
})

// "Almoco de Fulano" com viatura e socorrista preenchidos sumia do lado do
// socorrista: a agregacao do painel so conta a despesa no socorrista quando ela
// nao tem viatura OU e alimentacao, e o formulario nunca marcava alimentacao.
test('alimentação do socorrista sai marcada, e não como despesa comum', async () => {
  let enviado: Record<string, unknown> = {}
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/despesas`, async ({ request }) => {
    enviado = await request.json() as Record<string, unknown>
    return responder(request, [LINHA])
  }))
  comSessao()
  const { criarDespesa } = await carregar('auth,despesas')

  await criarDespesa({
    descricao: 'Almoço de Fulano', categoriaId: 3, valor: 50, data: '2026-04-02',
    veiculoId: 2, motoristaId: 7, natureza: 'ALIMENTACAO_FUNCIONARIO',
  })

  expect(enviado.natureza).toBe('ALIMENTACAO_FUNCIONARIO')
  expect(enviado.motorista_id).toBe(7)
  // Alimentacao e custo do socorrista, nao da viatura: a viatura nao e gravada
  // nem quando chega preenchida, porque o painel a descarta de qualquer forma e
  // sobraria um vinculo que nenhuma conta usa.
  expect(enviado.veiculo_id).toBeNull()
})

// Sem socorrista nao ha de quem descontar: a marca viraria um estado que
// nenhuma tela consegue usar, e a despesa sumiria da viatura sem aparecer em
// lugar nenhum.
test('alimentação sem socorrista volta a ser despesa comum', async () => {
  let enviado: Record<string, unknown> = {}
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/despesas`, async ({ request }) => {
    enviado = await request.json() as Record<string, unknown>
    return responder(request, [LINHA])
  }))
  comSessao()
  const { criarDespesa } = await carregar('auth,despesas')

  await criarDespesa({
    descricao: 'Almoço', categoriaId: 3, valor: 50, data: '2026-04-02',
    veiculoId: 2, natureza: 'ALIMENTACAO_FUNCIONARIO',
  })

  expect(enviado.natureza).toBe('GERAL')
})

test('despesa comum continua nascendo GERAL', async () => {
  let enviado: Record<string, unknown> = {}
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/despesas`, async ({ request }) => {
    enviado = await request.json() as Record<string, unknown>
    return responder(request, [LINHA])
  }))
  comSessao()
  const { criarDespesa } = await carregar('auth,despesas')

  await criarDespesa({ descricao: 'Diesel', categoriaId: 2, valor: 250, data: '2026-04-02', veiculoId: 2 })

  expect(enviado.natureza).toBe('GERAL')
})
