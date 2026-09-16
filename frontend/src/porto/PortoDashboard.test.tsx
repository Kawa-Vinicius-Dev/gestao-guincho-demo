import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

const SUPA = 'https://projeto-teste.supabase.co'

async function abrirPainel() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('../dados/cliente')
  esquecerCliente()
  return (await import('./PortoDashboardPage')).default
}

beforeEach(() => { sessionStorage.clear(); localStorage.clear() })
afterEach(() => vi.unstubAllEnvs())

/** Os numeros sao os da primeira OP real: 275 servicos, R$ 74.770,00. */
const painel = (extra: Record<string, unknown> = {}) => ({
  quantidadeTotalOps: 1, valorTotalPrevisto: 74770, quantidadeSemComposicao: 0,
  valorSemComposicao: 0, quantidadeConciliadas: 1, valorConciliadas: 74770,
  quantidadeValorAbaixo: 0, diferencaTotalAbaixo: 0, quantidadeValorAcima: 0,
  diferencaTotalAcima: 0, quantidadeComDivergencia: 0, valorTotalDivergencias: 0,
  quantidadePagamentoProgramado: 1, valorProgramado: 74770,
  quantidadeRecebidas: 1, valorRecebido: 74770,
  quantidadeAguardandoRecebimento: 0, valorAguardandoRecebimento: 0,
  quantidadeVencidasNaoRecebidas: 0, valorVencidoNaoRecebido: 0,
  valorMedioPorOp: 74770, quantidadeOrdensServico: 275,
  quantidadeTotalServicos: 275, valorTotalRealizado: 74770,
  quantidadeAguardandoOp: 0, valorAguardandoOp: 0,
  quantidadeServicosPagamentoProgramado: 275, valorServicosPagamentoProgramado: 74770,
  valorPrevistoAReceber: 74770, valorConciliado: 74770, valorEfetivamenteRecebido: 74770,
  quantidadeServicosPendentes: 0, valorServicosPendentes: 0, quantidadeServicosDevolvidos: 0,
  porEspecialidade: [], porSocorrista: [],
  grao: 'DIA',
  serie: [
    { inicio: '2026-04-14', produzido: 22610.49, servicos: 93, recebido: 0, programado: 0 },
    { inicio: '2026-04-20', produzido: 37189.63, servicos: 124, recebido: 74770, programado: 74770 },
  ],
  opsDestaque: [{
    id: 7, numero: '06389821', valorTotal: 74770, valorRecebido: 74770,
    periodoInicio: '2026-03-30', periodoFim: '2026-04-29',
    situacaoFinanceira: 'RECEBIDO', statusConciliacao: 'CONCILIADA',
    quantidadeOrdensServico: 275, divergencia: 0, vencida: false,
  }],
  ...extra,
})

function servidorDoPainel(dados: Record<string, unknown>) {
  servidor.use(
    http.post(`${SUPA}/rest/v1/rpc/porto_dashboard_alto_nivel`, () => HttpResponse.json(dados)),
    http.get(`${SUPA}/rest/v1/porto_ops_conciliadas`, () => HttpResponse.json([])),
  )
}

test('o dinheiro abre a tela, com a leitura do que ele significa', async () => {
  servidorDoPainel(painel())
  const Painel = await abrirPainel()

  render(<MemoryRouter><Painel/></MemoryRouter>)

  const financeiro = await screen.findByRole('region', { name: /resumo financeiro/i })
  // Recebido em destaque e realizado ao lado; toda OP chega paga, entao nao ha
  // "programado" separado para mostrar.
  expect(within(financeiro).getAllByText('R$ 74.770,00')).toHaveLength(2)
  expect(within(financeiro).getByText(/275 serviços executados/)).toBeInTheDocument()
  expect(within(financeiro).getByText(/100,0% da produção/)).toBeInTheDocument()
  expect(within(financeiro).queryByText(/programado/i)).not.toBeInTheDocument()
  expect(screen.getByText(/Ticket médio de R\$ 271,89 por serviço\./)).toBeInTheDocument()
})

