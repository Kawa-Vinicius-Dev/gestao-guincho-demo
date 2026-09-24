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
import { AuthProvider } from './auth/AuthContext'
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

// As 16 OPs do banco, copiadas em 17/09/2026 com o periodo que cada uma tem:
// a quinzena da Porto nas quatro que ja a tem informada, e da primeira a
// ultima OS nas demais. E com elas que o seletor de periodo mostra
// se as quinzenas se encaixam.
const ops = [
  { id: 19, numero: '06389821', valor_total: 74770.0, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-03-30', periodo_fim: '2026-04-29' },
  { id: 18, numero: '06400330', valor_total: 64394.23, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-04-29', periodo_fim: '2026-05-28' },
  { id: 17, numero: '06405579', valor_total: 76878.82, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-05-21', periodo_fim: '2026-06-15' },
  { id: 16, numero: '06405580', valor_total: 18767.56, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-05-13', periodo_fim: '2026-06-15' },
  { id: 14, numero: '06411002', valor_total: 18995.0, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-06-15', periodo_fim: '2026-06-29' },
  { id: 15, numero: '06411001', valor_total: 61366.0, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-06-15', periodo_fim: '2026-06-30' },
  { id: 13, numero: '06416626', valor_total: 54800.2, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-06-23', periodo_fim: '2026-07-14' },
  { id: 12, numero: '06416627', valor_total: 11489.4, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-06-29', periodo_fim: '2026-07-14' },
  { id: 9, numero: '06422282', valor_total: 12987.8, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-07-15', periodo_fim: '2026-07-29' },
  { id: 11, numero: '06422281', valor_total: 57699.7, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-07-01', periodo_fim: '2026-07-30' },
  { id: 7, numero: '06427803', valor_total: 16866.44, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-08-01', periodo_fim: '2026-08-14' },
  { id: 8, numero: '06427802', valor_total: 59246.5, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-06-19', periodo_fim: '2026-08-13' },
  { id: 6, numero: '06433184', valor_total: 49082.71, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-08-12', periodo_fim: '2026-08-26' },
  { id: 5, numero: '06433185', valor_total: 11521.22, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-08-15', periodo_fim: '2026-08-28' },
  { id: 4, numero: '06438808', valor_total: 21168.96, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-09-01', periodo_fim: '2026-09-16' },
  { id: 10, numero: '06438807', valor_total: 78696.67, situacao_financeira: 'RECEBIDO',
    periodo_inicio: '2026-09-01', periodo_fim: '2026-09-16' },
]


// Turno do socorrista e fila de aprovacoes: a tabela nasceu vazia, entao aqui o
// exemplo e montado a mao, no formato exato que as RPCs devolvem.
const turnoDoDia = {
  socorrista: { id: 1, nome: 'JEFERSON MARTINS DA SILVA', qra: 'JM-12' },
  hoje: '2026-09-17',
  turnoAberto: null,
  turnosDevolvidos: [],
  ultimosTurnos: [
    { id: 3, data: '2026-09-16', veiculo: 'L168', situacao: 'APROVADO', kmRodado: 182 },
    { id: 2, data: '2026-09-15', veiculo: 'L168', situacao: 'AGUARDANDO_APROVACAO', kmRodado: 147 },
    { id: 1, data: '2026-09-12', veiculo: 'L204', situacao: 'DEVOLVIDO', kmRodado: 96 },
  ],
  viaturas: [
    { id: 2, identificacao: 'L168', ultimoHodometro: 148320 },
    { id: 3, identificacao: 'L204', ultimoHodometro: 92750 },
  ],
  veiculoSugerido: 2,
}

const filaAprovacoes = {
  itens: [
    { tipo: 'TURNO', id: 2, data: '2026-09-16', socorristaId: 1,
      socorrista: 'JEFERSON MARTINS DA SILVA', qra: 'JM-12', veiculoId: 2, veiculo: 'L168',
      hodometroInicial: 148138, hodometroFinal: 148320, kmRodado: 182, custoPorKm: 1.85,
      fotoAbertura: null, fotoFechamento: 'turnos/2/fechamento-1.jpg',
      observacoes: 'Rodei ate Itapecerica no fim do turno.', osNoDia: 7 },
    { tipo: 'TURNO', id: 4, data: '2026-09-16', socorristaId: 4,
      socorrista: 'NATANAEL JOSE DE FREITAS NETO', qra: 'NT-08', veiculoId: 3, veiculo: 'L204',
      hodometroInicial: 92604, hodometroFinal: 92750, kmRodado: 146, custoPorKm: 1.62,
      fotoAbertura: null, fotoFechamento: 'turnos/4/fechamento-1.jpg', osNoDia: 4 },
    { tipo: 'DESPESA', id: 51, data: '2026-09-16', socorristaId: 1,
      socorrista: 'JEFERSON MARTINS DA SILVA', qra: 'JM-12', descricao: 'Almoco em servico',
      valor: 38.5, categoria: 'Alimentação', veiculo: 'L168',
      comprovante: 'despesas/51/nota.jpg', descontaDaComissao: true },
  ],
  turnosNaoFechados: [
    { id: 5, data: '2026-09-15', socorristaId: 2, socorrista: 'QEBSON RAMOS DA SILVA',
      veiculo: 'L311', hodometroInicial: 71220, diasEmAberto: 2 },
  ],
}


// Pendencias do periodo. As quatro primeiras sao linhas reais de
// porto_pendencias_os('2026-08-27','2026-09-15'), copiadas do banco em
// 17/09/2026; as duas ultimas sao as situacoes novas, que o banco ainda nao tem
// porque nenhum Diario foi importado — sem elas nao da para ver o que mudou.
const pendencias = [
  { id: 704, numeroOs: '01/5364383-26', dataAtendimento: '2026-08-27', seguradora: null,
    especialidade: 'GUINCHO', siglaViatura: null, socorrista: 'ANDERSON JORGE RIBEIRO',
    motoristaId: 9, valorTotal: 181, numeroOp: '06438807', semValor: false,
    semSocorrista: false, semViatura: true, situacao: 'CONCILIADA',
    competenciaInicio: '2026-08-27', competenciaFim: '2026-09-15', apenasConferir: false },
  { id: 705, numeroOs: '01/5364512-26', dataAtendimento: '2026-08-28', seguradora: null,
    especialidade: 'GUINCHO', siglaViatura: null, socorrista: 'QEBSON RAMOS DA SILVA',
    motoristaId: 2, valorTotal: 226.4, numeroOp: '06438807', semValor: false,
    semSocorrista: false, semViatura: true, situacao: 'CONCILIADA',
    competenciaInicio: '2026-08-27', competenciaFim: '2026-09-15', apenasConferir: false },
  { id: 706, numeroOs: '01/5365001-26', dataAtendimento: '2026-08-29', seguradora: null,
    especialidade: 'PANE SECA', siglaViatura: null, socorrista: null,
    motoristaId: null, valorTotal: 0, numeroOp: null, semValor: true,
    semSocorrista: true, semViatura: true, situacao: 'AGUARDANDO_ANALISE',
    competenciaInicio: '2026-08-27', competenciaFim: '2026-09-15', apenasConferir: false },
  { id: 707, numeroOs: '01/5365220-26', dataAtendimento: '2026-09-02', seguradora: null,
    especialidade: 'GUINCHO', siglaViatura: null, socorrista: 'LUIZ FELIPE DA SILVA',
    motoristaId: 6, valorTotal: 150, numeroOp: null, semValor: false,
    semSocorrista: false, semViatura: true, situacao: 'VALOR_MANUAL', valorManual: 150,
    competenciaInicio: '2026-08-27', competenciaFim: '2026-09-15', apenasConferir: false },
  { id: 708, numeroOs: '01/5365780-26', dataAtendimento: '2026-09-04', seguradora: null,
    especialidade: 'GUINCHO', siglaViatura: 'L168', socorrista: 'DJALMA BEZERRA DE MELO NETO',
    motoristaId: 8, valorTotal: 240, numeroOp: null, semValor: false,
    semSocorrista: false, semViatura: false, situacao: 'AGUARDANDO_PROXIMA_OP',
    valorManual: 240, competenciaInicio: '2026-09-16', competenciaFim: '2026-09-30',
    apenasConferir: true },
  { id: 709, numeroOs: '01/5366002-26', dataAtendimento: '2026-09-05', seguradora: null,
    especialidade: 'GUINCHO', siglaViatura: 'L204', socorrista: 'JEFERSON MARTINS DA SILVA',
    motoristaId: 1, valorTotal: 310, numeroOp: '06438807', semValor: false,
    semSocorrista: false, semViatura: false, situacao: 'DIVERGENTE', valorManual: 280,
    divergencia: 30, competenciaInicio: '2026-08-27', competenciaFim: '2026-09-15',
    apenasConferir: true },
]

// Meus servicos: resposta de `comissao_das_ops` para o socorrista. A tela nova
// so le `servicos` — nenhum valor em dinheiro aparece para ele.
const comissao = {
  ordemPagamentoId: 19, numeroOp: '06389821', periodo: '30/03 a 29/04',
  periodoInicio: '2026-03-30', periodoFim: '2026-04-29',
  socorrista: 'JEFERSON MARTINS DA SILVA', motoristaId: 1,
  quantidadeServicosPagos: 8, producaoPaga: 0, percentualComissao: 20,
  comissaoBruta: 0, descontos: 0, descontosPendentes: 0, liquido: 0, aguardandoOp: false,
  servicos: Array.from({ length: 8 }, (_, i) => ({
    id: 300 + i, numeroOs: `01/536${4383 + i * 29}-26`,
    dataAtendimento: `2026-04-${String(2 + i * 3).padStart(2, '0')}`,
    especialidade: i % 3 === 1 ? 'PANE SECA' : i % 3 === 2 ? 'REMOCAO' : 'GUINCHO',
    numeroOp: '06389821', valorServico: 0, comissaoServico: 0,
  })),
  gastos: [],
}

const listaDeOs = {
  total: 362,
  semViatura: 0,
  valorTotal: 0,
  valorPrevisto: 0,
  semValor: 362,
  divergentes: 0,
  comissaoTotal: 0,
  itens: [
    { id: 1, numero: '5729988/26', dataAtendimento: '2026-09-16', competenciaInicio: '2026-09-17', competenciaFim: '2026-09-30', especialidade: 'SOCORRO', motorista: 'ANDERSON JORGE RIBEIRO', motoristaId: 9, viatura: 'L845', numeroOp: null, situacao: 'AGUARDANDO_PROXIMA_OP', valorTotal: 0 },
    { id: 2, numero: '5730590/26', dataAtendimento: '2026-09-16', competenciaInicio: '2026-09-17', competenciaFim: '2026-09-30', especialidade: 'SOCORRO', motorista: 'QEBSON RAMOS DA SILVA', motoristaId: 2, viatura: 'L25', numeroOp: null, situacao: 'AGUARDANDO_PROXIMA_OP', valorTotal: 0 },
    { id: 3, numero: '5730927/26', dataAtendimento: '2026-09-16', competenciaInicio: '2026-09-17', competenciaFim: '2026-09-30', especialidade: 'TRANSPORTE', motorista: 'DJALMA BEZERRA DE MELO NETO', motoristaId: 8, viatura: 'K85', numeroOp: null, situacao: 'AGUARDANDO_PROXIMA_OP', valorTotal: 0 },
    { id: 4, numero: '5736472/26', dataAtendimento: '2026-09-16', competenciaInicio: '2026-09-17', competenciaFim: '2026-09-30', especialidade: 'SOCORRO', motorista: 'QEBSON RAMOS DA SILVA', motoristaId: 2, viatura: 'L25', numeroOp: null, situacao: 'AGUARDANDO_PROXIMA_OP', valorTotal: 0 },
    { id: 5, numero: '5737971/26', dataAtendimento: '2026-09-16', competenciaInicio: '2026-09-17', competenciaFim: '2026-09-30', especialidade: 'SOCORRO', motorista: 'ANDERSON JORGE RIBEIRO', motoristaId: 9, viatura: 'L845', numeroOp: null, situacao: 'AGUARDANDO_PROXIMA_OP', valorTotal: 0 },
    { id: 6, numero: '5739218/26', dataAtendimento: '2026-09-16', competenciaInicio: '2026-09-17', competenciaFim: '2026-09-30', especialidade: 'SOCORRO', motorista: 'DJALMA BEZERRA DE MELO NETO', motoristaId: 8, viatura: 'K85', numeroOp: null, situacao: 'AGUARDANDO_PROXIMA_OP', valorTotal: 0 },
    { id: 7, numero: '5742931/26', dataAtendimento: '2026-09-16', competenciaInicio: '2026-09-17', competenciaFim: '2026-09-30', especialidade: 'SOCORRO', motorista: 'EDUARDO MARTINS DA SILVA', motoristaId: 10, viatura: 'L168', numeroOp: null, situacao: 'AGUARDANDO_PROXIMA_OP', valorTotal: 0 },
  ],
}

// Extrato do periodo da OP 06389821, montado com os numeros reais que ja estao
// nesta bancada (visaoGeral, abaixo): 74.770 recebidos, a alimentacao de 26/04
// e a comissao de 29/04 aberta pelos quatro socorristas. Descricao e categoria
// da receita sao aproximadas. A despesa pendente e a unica linha inventada:
// existe para ver na tela como a despesa vencida aparece.
const linhaExtrato = (id: string, tipo: 'RECEITA' | 'DESPESA', descricao: string, categoria: string,
  valor: number, data: string, realizado: boolean, origem: string, extra: Record<string, unknown> = {}) => ({
  id, tipo, referencia_id: Number(id.slice(1)), descricao, categoria, valor, data,
  status: realizado ? (tipo === 'RECEITA' ? 'RECEBIDA' : 'PAGO') : 'PENDENTE', realizado,
  veiculo: null, veiculo_id: null, motorista: null, origem, protocolo: null,
  motorista_id: null, numero_op: null, ...extra,
})
const comissaoDe = (id: string, nome: string, motoristaId: number, valor: number) =>
  linhaExtrato(id, 'DESPESA', `${nome.split(' ')[0]} — comissão da OP 06389821`, 'Comissão de socorrista',
    valor, '2026-04-29', true, 'COMISSAO',
    { motorista: nome, motorista_id: motoristaId, numero_op: '06389821', protocolo: `COMISSAO-OP-19-${motoristaId}` })
const extrato = [
  linhaExtrato('R1', 'RECEITA', 'OP 06389821', 'Serviços Porto', 74770, '2026-04-29', true, 'IMPORTADA'),
  comissaoDe('D1', 'JEFERSON MARTINS DA SILVA', 1, 4770.62),
  comissaoDe('D2', 'ANDERSON JORGE RIBEIRO', 9, 3972.82),
  comissaoDe('D3', 'QEBSON RAMOS DA SILVA', 2, 3757.59),
  comissaoDe('D4', 'NATANAEL JOSE DE FREITAS NETO', 4, 1665.24),
  linhaExtrato('D5', 'DESPESA', 'Alimentação', 'Alimentação', 200, '2026-04-26', true, 'MANUAL',
    { veiculo: 'L168', veiculo_id: 2 }),
  linhaExtrato('D6', 'DESPESA', 'Exemplo: conta em aberto', 'Aluguel', 1500, '2026-04-27', false, 'MANUAL'),
]

// Resumo da tela de OPs somado das OPs acima. A copia do banco nao trouxe a
// conciliacao (OS vinculadas, soma das OS), entao essas colunas saem zeradas.
const resumoOps = {
  quantidadeTotalOps: 0, valorTotalPrevisto: 0, quantidadeSemComposicao: 0, valorSemComposicao: 0,
  quantidadeConciliadas: 0, valorConciliadas: 0, quantidadeValorAbaixo: 0, diferencaTotalAbaixo: 0,
  quantidadeValorAcima: 0, diferencaTotalAcima: 0, quantidadeComDivergencia: 0, valorTotalDivergencias: 0,
  quantidadePagamentoProgramado: 0, valorProgramado: 0, quantidadeRecebidas: 0, valorRecebido: 0,
  quantidadeAguardandoRecebimento: 0, valorAguardandoRecebimento: 0, quantidadeVencidasNaoRecebidas: 0,
  valorVencidoNaoRecebido: 0, valorMedioPorOp: 0, quantidadeOrdensServico: 0,
}

/**
 * Desempenho mes a mes: tres meses de OS de exemplo (julho a setembro) nas cinco
 * viaturas, com quantidades diferentes por mes, para o grafico e a tabela terem o
 * que mostrar. So a tela de Desempenho usa.
 */
const osDeTresMeses = (() => {
  const viaturas: [string, string, number][] = [['K85', 'DJALMA BEZERRA DE MELO NETO', 8], ['L845', 'ANDERSON JORGE RIBEIRO', 9],
    ['L168', 'LUIZ FELIPE DA SILVA', 3], ['L25', 'QEBSON RAMOS DA SILVA', 2], ['TF250', 'EDUARDO MARTINS DA SILVA JUNIOR', 5]]
  const porMes: Record<string, number[]> = { '2026-07': [48, 41, 22, 30, 9], '2026-08': [55, 38, 27, 26, 14], '2026-09': [61, 47, 19, 33, 12] }
  const itens = Object.entries(porMes).flatMap(([mes, qtds]) => viaturas.flatMap(([sigla, motorista, motoristaId], v) =>
    Array.from({ length: qtds[v]! }, (_, i) => {
      const valor = [208, 152, 231.5, 443.2][i % 4]!
      return { id: Number(`${mes.replace('-', '')}${v}${i}`), numero: `${sigla}-${mes}-${i}`, dataAtendimento: `${mes}-${String(1 + (i % 28)).padStart(2, '0')}`,
        especialidade: 'SOCORRO', motorista, motoristaId, viatura: sigla, numeroOp: '06438807', situacao: 'CONCILIADA',
        valorTotal: valor, valorPrevisto: valor, semValor: false }
    })))
  return { total: itens.length, semViatura: 0, valorTotal: 0, valorPrevisto: 0, semValor: 0, divergentes: 0, comissaoTotal: 0, itens }
})()

/** Responde as chamadas do Supabase com o exemplo acima, sem rede. */
const original = window.fetch
window.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada : entrada.url)
  const responder = (corpo: unknown) =>
    new Response(JSON.stringify(corpo), { headers: { 'Content-Type': 'application/json' } })

  if (url.includes('extrato_financeiro')) return responder(extrato)
  if (url.includes('manutencao_da_frota')) return responder([
    { id: 1, veiculo_id: 1, viatura: 'L168', item: 'Troca de óleo', intervalo_km: 10000, ultimo_km: '140000', ultima_data: '2026-06-10', km_atual: '150400', faltam_km: '-400' },
    { id: 2, veiculo_id: 2, viatura: 'L204', item: 'Troca de óleo', intervalo_km: 10000, ultimo_km: '84000', ultima_data: '2026-07-02', km_atual: '93250', faltam_km: '750' },
    { id: 3, veiculo_id: 1, viatura: 'L168', item: 'Pneus', intervalo_km: 40000, ultimo_km: '120000', ultima_data: null, km_atual: '150400', faltam_km: '9600' },
    { id: 4, veiculo_id: 3, viatura: 'L311', item: 'Revisão', intervalo_km: 20000, ultimo_km: '60000', ultima_data: '2026-05-20', km_atual: '66100', faltam_km: '13900' },
  ])
  if (url.includes('km_atual_das_viaturas')) return responder([{ veiculo_id: 1, km_atual: '150400' }, { veiculo_id: 2, km_atual: '93250' }])
  if (url.includes('/rest/v1/viatura_danos')) return responder([
    { id: 7, veiculo_id: 1, turno_id: 31, motorista_id: 1, descricao: 'Retrovisor direito quebrado', visto_em: '2026-09-22', resolvido_em: null, observacao: null, veiculos: { identificacao: 'L168' }, motoristas: { nome: 'DJALMA BEZERRA' } },
    { id: 8, veiculo_id: 2, turno_id: null, motorista_id: null, descricao: 'Lona traseira rasgada', visto_em: '2026-09-18', resolvido_em: null, observacao: null, veiculos: { identificacao: 'L204' }, motoristas: null },
  ])
  if (url.includes('/rest/v1/veiculos') && tela === 'documentos') return responder([
    { id: 1, identificacao: 'L168', placa: 'FLS9B63', modelo: 'Delivery 11.180', custo_por_km: 2.5, sigla_porto: 'L168', ativo: true },
    { id: 2, identificacao: 'L204', placa: 'GHT2A48', modelo: 'Accelo 1017', custo_por_km: 2.7, sigla_porto: 'L204', ativo: true },
    { id: 3, identificacao: 'L311', placa: 'EXC4C11', modelo: 'Tector 9.190', custo_por_km: 2.9, sigla_porto: 'L311', ativo: true },
    { id: 4, identificacao: 'L402', placa: null, modelo: null, custo_por_km: 2.5, sigla_porto: 'L402', ativo: true },
  ])
  if (url.includes('/rest/v1/vistorias_periodicas')) return responder([
    { id: 1, veiculo_id: 2, referencia: '2026-08-01', feita_em: '2026-08-04', resultado: 'APROVADA', observacao: null },
  ])
  if (url.includes('/rest/v1/documentos')) return responder([
    { id: 1, tipo: 'CRLV', vence_em: '2026-09-18', observacao: null, veiculo_id: 1, motorista_id: null, veiculos: { identificacao: 'L168' }, motoristas: null },
    { id: 2, tipo: 'Seguro', vence_em: '2026-10-12', observacao: 'Apólice 55.221 · Porto Seguro', veiculo_id: 2, motorista_id: null, veiculos: { identificacao: 'L204' }, motoristas: null },
    { id: 3, tipo: 'CNH', vence_em: '2026-10-02', observacao: null, veiculo_id: null, motorista_id: 1, veiculos: null, motoristas: { nome: 'DJALMA BEZERRA' } },
    { id: 4, tipo: 'Curso da Porto', vence_em: '2027-04-30', observacao: null, veiculo_id: null, motorista_id: 2, veiculos: null, motoristas: { nome: 'JEFERSON MARTINS' } },
  ])
  if (url.includes('porto_detectar_contestacoes')) return responder(2)
  if (url.includes('porto_especialidades_vistas')) return responder([
    { especialidade: 'REMOCAO', servicos: 212, valor_mais_comum: '205.00', valor_tabela: '205.00' },
    { especialidade: 'SOCORRO MECANICO', servicos: 140, valor_mais_comum: '150.00', valor_tabela: null },
    { especialidade: 'TROCA DE PNEU', servicos: 61, valor_mais_comum: '120.00', valor_tabela: '120.00' },
  ])
  if (url.includes('/rest/v1/porto_contestacoes')) {
    const os = (id: number, numero: string, nome: string, sigla: string, dia: string, op: string | null = null) => ({
      id, numero, data_atendimento: dia, especialidade: 'REMOCAO', sigla_viatura: sigla, motorista_id: id,
      motoristas: { nome }, ordens_pagamento_porto: op ? { numero: op } : null })
    return responder([
      { id: 1, tipo: 'NAO_PAGA', situacao: 'A_CONTESTAR', valor_esperado: '205.00', valor_pago: '0.00', prazo: '2026-09-28',
        contestada_em: null, protocolo: null, observacao: null, resolvida_em: null, valor_recuperado: null,
        ordens_servico_porto: os(1, '5673329/26', 'DJALMA BEZERRA', 'L168', '2026-09-03') },
      { id: 2, tipo: 'PAGA_A_MENOS', situacao: 'A_CONTESTAR', valor_esperado: '205.00', valor_pago: '150.00', prazo: '2026-10-18',
        contestada_em: null, protocolo: null, observacao: null, resolvida_em: null, valor_recuperado: null,
        ordens_servico_porto: os(2, '5673528/26', 'JEFERSON MARTINS', 'L204', '2026-09-08', '06438807') },
      { id: 3, tipo: 'NAO_PAGA', situacao: 'CONTESTADA', valor_esperado: null, valor_pago: '0.00', prazo: '2026-09-20',
        contestada_em: '2026-09-15', protocolo: 'PRT-4471', observacao: null, resolvida_em: null, valor_recuperado: null,
        ordens_servico_porto: os(3, '5671002/26', 'NATANAEL FREITAS', 'L311', '2026-09-01') },
      { id: 4, tipo: 'NAO_PAGA', situacao: 'ACEITA', valor_esperado: '180.00', valor_pago: '180.00', prazo: '2026-10-01',
        contestada_em: '2026-09-10', protocolo: null, observacao: 'Paga na OP 06438808', resolvida_em: '2026-09-22', valor_recuperado: '180.00',
        ordens_servico_porto: os(4, '5670000/26', 'QEBSON RAMOS', 'L168', '2026-08-28', '06438808') },
    ])
  }
  if (url.includes('porto_resumo_ops')) {
    const total = ops.reduce((t, op) => t + op.valor_total, 0)
    return responder({ ...resumoOps, quantidadeTotalOps: ops.length, valorTotalPrevisto: total,
      quantidadeRecebidas: ops.length, valorRecebido: total, valorMedioPorOp: total / ops.length })
  }
  if (url.includes('porto_listar_os')) return responder(tela === 'desempenho' ? osDeTresMeses : listaDeOs)
  if (url.includes('meu_turno_do_dia')) return responder(turnoDoDia)
  if (url.includes('fila_de_aprovacoes')) return responder(filaAprovacoes)
  if (url.includes('porto_pendencias_os')) return responder(pendencias)
  if (url.includes('porto_dashboard_alto_nivel')) return responder(painel)
  // Frota: um exemplo com quatro viaturas, para o comparativo (dados inventados).
  if (url.includes('dashboard_financeiro') && tela === 'frota') return responder({
    ...visaoGeral.financeiro, despesasPagas: 21000,
    resultadoPorVeiculo: [
      { kmMorto: 120, veiculo: 'L168', despesas: 4200, receitas: 31500, resultado: 27300, veiculoId: 1, custoKmMorto: 300 },
      { kmMorto: 80, veiculo: 'L204', despesas: 3900, receitas: 22800, resultado: 18900, veiculoId: 2, custoKmMorto: 216 },
      { kmMorto: 210, veiculo: 'L311', despesas: 5100, receitas: 6200, resultado: 1100, veiculoId: 3, custoKmMorto: 609 },
      { kmMorto: 40, veiculo: 'L402', despesas: 1800, receitas: 14270, resultado: 12470, veiculoId: 4, custoKmMorto: 100 },
    ] })
  if (url.includes('/rest/v1/veiculos') && tela === 'frota') return responder([
    { id: 1, identificacao: 'L168', placa: 'FLS9B63', modelo: 'Delivery 11.180', custo_por_km: 2.5, sigla_porto: 'L168', ativo: true },
    { id: 2, identificacao: 'L204', placa: 'GHT2A48', modelo: 'Accelo 1017', custo_por_km: 2.7, sigla_porto: 'L204', ativo: true },
    { id: 3, identificacao: 'L311', placa: 'EXC4C11', modelo: 'Tector 9.190', custo_por_km: 2.9, sigla_porto: 'L311', ativo: true },
    { id: 4, identificacao: 'L402', placa: 'QWE5F66', modelo: 'Aumark S 916', custo_por_km: 2.5, sigla_porto: 'L402', ativo: true },
  ])
  if (url.includes('dashboard_resumo')) return responder(visaoGeral)
  if (url.includes('comissao_das_ops')) return responder(comissao)
  if (url.includes('meus_periodos_de_op')) return responder([
    { id: 19, numero: '06389821', periodo_inicio: '2026-03-30', periodo_fim: '2026-04-29',
      data_pagamento_programada: '2026-06-07' },
  ])
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

const tela = new URLSearchParams(location.search).get('tela')
const daVisao = tela === 'visao'
// A Visao geral e o Extrato abrem no periodo da OP real, para terem o que mostrar.
if (tela === 'desempenho') sessionStorage.setItem('filtro:periodo', JSON.stringify({ inicio: '2026-07-01', fim: '2026-09-30' }))
if (tela === 'os') sessionStorage.setItem('filtro:periodo', JSON.stringify({ inicio: '2026-09-16', fim: '2026-09-30' }))
if (daVisao || tela === 'extrato') sessionStorage.setItem('filtro:periodo', JSON.stringify({ inicio: '2026-03-30', fim: '2026-04-29', op: '1' }))

const Pagina = tela === 'frota'
  ? (await import('./frota/FrotasPage')).default
  : tela === 'km'
  ? (await import('./frota/QuilometragemPage')).default
  : tela === 'dre'
  ? (await import('./financeiro/DrePage')).default
  : tela === 'desempenho'
  ? (await import('./desempenho/DesempenhoPage')).default
  : tela === 'extrato'
  ? (await import('./financeiro/LancamentosPage')).default
  : tela === 'ops'
  ? (await import('./porto/PortoOrdensPagamentoPage')).default
  : tela === 'equipe'
  ? (await import('./equipe/EquipePage')).default
  : tela === 'config'
  ? (await import('./configuracoes/ConfiguracoesPage')).default
  : tela === 'senha'
  ? (await import('./configuracoes/TrocarSenhaPage')).default
  : tela === 'despesas'
  ? (await import('./financeiro/DespesasPage')).default
  : tela === 'comissao'
  ? (await import('./comissao/MinhaComissaoPage')).default
  : tela === 'os'
  ? (await import('./porto/PortoOrdensServicoPage')).default
  : tela === 'turno'
  ? (await import('./socorrista/TurnoPage')).default
  : tela === 'atendimento'
  ? (await import('./socorrista/AtendimentoPage')).default
  : tela === 'relatorios'
  ? (await import('./porto/PortoRelatoriosPage')).default
  : tela === 'manutencao'
  ? (await import('./frota/ManutencaoPage')).default
  : tela === 'documentos'
  ? (await import('./frota/DocumentosPage')).default
  : tela === 'contestacoes'
  ? (await import('./porto/PortoContestacoesPage')).default
  : tela === 'aprovacoes'
    ? (await import('./aprovacoes/AprovacoesPage')).default
    : tela === 'pendencias'
      ? (await import('./porto/PortoPendenciasOsPage')).default
      : daVisao
        ? (await import('./DashboardPage')).default
        : (await import('./porto/PortoDashboardPage')).default

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[`/${location.search}`]}>
      <AuthProvider>
        <main className="content">
          <Pagina/>
        </main>
      </AuthProvider>
    </MemoryRouter>
  </StrictMode>,
)
