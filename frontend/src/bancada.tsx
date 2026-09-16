/**
 * Bancada visual — arquivo temporario, fora do app.
 *
 * Serve para ver a tela enquanto ela e ajustada: o painel exige login e dados
 * reais, e desenhar sem olhar foi exatamente o erro que esta bancada existe
 * para corrigir. Nenhuma logica do sistema passa por aqui; o que roda e a mesma
 * pagina do app, alimentada por respostas de exemplo.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import './styles.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/500.css'

const painel = {
  quantidadeTotalOps: 4, valorTotalPrevisto: 74770, quantidadeSemComposicao: 1,
  valorSemComposicao: 3200, quantidadeConciliadas: 2, valorConciliadas: 58900,
  quantidadeValorAbaixo: 1, diferencaTotalAbaixo: 820, quantidadeValorAcima: 0,
  diferencaTotalAcima: 0, quantidadeComDivergencia: 1, valorTotalDivergencias: 820,
  quantidadePagamentoProgramado: 4, valorProgramado: 92400,
  quantidadeRecebidas: 2, valorRecebido: 74770,
  quantidadeAguardandoRecebimento: 2, valorAguardandoRecebimento: 17630,
  quantidadeVencidasNaoRecebidas: 1, valorVencidoNaoRecebido: 5230,
  valorMedioPorOp: 18692, quantidadeOrdensServico: 275,
  quantidadeTotalServicos: 275, valorTotalRealizado: 74770,
  quantidadeAguardandoOp: 12, valorAguardandoOp: 3800,
  quantidadeServicosPagamentoProgramado: 263, valorServicosPagamentoProgramado: 70970,
  valorPrevistoAReceber: 92400, valorConciliado: 58900, valorEfetivamenteRecebido: 74770,
  quantidadeServicosPendentes: 3, valorServicosPendentes: 940,
  quantidadeServicosDevolvidos: 2,
  porEspecialidade: [], porSocorrista: [],
  grao: 'SEMANA',
  serie: [
    { inicio: '2026-03-30', produzido: 615, servicos: 3, recebido: 0, programado: 0 },
    { inicio: '2026-04-06', produzido: 0, servicos: 0, recebido: 0, programado: 0 },
    { inicio: '2026-04-13', produzido: 22610.49, servicos: 93, recebido: 18400, programado: 21000 },
    { inicio: '2026-04-20', produzido: 37189.63, servicos: 124, recebido: 31200, programado: 36000 },
    { inicio: '2026-04-27', produzido: 14354.88, servicos: 55, recebido: 25170, programado: 35400 },
  ],
  opsDestaque: [
    { id: 9, numero: '06422281', valorTotal: 22870, valorRecebido: null,
      periodoInicio: '2026-04-27', periodoFim: '2026-05-11', dataPagamentoProgramada: '2026-06-20',
      situacaoFinanceira: 'PROGRAMADO', statusConciliacao: 'VALOR_ABAIXO',
      quantidadeOrdensServico: 84, divergencia: 820, vencida: true },
    { id: 8, numero: '06401144', valorTotal: 3200, valorRecebido: null,
      periodoInicio: null, periodoFim: null, dataPagamentoProgramada: '2026-06-05',
      situacaoFinanceira: 'PROGRAMADO', statusConciliacao: 'SEM_COMPOSICAO',
      quantidadeOrdensServico: 0, divergencia: 3200, vencida: false },
    { id: 7, numero: '06389821', valorTotal: 74770, valorRecebido: 74770,
      periodoInicio: '2026-03-30', periodoFim: '2026-04-29', dataPagamentoProgramada: '2026-06-07',
      situacaoFinanceira: 'RECEBIDO', statusConciliacao: 'CONCILIADA',
      quantidadeOrdensServico: 275, divergencia: 0, vencida: false },
  ],
}

const ops = [
  { id: 7, numero: '06389821', valor_total: 74770, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-03-30', periodo_fim: '2026-04-29' },
  { id: 9, numero: '06422281', valor_total: 22870, situacao_financeira: 'PROGRAMADO',
    periodo_inicio: '2026-04-27', periodo_fim: '2026-05-11' },
]

/** Responde as chamadas do Supabase com o exemplo acima, sem rede. */
const original = window.fetch
window.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada : entrada.url)
  const responder = (corpo: unknown) =>
    new Response(JSON.stringify(corpo), { headers: { 'Content-Type': 'application/json' } })

  if (url.includes('porto_dashboard_alto_nivel')) return responder(painel)
  if (url.includes('dashboard_resumo')) return responder(visaoGeral)
  if (url.includes('porto_ops_conciliadas')) return responder(ops)
  if (url.includes('/rest/v1/') || url.includes('/auth/v1/')) return responder([])
  return original(entrada, init)
}) as typeof window.fetch

