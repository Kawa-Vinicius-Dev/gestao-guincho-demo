import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'
import { rpcPeriodos } from '../test/periodos'

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
  // Formato real da RPC: a OP vem da view, com o nome das colunas.
  opsDestaque: [{
    id: 1, numero: '06389821', valor_total: 74770, valor_recebido: 74770,
    periodo_inicio: '2026-03-30', periodo_fim: '2026-04-29',
    data_pagamento_programada: '2026-06-07', data_recebimento: '2026-06-07',
    situacao_financeira: 'RECEBIDO', status_conciliacao: 'CONCILIADA',
    quantidade_ordens_servico: 275, divergencia: 0, vencida: false,
    prioridade: 4, referencia: '2026-04-29',
  }],
  faturamentoPorSocorrista: [
    { chave: '1', rotulo: 'JEFERSON MARTINS DA SILVA', valor: 23853.12, quantidade: 49, semVinculo: false },
    { chave: '9', rotulo: 'ANDERSON JORGE RIBEIRO', valor: 19864.11, quantidade: 85, semVinculo: false },
    { chave: '2', rotulo: 'QEBSON RAMOS DA SILVA', valor: 18787.95, quantidade: 75, semVinculo: false },
    { chave: '4', rotulo: 'NATANAEL JOSE DE FREITAS NETO', valor: 8326.2, quantidade: 50, semVinculo: false },
    { chave: 'sem', rotulo: 'Sem socorrista', valor: 3938.62, quantidade: 16, semVinculo: true },
  ],
  faturamentoPorViatura: [
    { chave: 'sem', rotulo: 'Sem viatura', valor: 74770, quantidade: 275, semVinculo: true },
  ],
  pendenciasVinculo: { quantidade: 275, semSocorrista: 16, semViatura: 275 },
  ...extra,
})

function servidorDoPainel(dados: Record<string, unknown>) {
  servidor.use(
    http.post(`${SUPA}/rest/v1/rpc/porto_dashboard_alto_nivel`, () => HttpResponse.json(dados)),
    rpcPeriodos(SUPA, []),
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
  expect(within(financeiro).getByText(/Ticket médio R\$\s271,89/)).toBeInTheDocument()
})

test('a barra de indicadores mostra serviços, espera por OP e divergência', async () => {
  servidorDoPainel(painel())
  const Painel = await abrirPainel()

  render(<MemoryRouter><Painel/></MemoryRouter>)

  expect(await screen.findByText('Serviços realizados')).toBeInTheDocument()
  expect(screen.getByText(/^R\$\s74\.770,00 no período$/)).toBeInTheDocument()
  expect(screen.getByText('Aguardando OP')).toBeInTheDocument()
  expect(screen.getByText('Nenhum serviço fora de OP')).toBeInTheDocument()
  expect(screen.getByText('OPs com divergência')).toBeInTheDocument()
  expect(screen.getByText('Composição confere')).toBeInTheDocument()
})

// O painel do dia chega sem valor: doze servicos esperando OP nao sao
// "R$ 0,00 sem cobranca", sao servicos cujo preco so vem com a OP.
test('serviço do painel diário aguardando OP não vira R$ 0,00', async () => {
  servidorDoPainel(painel({ quantidadeAguardandoOp: 12, valorAguardandoOp: 0 }))
  const Painel = await abrirPainel()

  render(<MemoryRouter><Painel/></MemoryRouter>)

  expect(await screen.findByText('Sem valor até a OP')).toBeInTheDocument()
  expect(screen.queryByText(/R\$\s0,00/)).not.toBeInTheDocument()
})

// "A receber" nao existe no modelo em que a OP chega paga. O que falta na OS e
// dono: socorrista ou viatura — e o topo leva direto para onde se resolve.
test('OS sem socorrista ou viatura aparece no topo e leva às pendências', async () => {
  servidorDoPainel(painel())
  const Painel = await abrirPainel()

  render(<MemoryRouter><Painel/></MemoryRouter>)

  const financeiro = await screen.findByRole('region', { name: /resumo financeiro/i })
  expect(within(financeiro).getByText('Sem socorrista ou viatura')).toBeInTheDocument()
  expect(within(financeiro).getByText('275 OS')).toBeInTheDocument()
  expect(within(financeiro).getByText('16 sem socorrista · 275 sem viatura')).toBeInTheDocument()
  expect(within(financeiro).getByRole('link', { name: /resolver pendências/i }))
    .toHaveAttribute('href', '/porto/pendencias')
  expect(within(financeiro).queryByText(/a receber/i)).not.toBeInTheDocument()
})

test('toda OS com socorrista e viatura: o topo não mostra pendência', async () => {
  servidorDoPainel(painel({ pendenciasVinculo: { quantidade: 0, semSocorrista: 0, semViatura: 0 } }))
  const Painel = await abrirPainel()

  render(<MemoryRouter><Painel/></MemoryRouter>)

  await screen.findByRole('region', { name: /resumo financeiro/i })
  expect(screen.queryByText('Sem socorrista ou viatura')).not.toBeInTheDocument()
})

