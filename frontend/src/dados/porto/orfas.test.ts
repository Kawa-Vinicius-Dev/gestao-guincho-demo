import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../../test/servidor'

/**
 * OS sem socorrista e comissao que ninguem recebe, com o servico ja contado no
 * faturamento. A previa precisa apontar quem ficou sem dono, e a confirmacao
 * precisa recusar enquanto sobrar alguma — sem depender de alguem lembrar de
 * olhar o aviso.
 */
const SUPA = 'https://projeto-teste.supabase.co'

async function carregar() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
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
    http.post(`${SUPA}/rest/v1/rpc/porto_registrar_importacao`, () =>
      HttpResponse.json({ id: 55, status: 'AGUARDANDO_CONFERENCIA' })),
    http.get(`${SUPA}/rest/v1/registros_importados_porto`, () => HttpResponse.json([])),
    http.get(`${SUPA}/rest/v1/ordens_servico_porto`, () => HttpResponse.json([])),
    // O painel do dia traz a viatura, mas nenhuma esta cadastrada com sigla
    // Porto — entao o unico caminho de identificacao aqui e o QRA.
    http.get(`${SUPA}/rest/v1/motoristas`, () => HttpResponse.json([
      { id: 4, nome: 'Qebson Ramos da Silva', qra: '609690', veiculo_id: null },
    ])),
    http.get(`${SUPA}/rest/v1/veiculos`, () => HttpResponse.json([])),
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

// Servico cancelado nao teve atendimento: nao ha comissao para dar dono. Pedir
// socorrista para ele travava a importacao do painel do dia inteiro.
test('serviço cancelado não fica órfão nem trava a importação', async () => {
  servidorDePrevia()
  const { criarPreviaConteudoPorto } = await carregar()

  const previa = await criarPreviaConteudoPorto(`PORTO SEGURO	5677129/26	SOCORRO
14/09/2026	09:02	09:02	CANCELADO	SERVIÇO CANCELADO	Não`)

  expect(previa.orfas).toEqual([])
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
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/porto_confirmar_importacao`, async ({ request }) => {
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

/**
 * As viaturas trocam de socorrista, entao "viatura habitual" seria um palpite
 * que acerta numa semana e erra na outra — e o que ele decide e de quem e a
 * comissao. O palpite vem da escala daquele dia, registrada pelo painel.
 */
function servidorComEscala(escala: Record<string, unknown>[]) {
  servidor.use(
    http.post(`${SUPA}/rest/v1/rpc/porto_registrar_importacao`, () =>
      HttpResponse.json({ id: 56, status: 'AGUARDANDO_CONFERENCIA' })),
    http.get(`${SUPA}/rest/v1/registros_importados_porto`, () => HttpResponse.json([])),
    http.get(`${SUPA}/rest/v1/motoristas`, () => HttpResponse.json([])),
    http.get(`${SUPA}/rest/v1/ordens_servico_porto`, ({ request }) =>
      // A mesma tabela serve as duas consultas da previa: o que ja existe pelo
      // numero, e a escala do dia. A segunda e a que filtra por data.
      HttpResponse.json(new URL(request.url).searchParams.has('data_atendimento') ? escala : [])),
  )
}

const OP_SEM_QRA = `"Número da Ordem de Serviço";"Valor Total";"Especialidade";"Sigla da Viatura";"Socorrista";"QRA";"Data de atendimento"
"01/9990010-26";"200.00";"GUINCHO";"L25";"";"";"2026-05-04"`

test('sem QRA, sugere quem rodou aquela viatura naquele dia', async () => {
  servidorComEscala([{
    data_atendimento: '2026-05-04', sigla_viatura: 'L25',
    motorista_id: 4, motoristas: { nome: 'Qebson Ramos da Silva' },
  }])
  const { criarPreviaConteudoPorto } = await carregar()

  const previa = await criarPreviaConteudoPorto(OP_SEM_QRA)

  expect(previa.orfas).toHaveLength(0)
  expect(previa.linhas[0].dados.motorista_id).toBe('4')
})

test('dois socorristas na mesma viatura no mesmo dia: ninguém é sugerido', async () => {
  servidorComEscala([
    { data_atendimento: '2026-05-04', sigla_viatura: 'L25', motorista_id: 4,
      motoristas: { nome: 'Qebson Ramos da Silva' } },
    { data_atendimento: '2026-05-04', sigla_viatura: 'L25', motorista_id: 7,
      motoristas: { nome: 'Anderson Jorge Ribeiro' } },
  ])
  const { criarPreviaConteudoPorto } = await carregar()

  const previa = await criarPreviaConteudoPorto(OP_SEM_QRA)

  // Entre dois donos possiveis o sistema nao escolhe: errar o dono da comissao
  // em silencio e pior do que perguntar.
  expect(previa.orfas?.map(o => o.numeroOs)).toEqual(['01/9990010-26'])
  expect(previa.linhas[0].dados.motorista_id).toBeUndefined()
})
