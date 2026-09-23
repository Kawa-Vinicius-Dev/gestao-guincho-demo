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
  return import('./dashboard')
}

beforeEach(() => { sessionStorage.clear(); localStorage.clear() })
afterEach(() => vi.unstubAllEnvs())

const FINANCEIRO = {
  receitaRecebida: 1000, receitaPrevista: 300, totalAtrasado: 200,
  despesasPagas: 450, despesasPrevistas: 100, saldoRealizado: 550, saldoProjetado: 750,
  registrosImportados: 0, quilometragemTotal: 1000, kmRemunerado: 800,
  kmMorto: 200, custoKmMorto: 400, producaoPaga: 1000, comissaoSobreProducao: 200,
  producaoPendente: 300, servicosDoPeriodo: 3, servicosPendentes: 1, comissaoAPagar: 200,
  resultadoPorVeiculo: [], resultadoPorSocorrista: [], despesasPorCategoria: [],
  despesasAcumuladasPorDia: [
    { data: '2026-09-08', valorDia: 400, acumulado: 400 },
    { data: '2026-09-09', valorDia: 50, acumulado: 450 },
  ],
}
const PORTO = {
  quantidadeTotalOps: 2, valorTotalPrevisto: 1500, valorProgramado: 500, valorRecebido: 980,
}

// O caminho antigo abria a tela com duas requisicoes; a nova faz uma.
test('no Supabase, os indicadores vem numa chamada so', async () => {
  let chamadas = 0
  let corpo: unknown = null
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/dashboard_resumo`, async ({ request }) => {
    chamadas++
    corpo = await request.json()
    return HttpResponse.json({ financeiro: FINANCEIRO })
  }))
  const { lerDashboard } = await carregar('auth,dashboard')

  const resumo = await lerDashboard('2026-09-01', '2026-09-30')

  expect(chamadas).toBe(1)
  expect(corpo).toEqual({ p_inicio: '2026-09-01', p_fim: '2026-09-30', p_por_competencia: true })
  expect(resumo.financeiro.saldoRealizado).toBe(550)
  expect(resumo.financeiro.despesasAcumuladasPorDia?.at(-1)?.acumulado).toBe(450)
})

test('o mesmo periodo pedido de novo nao repete a consulta', async () => {
  let chamadas = 0
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/dashboard_resumo`, () => {
    chamadas++
    return HttpResponse.json({ financeiro: FINANCEIRO, porto: PORTO })
  }))
  const { lerDashboard } = await carregar('auth,dashboard')

  await lerDashboard('2026-09-01', '2026-09-30')
  await lerDashboard('2026-09-01', '2026-09-30')

  expect(chamadas).toBe(1)
})

test('periodo diferente e consulta diferente', async () => {
  let chamadas = 0
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/dashboard_resumo`, () => {
    chamadas++
    return HttpResponse.json({ financeiro: FINANCEIRO, porto: PORTO })
  }))
  const { lerDashboard } = await carregar('auth,dashboard')

  await lerDashboard('2026-09-01', '2026-09-30')
  await lerDashboard('2026-08-01', '2026-08-31')

  expect(chamadas).toBe(2)
})

// A tela pinta o periodo ja conhecido na hora e revalida por baixo, em vez de
// piscar o esqueleto a cada troca de mes.
test('o periodo ja visto fica disponivel na hora, sem esperar a rede', async () => {
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/dashboard_resumo`, () =>
    HttpResponse.json({ financeiro: FINANCEIRO, porto: PORTO })))
  const { lerDashboard, dashboardEmCache } = await carregar('auth,dashboard')

  expect(dashboardEmCache('2026-09-01', '2026-09-30')).toBeUndefined()
  await lerDashboard('2026-09-01', '2026-09-30')

  expect(dashboardEmCache('2026-09-01', '2026-09-30')?.financeiro.saldoRealizado).toBe(550)
})

// Servir por um minuto um total que a pessoa acabou de alterar e pior do que esperar.
test('quem mexe em dinheiro derruba o cache', async () => {
  let chamadas = 0
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/dashboard_resumo`, () => {
    chamadas++
    return HttpResponse.json({ financeiro: FINANCEIRO, porto: PORTO })
  }))
  const { lerDashboard, invalidarCacheFinanceiro, dashboardEmCache } = await carregar('auth,dashboard')

  await lerDashboard('2026-09-01', '2026-09-30')
  invalidarCacheFinanceiro()

  expect(dashboardEmCache('2026-09-01', '2026-09-30')).toBeUndefined()
  await lerDashboard('2026-09-01', '2026-09-30')
  expect(chamadas).toBe(2)
})

test('resposta iniciada antes da limpeza não volta ao cache financeiro', async () => {
  let liberar!: () => void
  const espera = new Promise<void>(resolve => { liberar = resolve })
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/dashboard_resumo`, async () => {
    await espera
    return HttpResponse.json({ financeiro: FINANCEIRO, porto: PORTO })
  }))
  const { lerDashboard, invalidarCacheFinanceiro, dashboardEmCache } = await carregar('auth,dashboard')

  const pedidoAntigo = lerDashboard('2026-09-01', '2026-09-30')
  invalidarCacheFinanceiro()
  liberar()
  await pedidoAntigo

  expect(dashboardEmCache('2026-09-01', '2026-09-30')).toBeUndefined()
})

test('forcar ignora o cache', async () => {
  let chamadas = 0
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/dashboard_resumo`, () => {
    chamadas++
    return HttpResponse.json({ financeiro: FINANCEIRO, porto: PORTO })
  }))
  const { lerDashboard } = await carregar('auth,dashboard')

  await lerDashboard('2026-09-01', '2026-09-30')
  await lerDashboard('2026-09-01', '2026-09-30', { forcar: true })

  expect(chamadas).toBe(2)
})

// Receita, lucro e margem nao podem sobreviver ao fim da sessao num lugar que
// qualquer script da pagina le.
test('nada financeiro encosta no localStorage', async () => {
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/dashboard_resumo`, () =>
    HttpResponse.json({ financeiro: FINANCEIRO, porto: PORTO })))
  const { lerDashboard } = await carregar('auth,dashboard')

  await lerDashboard('2026-09-01', '2026-09-30')

  expect(localStorage.length).toBe(0)
  expect(JSON.stringify(localStorage)).not.toContain('saldoRealizado')
})

test('a DRE pede so os indicadores, sem o bloco Porto', async () => {
  let rota = ''
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/dashboard_financeiro`, ({ request }) => {
    rota = new URL(request.url).pathname
    return HttpResponse.json(FINANCEIRO)
  }))
  const { lerIndicadores } = await carregar('auth,dashboard')

  const indicadores = await lerIndicadores('2026-09-01', '2026-09-30')

  expect(rota).toContain('dashboard_financeiro')
  expect(indicadores.saldoRealizado).toBe(550)
})

test('falha na RPC chega na tela com mensagem', async () => {
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/dashboard_resumo`, () =>
    HttpResponse.json({ code: '42501', message: 'negado' }, { status: 403 })))
  const { lerDashboard } = await carregar('auth,dashboard')

  await expect(lerDashboard('2026-09-01', '2026-09-30'))
    .rejects.toThrow('Você não tem permissão para esta operação.')
})