// O faturamento por socorrista e por viatura foi para a Visao geral (Kawa,
// 23/09/2026: "se deixar os dois, duvide muito o valor"). Aqui nao se repete.
test('a aba Gráficos não repete o faturamento da Visão geral', async () => {
  servidorDoPainel(painel())
  const Painel = await abrirPainel()

  render(<MemoryRouter><Painel/></MemoryRouter>)

  expect(await screen.findByRole('heading', { name: 'Gráficos' })).toBeInTheDocument()
  expect(screen.queryByRole('list', { name: /faturamento por socorrista/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('list', { name: /faturamento por viatura/i })).not.toBeInTheDocument()
})

// A RPC devolve a OP com o nome das colunas. A tabela lia valorTotal e
// periodoFim direto e, em producao, saia sem valor, sem periodo e sem status.
test('a tabela de OPs lê o formato que a RPC devolve', async () => {
  servidorDoPainel(painel())
  const Painel = await abrirPainel()

  render(<MemoryRouter><Painel/></MemoryRouter>)

  const linha = (await screen.findByText('06389821')).closest('tr')!
  expect(linha).toHaveTextContent('30/03/2026 a 29/04/2026')
  expect(linha).toHaveTextContent('275')
  expect(linha).toHaveTextContent(/R\$\s74\.770,00/)
  expect(within(linha).getByText('Conciliada')).toBeInTheDocument()
})

// Sem divergencia nao ha o que resolver: o bloco de atencao nao aparece, e nada
// entra no lugar dele — a barra ja diz "Composicao confere".
test('sem divergência, não mostra bloco de atenção nem faixa no lugar', async () => {
  servidorDoPainel(painel())
  const Painel = await abrirPainel()

  render(<MemoryRouter><Painel/></MemoryRouter>)

  expect(await screen.findByText('Composição confere')).toBeInTheDocument()
  expect(screen.queryByText('Precisa de atenção')).not.toBeInTheDocument()
  expect(screen.queryByText('Tudo em dia')).not.toBeInTheDocument()
  expect(screen.queryByText(/pendentes na porto/i)).not.toBeInTheDocument()
  // No modelo em que a OP chega paga nao existe OP vencida — o indicador saiu.
  expect(screen.queryByText(/vencida/i)).not.toBeInTheDocument()
})

test('divergência pede providência e leva para as ordens de pagamento', async () => {
  servidorDoPainel(painel({ quantidadeComDivergencia: 3, valorTotalDivergencias: 1250.5 }))
  const Painel = await abrirPainel()

  render(<MemoryRouter><Painel/></MemoryRouter>)

  expect(await screen.findByText('3 OPs com divergência')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /ver ordens de pagamento/i }))
    .toHaveAttribute('href', '/porto/ordens-pagamento')
})

test('período sem dados não mostra três zeros, e oferece a saída', async () => {
  servidorDoPainel(painel({
    quantidadeTotalOps: 0, quantidadeTotalServicos: 0, valorTotalRealizado: 0,
    valorProgramado: 0, valorRecebido: 0, serie: [], opsDestaque: [],
    faturamentoPorSocorrista: [], faturamentoPorViatura: [],
    pendenciasVinculo: { quantidade: 0, semSocorrista: 0, semViatura: 0 },
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
    rpcPeriodos(SUPA, []),
  )
  const Painel = await abrirPainel()
  const user = userEvent.setup({ delay: null })

  render(<MemoryRouter><Painel/></MemoryRouter>)
  await screen.findByRole('region', { name: /resumo financeiro/i })

  await user.click(screen.getByRole('button', { name: 'Semanal' }))

  expect(grao).toBe('SEMANA')
})

// Escolher a OP e voltar para o mes corrente ao sair da tela era o
// comportamento antigo: o estado nascia do zero a cada montagem, entao quem
// consultava uma OS e voltava reescolhia a OP toda vez.
test('a OP escolhida continua escolhida ao voltar para a tela', async () => {
  servidorDoPainel(painel())
  servidor.use(rpcPeriodos(SUPA, [{
    id: 7, numero: '06389821',
    periodo_inicio: '2026-03-30', periodo_fim: '2026-04-29',
    data_pagamento_programada: '2026-05-10',
  }]))
  const Painel = await abrirPainel()

  const primeira = render(<MemoryRouter><Painel/></MemoryRouter>)
  const periodo = await screen.findByLabelText('Período')
  await userEvent.selectOptions(periodo, '7')
  expect(await screen.findByDisplayValue('2026-03-30')).toBeInTheDocument()
  primeira.unmount()

  render(<MemoryRouter><Painel/></MemoryRouter>)

  expect(await screen.findByDisplayValue('2026-03-30')).toBeInTheDocument()
  expect(screen.getByDisplayValue('2026-04-29')).toBeInTheDocument()
  expect(await screen.findByLabelText('Período')).toHaveValue('7')
})

// A conciliacao com a OP e o que o painel nao mostrava: servico feito sem valor,
// valor informado a mao, OS que ficou para a proxima OP e valor divergente.
test('cards de conciliação contam, somam e abrem a lista filtrada', async () => {
  servidorDoPainel(painel({
    conciliacao: {
      semValor: 12, comValorManual: 3, valorManual: 540,
      aguardandoProximaOp: 5, valorAguardandoProximaOp: 900,
      divergentes: 2, valorDivergencia: 31, valorPrevisto: 76210,
    },
  }))
  const Painel = await abrirPainel()

  render(<MemoryRouter><Painel/></MemoryRouter>)

  expect(await screen.findByText('Serviços sem valor')).toBeInTheDocument()
  expect(screen.getByText('Aguardando a análise da Porto')).toBeInTheDocument()
  expect(screen.getByText(/R\$\s540,00 previstos, sem comissão/)).toBeInTheDocument()
  expect(screen.getByText(/R\$\s900,00 projetados desta competência/)).toBeInTheDocument()
  expect(screen.getByText(/R\$\s31,00 entre o informado e a OP/)).toBeInTheDocument()

  // O card leva para a lista daquela situação, olhando pela competência.
  const semValor = screen.getByText('Serviços sem valor').closest('a')
  expect(semValor).toHaveAttribute('href', '/porto/ordens-servico?situacao=AGUARDANDO_ANALISE&competencia=1')
  expect(screen.getByText('Valor divergente').closest('a'))
    .toHaveAttribute('href', '/porto/ordens-servico?situacao=DIVERGENTE&competencia=1')
})
