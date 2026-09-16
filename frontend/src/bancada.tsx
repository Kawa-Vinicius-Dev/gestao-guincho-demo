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

// Resposta real de porto_dashboard_alto_nivel('2026-03-30', '2026-04-29', 'SEMANA'),
// copiada do banco em 16/09/2026 (sem porEspecialidade/porSocorrista, que a tela
// nao le). Exemplo inventado ja escondeu um indicador impossivel e uma tabela
// quebrada; a bancada so mostra o que o sistema produz.
const painel = {
  grao: 'SEMANA',
  serie: [
    { inicio: '2026-03-30', recebido: 0, servicos: 3, produzido: 615, programado: 0 },
    { inicio: '2026-04-06', recebido: 0, servicos: 0, produzido: 0, programado: 0 },
    { inicio: '2026-04-13', recebido: 0, servicos: 93, produzido: 22610.49, programado: 0 },
    { inicio: '2026-04-20', recebido: 0, servicos: 124, produzido: 37189.63, programado: 0 },
    { inicio: '2026-04-27', recebido: 74770, servicos: 55, produzido: 14354.88, programado: 74770 },
  ],
  periodoInicio: '2026-03-30', periodoFim: '2026-04-29',
  opsDestaque: [{
    id: 1, numero: '06389821', vencida: false, prioridade: 4, referencia: '2026-04-29',
    divergencia: 0, periodo_fim: '2026-04-29', valor_total: 74770, periodo_inicio: '2026-03-30',
    valor_recebido: 74770, data_recebimento: '2026-06-07', status_conciliacao: 'CONCILIADA',
    situacao_financeira: 'RECEBIDO', data_pagamento_programada: '2026-06-07',
    quantidade_ordens_servico: 275,
  }],
  valorRecebido: 74770, valorConciliado: 74770, valorMedioPorOp: 74770, valorProgramado: 74770,
  valorConciliadas: 74770,
  pendenciasVinculo: { quantidade: 275, semViatura: 275, semSocorrista: 16 },
  valorAguardandoOp: 0, quantidadeTotalOps: 1, valorSemComposicao: 0, valorTotalPrevisto: 74770,
  diferencaTotalAcima: 0, quantidadeRecebidas: 1, valorTotalRealizado: 74770,
  diferencaTotalAbaixo: 0, quantidadeValorAcima: 0,
  faturamentoPorViatura: [
    { chave: 'sem', valor: 74770, rotulo: 'Sem viatura', quantidade: 275, semVinculo: true },
  ],
  quantidadeConciliadas: 1, quantidadeValorAbaixo: 0, valorPrevistoAReceber: 74770,
  quantidadeAguardandoOp: 0, valorServicosPendentes: 0, valorTotalDivergencias: 0,
  quantidadeOrdensServico: 275, quantidadeSemComposicao: 0, quantidadeTotalServicos: 275,
  valorVencidoNaoRecebido: 0,
  faturamentoPorSocorrista: [
    { chave: '1', valor: 23853.12, rotulo: 'JEFERSON MARTINS DA SILVA', quantidade: 49, semVinculo: false },
    { chave: '9', valor: 19864.11, rotulo: 'ANDERSON JORGE RIBEIRO', quantidade: 85, semVinculo: false },
    { chave: '2', valor: 18787.95, rotulo: 'QEBSON RAMOS DA SILVA', quantidade: 75, semVinculo: false },
    { chave: '4', valor: 8326.2, rotulo: 'NATANAEL JOSE DE FREITAS NETO', quantidade: 50, semVinculo: false },
    { chave: 'sem', valor: 3938.62, rotulo: 'Sem socorrista', quantidade: 16, semVinculo: true },
  ],
  quantidadeComDivergencia: 0, valorEfetivamenteRecebido: 74770, valorAguardandoRecebimento: 0,
  quantidadeServicosPendentes: 0, quantidadeServicosDevolvidos: 0,
  quantidadePagamentoProgramado: 1, quantidadeVencidasNaoRecebidas: 0,
  quantidadeAguardandoRecebimento: 0, valorServicosPagamentoProgramado: 0,
  quantidadeServicosPagamentoProgramado: 0,
}

// A unica OP que existe no banco.
const ops = [
  { id: 1, numero: '06389821', valor_total: 74770, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-03-30', periodo_fim: '2026-04-29' },
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

// Resposta real de dashboard_resumo('2026-04-01', '2026-04-30'), copiada do banco
// em 16/09/2026: ainda nao ha despesa, km nem viatura nas OS.
// Resposta real de dashboard_resumo('2026-03-30', '2026-04-29'), copiada do banco
// em 16/09/2026, ja com a comissao automatica e a alimentacao lancada.
const visaoGeral = {
  porto: { valorRecebido: 74770, valorProgramado: 74770, quantidadeTotalOps: 1, valorTotalPrevisto: 74770 },
  financeiro: {
    kmMorto: 0, custoKmMorto: 0, kmRemunerado: 0, producaoPaga: 74770, despesasPagas: 14366.27,
    totalAtrasado: 0, comissaoAPagar: 0, saldoProjetado: 60403.73, saldoRealizado: 60403.73,
    receitaPrevista: 0, receitaRecebida: 74770, producaoPendente: 0, despesasPrevistas: 0,
    servicosDoPeriodo: 275, servicosPendentes: 0, quilometragemTotal: 0, registrosImportados: 275,
    resultadoPorVeiculo: [
      { kmMorto: 0, veiculo: 'L168', despesas: 200, receitas: 0, resultado: -200, veiculoId: 2, custoKmMorto: 0 },
    ],
    despesasPorCategoria: [
      { valor: 14166.27, categoria: 'Comissão de socorrista', categoriaId: 5, participacao: 98.61 },
      { valor: 200, categoria: 'Alimentação', categoriaId: 4, participacao: 1.39 },
    ],
    comissaoSobreProducao: 14954,
    resultadoPorSocorrista: [
      { comissao: 3972.82, despesas: 0, producao: 19864.11, servicos: 85, custoTotal: 3972.82, socorrista: 'ANDERSON JORGE RIBEIRO', motoristaId: 9 },
      { comissao: 4770.62, despesas: 0, producao: 23853.12, servicos: 49, custoTotal: 4770.62, socorrista: 'JEFERSON MARTINS DA SILVA', motoristaId: 1 },
      { comissao: 1665.24, despesas: 0, producao: 8326.2, servicos: 50, custoTotal: 1665.24, socorrista: 'NATANAEL JOSE DE FREITAS NETO', motoristaId: 4 },
      { comissao: 3757.59, despesas: 0, producao: 18787.95, servicos: 75, custoTotal: 3757.59, socorrista: 'QEBSON RAMOS DA SILVA', motoristaId: 2 },
    ],
    despesasAcumuladasPorDia: [
      { data: '2026-04-26', valorDia: 200, acumulado: 200, origens: [{ categoria: 'Alimentação', valor: 200 }] },
      { data: '2026-04-29', valorDia: 14166.27, acumulado: 14366.27, origens: [{ categoria: 'Comissão de socorrista', valor: 14166.27 }] },
    ],
  },
}

const daVisao = new URLSearchParams(location.search).get('tela') === 'visao'
// A Visao geral abre no periodo da OP real, para os graficos terem o que mostrar.
if (daVisao) sessionStorage.setItem('filtro:visao-geral', JSON.stringify({ inicio: '2026-03-30', fim: '2026-04-29', op: '1' }))

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