const visaoGeral = {
  financeiro: {
    receitaRecebida: 74770, receitaPrevista: 17630, totalAtrasado: 5230,
    despesasPagas: 31240.5, despesasPrevistas: 4200,
    saldoRealizado: 43529.5, saldoProjetado: 56959.5,
    registrosImportados: 275, quilometragemTotal: 9840, kmRemunerado: 7320,
    kmMorto: 2520, custoKmMorto: 4284, producaoPaga: 74770,
    comissaoSobreProducao: 14954, producaoPendente: 3800,
    servicosDoPeriodo: 275, servicosPendentes: 12, comissaoAPagar: 14166.28,
    resultadoPorVeiculo: [
      { veiculoId: 1, veiculo: 'L168', receitas: 24310, despesas: 8120, resultado: 16190, kmMorto: 640, custoKmMorto: 1088 },
      { veiculoId: 2, veiculo: 'L25', receitas: 21870, despesas: 9340, resultado: 12530, kmMorto: 820, custoKmMorto: 1394 },
      { veiculoId: 3, veiculo: 'L845', receitas: 19640, despesas: 7760, resultado: 11880, kmMorto: 610, custoKmMorto: 1037 },
      { veiculoId: 4, veiculo: 'K85', receitas: 8950, despesas: 6020, resultado: 2930, kmMorto: 450, custoKmMorto: 765 },
    ],
    resultadoPorSocorrista: [
      { motoristaId: 1, socorrista: 'ANDERSON JORGE RIBEIRO', servicos: 85, producao: 19864.11, comissao: 3972.82, despesas: 640, custoTotal: 4612.82 },
      { motoristaId: 2, socorrista: 'JEFERSON MARTINS DA SILVA', servicos: 49, producao: 23853.12, comissao: 4770.62, despesas: 380, custoTotal: 5150.62 },
      { motoristaId: 3, socorrista: 'QEBSON RAMOS DA SILVA', servicos: 75, producao: 18787.95, comissao: 3757.59, despesas: 520, custoTotal: 4277.59 },
      { motoristaId: 4, socorrista: 'NATANAEL JOSE DE FREITAS NETO', servicos: 50, producao: 8326.2, comissao: 1665.24, despesas: 290, custoTotal: 1955.24 },
    ],
    despesasPorCategoria: [
      { categoriaId: 1, categoria: 'Combustível', valor: 14200, participacao: 45.5 },
      { categoriaId: 2, categoria: 'Manutenção', valor: 8320.5, participacao: 26.6 },
      { categoriaId: 3, categoria: 'Alimentação', valor: 4870, participacao: 15.6 },
      { categoriaId: 4, categoria: 'Pedágio', valor: 3850, participacao: 12.3 },
    ],
    despesasAcumuladasPorDia: [
      { data: '2026-04-03', valorDia: 4200, acumulado: 4200 },
      { data: '2026-04-09', valorDia: 6100, acumulado: 10300 },
      { data: '2026-04-15', valorDia: 8600, acumulado: 18900 },
      { data: '2026-04-22', valorDia: 7240.5, acumulado: 26140.5 },
      { data: '2026-04-28', valorDia: 5100, acumulado: 31240.5 },
    ],
  },
  porto: { quantidadeTotalOps: 4, valorTotalPrevisto: 92400, valorProgramado: 17630, valorRecebido: 74770 },
}

const daVisao = new URLSearchParams(location.search).get('tela') === 'visao'

const Pagina = daVisao
  ? (await import('./DashboardPage')).default
  : (await import('./porto/PortoDashboardPage')).default

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter>
      <main className="content">
        <Pagina/>
      </main>
    </MemoryRouter>
  </StrictMode>,
)
