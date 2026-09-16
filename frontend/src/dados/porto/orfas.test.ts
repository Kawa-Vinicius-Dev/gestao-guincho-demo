import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../../test/servidor'

/**
 * OS sem socorrista e comissao que ninguem recebe, com o servico ja contado no
 * faturamento. A previa precisa apontar quem ficou sem dono, e a confirmacao
 * precisa recusar enquanto sobrar alguma — sem depender de alguem lembrar de
 * olhar o aviso.
 */
const URL = 'https://projeto-teste.supabase.co'

async function carregar() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', URL)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('../cliente')
  esquecerCliente()
  return import('./importacao')
}

beforeEach(() => { sessionStorage.clear(); localStorage.clear() })
afterEach(() => vi.unstubAllEnvs())

/** Uma OS com QRA conhecido e outra com QRA que nao existe no cadastro. */
const COLADO = `PORTO SEGURO	5673329/26	SOCORRO	L168
QEBSON RAMOS DA SILVA	14/09/2026	06:34	06:34	ACIONADO/FINAL	EM PROCESSAMENTO	Não
PORTO SEGURO	5673528/26	SOCORRO
14/09/2026	06:57	06:57	ACIONADO/FINAL	EM PROCESSAMENTO	Não`

function servidorDePrevia() {
  servidor.use(
    http.post(`${URL}/rest/v1/rpc/porto_registrar_importacao`, () =>
      HttpResponse.json({ id: 55, status: 'AGUARDANDO_CONFERENCIA' })),
    http.get(`${URL}/rest/v1/registros_importados_porto`, () => HttpResponse.json([])),
    http.get(`${URL}/rest/v1/ordens_servico_porto`, () => HttpResponse.json([])),
    // O painel do dia traz a viatura, mas nenhuma esta cadastrada com sigla
    // Porto — entao o unico caminho de identificacao aqui e o QRA.
    http.get(`${URL}/rest/v1/motoristas`, () => HttpResponse.json([
      { id: 4, nome: 'Qebson Ramos da Silva', qra: '609690', veiculo_id: null },
    ])),
    http.get(`${URL}/rest/v1/veiculos`, () => HttpResponse.json([])),
  )
}

test('a prévia aponta só as OS que ficaram sem socorrista', async () => {
  servidorDePrevia()
  const { criarPreviaConteudoPorto } = await carregar()

  const previa = await criarPreviaConteudoPorto(COLADO)

  // O painel do dia nao traz QRA, entao as duas linhas ficam orfas: a
  // identificacao por nome nao existe de proposito, para nao vincular comissao
  // a partir de um nome cortado pela largura da coluna de origem.
  expect(previa.orfas?.map(o => o.numeroOs)).toEqual(['5673329/26', '5673528/26'])
})

test('confirmar é recusado enquanto houver OS sem socorrista', async () => {
  servidorDePrevia()
  const { criarPreviaConteudoPorto, confirmarImportacaoPorto } = await carregar()
  const previa = await criarPreviaConteudoPorto(COLADO)

  await expect(confirmarImportacaoPorto(previa))
    .rejects.toThrow(/sem socorrista/i)
})

test('com o socorrista escolhido na tela, a importação segue', async () => {
  servidorDePrevia()
  let enviado: Record<string, unknown> = {}
  servidor.use(http.post(`${URL}/rest/v1/rpc/porto_confirmar_importacao`, async ({ request }) => {
    enviado = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: 55, tipo: 'PAINEL_DIARIO', importados: 2, ignorados: 0, novos: 2,
      atualizados: 0, receitasCriadas: 0, valorTotal: 0, osSemSocorrista: [],
    })
  }))
  const { criarPreviaConteudoPorto, confirmarImportacaoPorto } = await carregar()
  const previa = await criarPreviaConteudoPorto(COLADO)

  // E o que a tela faz ao escolher: grava a decisao na propria linha.
  const resolvida = {
    ...previa,
    linhas: previa.linhas.map(l => ({ ...l, dados: { ...l.dados, motorista_id: '4' } })),
  }
  const resposta = await confirmarImportacaoPorto(resolvida)

  expect(resposta.importados).toBe(2)
  const linhas = enviado.p_linhas as Record<string, string>[]
  expect(linhas.every(l => l.motorista_id === '4')).toBe(true)
})
