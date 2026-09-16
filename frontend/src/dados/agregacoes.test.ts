import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

const URL_SUPABASE = 'https://projeto-teste.supabase.co'

/**
 * Prepara o ambiente e entrega o modulo recem-importado.
 *
 * O carregador vem como funcao, e nao como nome: import com caminho montado em
 * tempo de execucao impede o bundler de saber o que empacotar.
 */
async function carregar<T>(modulos: string, carregador: () => Promise<T>): Promise<T> {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', URL_SUPABASE)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', modulos)
  const { esquecerCliente } = await import('./cliente')
  esquecerCliente()
  return carregador()
}

beforeEach(() => { sessionStorage.clear(); localStorage.clear() })
afterEach(() => vi.unstubAllEnvs())

// ---------------------------------------------------------------- extrato
const LINHA_EXTRATO = {
  id: 'D12', tipo: 'DESPESA', referencia_id: 12, descricao: 'Diesel',
  categoria: 'Combustível', valor: '400.00', data: '2026-09-08', status: 'PAGO',
  realizado: true, veiculo: 'L168', veiculo_id: 1, motorista: 'Anderson',
  origem: 'MANUAL', protocolo: null,
}

test('extrato: a linha do banco chega no formato que a tabela usa', async () => {
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/extrato_financeiro`, () =>
    HttpResponse.json([LINHA_EXTRATO])))
  const { lerExtrato } = await carregar('auth,dashboard', () => import('./extrato'))

  const [linha] = await lerExtrato('2026-09-01', '2026-09-30')

  expect(linha).toEqual({
    id: 'D12', tipo: 'DESPESA', referenciaId: 12, descricao: 'Diesel',
    categoria: 'Combustível', valor: 400, data: '2026-09-08', status: 'PAGO',
    realizado: true, veiculo: 'L168', veiculoId: 1, motorista: 'Anderson',
    origem: 'MANUAL', protocolo: undefined,
  })
})

// Receita e despesa vinham de dois lugares e eram unidas na memoria do servidor.
// Agora o banco entrega a lista pronta, numa chamada.
test('extrato: uma chamada traz receitas e despesas juntas', async () => {
  let chamadas = 0
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/extrato_financeiro`, () => {
    chamadas++
    return HttpResponse.json([LINHA_EXTRATO, { ...LINHA_EXTRATO, id: 'R4', tipo: 'RECEITA' }])
  }))
  const { lerExtrato } = await carregar('auth,dashboard', () => import('./extrato'))

  const linhas = await lerExtrato('2026-09-01', '2026-09-30')

  expect(chamadas).toBe(1)
  expect(linhas.map(l => l.tipo)).toEqual(['DESPESA', 'RECEITA'])
})

test('extrato: periodo sem movimento e lista vazia, nao erro', async () => {
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/extrato_financeiro`, () =>
    HttpResponse.json([])))
  const { lerExtrato } = await carregar('auth,dashboard', () => import('./extrato'))

  await expect(lerExtrato('2020-01-01', '2020-01-31')).resolves.toEqual([])
})

// ---------------------------------------------------------------- contas
const LINHA_CONTA = {
  id: 1, protocolo: 'PS-1001', descricao: 'Remoção segurado',
  valor_previsto: '800.00', valor_recebido: '780.00', data_competencia: '2026-09-20',
  vencimento: '2026-09-22', data_recebimento: '2026-09-23', status: 'RECEBIDO',
  origem: 'MANUAL', observacoes: null, importacao_id: null, veiculo_id: 1,
  contratantes: { id: 1, nome: 'Porto Seguro', ativo: true },
  veiculos: { id: 1, identificacao: 'L168', placa: 'AAA1A11', custo_por_km: '2.00', ativo: true },
}

test('contas: a diferenca sai da subtracao, sem coluna extra no trafego', async () => {
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/contas_receber`, () =>
    HttpResponse.json([LINHA_CONTA])))
  const { listarContas } = await carregar('auth,dashboard', () => import('./contas'))

  const [conta] = await listarContas()

  expect(conta.valorPrevisto).toBe(800)
  expect(conta.valorRecebido).toBe(780)
  expect(conta.diferenca).toBe(-20)
  expect(conta.contratante.nome).toBe('Porto Seguro')
})

