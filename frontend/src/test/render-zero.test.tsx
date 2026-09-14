import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from './servidor'

/**
 * A pergunta desta etapa: com todos os modulos ligados, alguma tela ainda fala
 * com o Render?
 *
 * Em vez de abrir o navegador e olhar a aba de rede tela a tela, o proprio teste
 * monta a aplicacao com tudo ligado e registra cada requisicao que sai. E o
 * mesmo dado da aba de rede — so que repetivel, e que falha sozinho quando
 * alguem reintroduzir uma chamada ao backend antigo.
 */

const URL_SUPABASE = 'https://projeto-teste.supabase.co'
const ID = '11111111-1111-1111-1111-111111111111'

/** Toda chamada que sair para o backend antigo entra aqui. */
let chamadasAoRender: string[] = []

const PERFIL = {
  id: ID, nome: 'Administrador', email: 'admin@teste.local',
  perfil: 'ADMINISTRADOR', ativo: true, senha_provisoria: false,
}

const DASHBOARD = {
  receitaRecebida: 1000, receitaPrevista: 300, totalAtrasado: 200,
  despesasPagas: 450, despesasPrevistas: 100, saldoRealizado: 550, saldoProjetado: 750,
  registrosImportados: 0, quilometragemTotal: 1000, kmRemunerado: 800, kmMorto: 200,
  custoKmMorto: 400, producaoPaga: 1000, comissaoSobreProducao: 200, producaoPendente: 300,
  servicosDoPeriodo: 3, servicosPendentes: 1, comissaoAPagar: 200,
  resultadoPorVeiculo: [], resultadoPorSocorrista: [], despesasPorCategoria: [],
}

function seedSessao() {
  sessionStorage.setItem('fluxo-gestao:sessao:v1', JSON.stringify({
    access_token: 'jwt', refresh_token: 'r', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
    user: { id: ID, email: 'admin@teste.local', aud: 'authenticated' },
  }))
}

/** Responde a tudo do Supabase e delata tudo do Render. */
function montarInterceptadores() {
  servidor.use(
    // ---- Render: nao responde, so registra e deixa falhar ----
    http.all('/api/*', ({ request }) => {
      const url = new URL(request.url)
      chamadasAoRender.push(`${request.method} ${url.pathname}`)
      return HttpResponse.json({ detalhe: 'backend antigo' }, { status: 503 })
    }),
    // ---- Supabase ----
    http.get(`${URL_SUPABASE}/rest/v1/perfis`, ({ request }) =>
      HttpResponse.json(request.headers.get('Accept')?.includes('pgrst.object') ? PERFIL : [PERFIL])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/dashboard_resumo`, () =>
      HttpResponse.json({ financeiro: DASHBOARD, porto: null })),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/dashboard_financeiro`, () => HttpResponse.json(DASHBOARD)),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/extrato_financeiro`, () => HttpResponse.json([])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/comissao_do_ciclo`, () =>
      HttpResponse.json({ servicos: [], alimentacoes: [], liquido: 0 })),
    http.get(`${URL_SUPABASE}/rest/v1/*`, () => HttpResponse.json([])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/*`, () => HttpResponse.json(null)),
    http.all(`${URL_SUPABASE}/auth/v1/*`, () => HttpResponse.json({ user: { id: ID } })),
    http.all(`${URL_SUPABASE}/storage/v1/*`, () => HttpResponse.json([])),
  )
}

async function abrir(rota: string) {
  chamadasAoRender = []
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', URL_SUPABASE)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  seedSessao()
  montarInterceptadores()
  window.history.replaceState({}, '', rota)
  const { default: App } = await import('../App')
  render(<App />)
  // Espera a tela sair do estado de carregamento antes de julgar.
  await waitFor(() => expect(screen.queryByText(/Carregando/i)).not.toBeInTheDocument(),
    { timeout: 5000 })
  await new Promise(r => setTimeout(r, 150))
  return chamadasAoRender
}

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); chamadasAoRender = [] })
afterEach(() => vi.unstubAllEnvs())

/**
 * Os atalhos do menu lateral sao carregados pelo Layout, nao pelas paginas —
 * entao aparecem em TODA tela que tem menu. Enquanto `/api/favoritos` nao
 * migrar, nenhuma tela do sistema e livre do Render, por melhor que esteja o
 * miolo dela. Foi este teste que mostrou isso: o inventario por pagina nao
 * pegava, porque a chamada nao esta em pagina nenhuma.
 */
const MENU = '/api/favoritos'

// O estado real de cada tela, medido. Quando uma dependencia cair, a lista aqui
// encolhe e o teste avisa — e o mapa da migracao, nao um alvo aspiracional.
test.each([
  ['Visão geral (dashboard)', '/', [MENU]],
  ['Veículos', '/veiculos', [MENU]],
  ['Receitas', '/receitas', [MENU]],
  ['DRE', '/dre', [MENU]],
  ['Fluxo de caixa', '/fluxo-caixa', [MENU]],
  ['Socorristas', '/equipe', [MENU]],
  ['Contas a receber', '/contas-receber', [MENU]],
  ['Lançamentos', '/lancamentos', [MENU]],
  ['Despesas', '/despesas', [MENU, '/api/despesas-recorrentes']],
  ['Quilometragem', '/quilometragem', [MENU, '/api/quilometragens']],
  ['Configurações', '/configuracoes', [MENU, '/api/usuarios']],
  ['Minha comissão', '/minha-comissao', [MENU, '/api/comissoes/periodos']],
])('%s: o que ainda vai ao Render e exatamente %j', async (_n, rota, esperadas) => {
  const chamadas = await abrir(rota)
  const caminhos = [...new Set(chamadas.map(c => c.split(' ')[1]))].sort()
  expect(caminhos).toEqual([...esperadas].sort())
})

// O miolo financeiro — indicadores, extrato, cadastros — ja nao passa pelo
// backend antigo. O que sobra nessas telas e o menu, que e do Layout.
test('as telas financeiras nao chamam o Render por dado proprio', async () => {
  for (const rota of ['/', '/veiculos', '/receitas', '/dre', '/fluxo-caixa']) {
    const chamadas = await abrir(rota)
    const proprias = chamadas.filter(c => !c.includes(MENU))
    expect(proprias, `rota ${rota}`).toEqual([])
  }
})