// Zero divergencia e zero atraso sao boa noticia: a tela nao pode usar vermelho
// para dizer isso, nem abrir uma lista de problemas vazia.
test('sem pendência, mostra estado positivo em vez de lista de erros', async () => {
  servidorDoPainel(painel())
  const Painel = await abrirPainel()

  render(<MemoryRouter><Painel/></MemoryRouter>)

  expect(await screen.findByText('Tudo em dia')).toBeInTheDocument()
  expect(screen.getByText(/Nenhuma pendência crítica/)).toBeInTheDocument()
  expect(screen.queryByText(/pendentes na porto/i)).not.toBeInTheDocument()
  // No modelo em que a OP chega paga nao existe OP vencida — o indicador saiu.
  expect(screen.queryByText(/vencida/i)).not.toBeInTheDocument()
})

test('com divergência e serviços fora de OP, cada item leva para onde se resolve', async () => {
  servidorDoPainel(painel({
    quantidadeComDivergencia: 3, valorTotalDivergencias: 1250.5,
    quantidadeAguardandoOp: 12, valorAguardandoOp: 3800,
  }))
  const Painel = await abrirPainel()

  render(<MemoryRouter><Painel/></MemoryRouter>)

  expect(await screen.findByText('3 OPs com divergência')).toBeInTheDocument()
  // Aparece no topo, como contexto do "a receber", e na fila de atencao.
  expect(screen.getAllByText('12 serviços aguardando OP')).toHaveLength(2)
  expect(screen.getByRole('link', { name: /ver serviços/i }))
    .toHaveAttribute('href', '/porto/ordens-servico')
})

test('período sem dados não mostra três zeros, e oferece a saída', async () => {
  servidorDoPainel(painel({
    quantidadeTotalOps: 0, quantidadeTotalServicos: 0, valorTotalRealizado: 0,
    valorProgramado: 0, valorRecebido: 0, serie: [], opsDestaque: [],
  }))
  const Painel = await abrirPainel()

  render(<MemoryRouter><Painel/></MemoryRouter>)

  expect(await screen.findByText(/Nenhum dado da Porto neste período/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /importar relatório/i }))
    .toHaveAttribute('href', '/porto/importacoes')
  expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument()
})

test('trocar o agrupamento recarrega a série com o novo grão', async () => {
  let grao = ''
  servidor.use(
    http.post(`${SUPA}/rest/v1/rpc/porto_dashboard_alto_nivel`, async ({ request }) => {
      grao = ((await request.json()) as { p_grao: string }).p_grao
      return HttpResponse.json(painel())
    }),
    http.get(`${SUPA}/rest/v1/porto_ops_conciliadas`, () => HttpResponse.json([])),
  )
  const Painel = await abrirPainel()
  const user = userEvent.setup()

  render(<MemoryRouter><Painel/></MemoryRouter>)
  await screen.findByRole('region', { name: /resumo financeiro/i })

  await user.click(screen.getByRole('button', { name: 'Semanal' }))

  expect(grao).toBe('SEMANA')
})

// O painel do dia traz servico sem preco. Doze servicos somando zero nao e
// "nada a receber": e "ainda nao se sabe quanto".
test('serviço aguardando OP sem preço aparece como a precificar, não como R$ 0,00', async () => {
  servidorDoPainel(painel({ quantidadeAguardandoOp: 12, valorAguardandoOp: 0 }))
  const Painel = await abrirPainel()

  render(<MemoryRouter><Painel/></MemoryRouter>)

  const financeiro = await screen.findByRole('region', { name: /resumo financeiro/i })
  expect(within(financeiro).getByText('A precificar')).toBeInTheDocument()
  expect(screen.getByText(/12 serviços aguardam OP e ainda não têm preço/)).toBeInTheDocument()
})