test('contas: conta em aberto nao inventa diferenca', async () => {
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/contas_receber`, () =>
    HttpResponse.json([{ ...LINHA_CONTA, valor_recebido: null, data_recebimento: null, status: 'PENDENTE' }])))
  const { listarContas } = await carregar('auth,dashboard', () => import('./contas'))

  const [conta] = await listarContas()

  expect(conta.valorRecebido).toBeUndefined()
  expect(conta.diferenca).toBeUndefined()
})

// A busca do backend olhava protocolo e descricao. Filtrar no browser exigiria
// trazer a tabela inteira a cada tecla.
test('contas: a busca vai para o banco, nos dois campos', async () => {
  let filtro: string | null = null
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/contas_receber`, ({ request }) => {
    filtro = new URL(request.url).searchParams.get('or')
    return HttpResponse.json([])
  }))
  const { listarContas } = await carregar('auth,dashboard', () => import('./contas'))

  await listarContas({ pesquisa: 'Porto' })

  expect(filtro).toContain('protocolo.ilike.%Porto%')
  expect(filtro).toContain('descricao.ilike.%Porto%')
})

test('contas: o filtro de situacao tambem vai para o banco', async () => {
  let status: string | null = null
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/contas_receber`, ({ request }) => {
    status = new URL(request.url).searchParams.get('status')
    return HttpResponse.json([])
  }))
  const { listarContas } = await carregar('auth,dashboard', () => import('./contas'))

  await listarContas({ status: 'ATRASADO' })

  expect(status).toBe('eq.ATRASADO')
})

test('contas: receber vai por RPC, com valor e data juntos', async () => {
  let corpo: unknown = null
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/receber_conta`, async ({ request }) => {
    corpo = await request.json()
    return HttpResponse.json(null)
  }))
  const { receberConta } = await carregar('auth,dashboard', () => import('./contas'))

  await receberConta(1, 780, '2026-09-23')

  expect(corpo).toEqual({ p_conta_id: 1, p_valor_recebido: 780, p_data_recebimento: '2026-09-23' })
})

test('contas: receber conta ja recebida chega com a frase do banco', async () => {
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/receber_conta`, () =>
    HttpResponse.json({ code: 'P0001', message: 'Conta ja recebida.' }, { status: 400 })))
  const { receberConta } = await carregar('auth,dashboard', () => import('./contas'))

  await expect(receberConta(1, 780, '2026-09-23')).rejects.toThrow('Conta ja recebida.')
})

// ---------------------------------------------------------------- comissoes
test('comissao: o administrador consulta a de um socorrista', async () => {
  let corpo: unknown = null
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/comissao_das_ops`, async ({ request }) => {
    corpo = await request.json()
    return HttpResponse.json({ comissaoBruta: 200, liquido: 150, servicos: [] })
  }))
  const { lerComissaoDaOp } = await carregar('auth,comissoes', () => import('./comissoes'))

  const comissao = await lerComissaoDaOp([1], 7)

  expect(corpo).toEqual({ p_op_ids: [1], p_motorista_id: 7 })
  expect(comissao.liquido).toBe(150)
})

// Sem motorista, a funcao resolve pelo vinculo da sessao — o socorrista nunca
// precisa (nem pode) informar de quem e a comissao.
test('comissao: o socorrista pede a propria, sem informar quem e', async () => {
  let corpo: Record<string, unknown> = {}
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/comissao_das_ops`, async ({ request }) => {
    corpo = await request.json() as Record<string, unknown>
    return HttpResponse.json({ comissaoBruta: 200, liquido: 150, servicos: [] })
  }))
  const { lerComissaoDaOp } = await carregar('auth,comissoes', () => import('./comissoes'))

  await lerComissaoDaOp([1])

  expect(corpo.p_motorista_id).toBeNull()
})

test('comissao: pedir a de outro chega com a recusa do banco', async () => {
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/comissao_das_ops`, () =>
    HttpResponse.json({ code: '42501', message: 'negado' }, { status: 403 })))
  const { lerComissaoDaOp } = await carregar('auth,comissoes', () => import('./comissoes'))

  await expect(lerComissaoDaOp([1], 99))
    .rejects.toThrow('Você não tem permissão para esta operação.')
})
