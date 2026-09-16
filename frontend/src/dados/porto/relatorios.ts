import type { OrdemPagamentoPorto, OrdemServicoPorto } from '../../types/modelos'
import { baixarArquivoCsv, paraCsv } from '../relatorios'
import { data as formatarData, moeda } from '../../utils/formatadores'
import { detalharOrdemPagamentoPorto, listarOrdensPagamentoPorto, listarOrdensServicoPorto } from '../porto'
import {
  baixarOrdensServicoPorto as ossPeloRender,
  baixarRelatorioOpPorto as opPeloRender,
  baixarRelatorioPorto as peloRender,
} from '../../api/porto'

// Caminho de rollback: o XLSX/PDF do backend antigo continua alcancavel.
export { ossPeloRender, opPeloRender, peloRender }

/**
 * Exportacoes do modulo Porto.
 *
 * O backend gerava XLSX (Apache POI) e PDF (PDFBox). Aqui sai CSV: os dados
 * ja chegam prontos das RPCs e montar o texto e trabalho de uma funcao. Uma
 * Edge Function so para formatar planilha gastaria invocacao sem necessidade,
 * e embutir uma biblioteca de XLSX no bundle custaria a todo mundo que abre a
 * tela, nao so a quem exporta.
 */

/** Data opcional: coluna vazia quando ainda nao ha o que mostrar. */
const dataBr = (valor?: string) => (valor ? formatarData(valor) : '')

const CABECALHO_OP = [
  'OP', 'Nome/código', 'Valor previsto', 'Serviços', 'Valor dos serviços',
  'Divergência', 'Conciliação', 'Situação', 'Programado para', 'Valor recebido',
  'Recebido em', 'Período',
]

const linhaOp = (op: OrdemPagamentoPorto) => [
  op.numero, op.nomeCodigo ?? '', moeda(op.valorTotal), op.quantidadeOrdensServico,
  moeda(op.valorOrdensServico), moeda(op.divergencia), op.statusConciliacao, op.situacao,
  dataBr(op.dataPagamentoProgramada), op.valorRecebido != null ? moeda(op.valorRecebido) : '',
  dataBr(op.dataRecebimento), op.periodoFinanceiro ?? '',
]

const CABECALHO_OS = [
  'OS', 'OP', 'Valor', 'Especialidade', 'Viatura', 'Socorrista', 'QRA',
  'Atendimento', 'Situação operacional', 'Situação financeira', 'Placa', 'Cliente',
]

const linhaOs = (os: OrdemServicoPorto) => [
  os.numero, os.ordemPagamento ?? '', moeda(os.valorTotal), os.especialidade ?? '',
  os.viatura ?? '', os.socorrista ?? '', os.qra ?? '', dataBr(os.dataAtendimento),
  os.statusOperacional, os.statusFinanceiro, os.placa ?? '', os.cliente ?? '',
]

export async function baixarRelatorioPorto(params?: URLSearchParams): Promise<void> {
  const ops = await listarOrdensPagamentoPorto(params)
  baixarArquivoCsv(
    paraCsv([['Ordens de pagamento Porto'], [], CABECALHO_OP, ...ops.map(linhaOp)]),
    'relatorio-porto.csv')
}

export async function baixarRelatorioOpPorto(id: number): Promise<void> {
  const detalhe = await detalharOrdemPagamentoPorto(id)
  const op = detalhe.ordemPagamento
  baixarArquivoCsv(paraCsv([
    [`Ordem de pagamento ${op.numero}`], [],
    CABECALHO_OP, linhaOp(op), [],
    ['Ordens de serviço que compõem a OP'],
    CABECALHO_OS, ...detalhe.ordensServico.map(linhaOs), [],
    ...(detalhe.justificativas.length
      ? [['Justificativas'], ['Motivo', 'Observação', 'Diferença', 'Usuário', 'Registrada em'],
         ...detalhe.justificativas.map(j => [
           j.motivo, j.observacao, j.valorDiferenca != null ? moeda(j.valorDiferenca) : '',
           j.usuario, dataBr(j.criadoEm.slice(0, 10))])]
      : []),
  ]), `op-porto-${op.numero}.csv`)
}

/**
 * Relatorio diario dos servicos prestados.
 *
 * E o fechamento do dia de quem opera: o que a equipe atendeu, com quem estava
 * na viatura e quanto cada servico vale. Sai por socorrista e por especialidade
 * porque sao as duas perguntas que vem logo depois de "quantos foram" — quem
 * produziu e o que a operacao fez mais.
 *
 * O valor pode nao existir ainda: o painel do dia nao traz preco, e a Porto so
 * precifica na OP. Servico sem valor aparece como "a precificar", e nao como
 * R$ 0,00 — zero seria uma afirmacao errada.
 */
export async function baixarRelatorioDiarioPorto(dia: string): Promise<void> {
  const params = new URLSearchParams({ dataInicio: dia, dataFim: dia })
  const servicos = await listarOrdensServicoPorto(params)
  const validos = servicos.filter(os => os.statusOperacional !== 'CANCELADO')
  const cancelados = servicos.length - validos.length

  const soma = (lista: OrdemServicoPorto[]) =>
    lista.reduce((total, os) => total + (os.valorTotal ?? 0), 0)

  // Zero aqui nao e "nao faturou": e "ainda nao tem preco". Sao coisas
  // diferentes, e escrever R$ 0,00 afirmaria a errada.
  const valorOuPendente = (total: number) => (total > 0 ? moeda(total) : 'a precificar')

  const agrupar = (chave: (os: OrdemServicoPorto) => string) => {
    const grupos = new Map<string, OrdemServicoPorto[]>()
    for (const os of validos) {
      const nome = chave(os) || 'Não informado'
      grupos.set(nome, [...(grupos.get(nome) ?? []), os])
    }
    return [...grupos.entries()]
      .sort((a, b) => soma(b[1]) - soma(a[1]) || b[1].length - a[1].length)
      .map(([nome, lista]) => [nome, lista.length, valorOuPendente(soma(lista))])
  }

  const valorDaLinha = (os: OrdemServicoPorto) => valorOuPendente(os.valorTotal)

  baixarArquivoCsv(paraCsv([
    [`Serviços prestados em ${formatarData(dia)}`], [],
    ['Serviços', validos.length],
    ['Valor conhecido', valorOuPendente(soma(validos))],
    ['Sem valor ainda', validos.filter(os => os.valorTotal <= 0).length],
    ...(cancelados ? [['Cancelados', cancelados]] : []),
    [],
    ['OS', 'Hora', 'Seguradora', 'Especialidade', 'Viatura', 'Socorrista', 'Valor', 'Situação'],
    ...validos.map(os => [
      os.numero,
      os.dataHoraAtendimento ? os.dataHoraAtendimento.slice(11, 16) : '',
      os.seguradora ?? '', os.especialidade ?? '', os.viatura ?? '',
      os.socorrista ?? os.motorista ?? '', valorDaLinha(os), os.statusOperacional,
    ]),
    [],
    ['Por socorrista'], ['Socorrista', 'Serviços', 'Valor'],
    ...agrupar(os => os.motorista ?? os.socorrista ?? ''),
    [],
    ['Por especialidade'], ['Especialidade', 'Serviços', 'Valor'],
    ...agrupar(os => os.especialidade ?? ''),
  ]), `servicos-prestados-${dia}.csv`)
}

export async function baixarOrdensServicoPorto(params?: URLSearchParams): Promise<void> {
  const oss = await listarOrdensServicoPorto(params)
  baixarArquivoCsv(
    paraCsv([['Ordens de serviço Porto'], [], CABECALHO_OS, ...oss.map(linhaOs)]),
    'ordens-servico-porto.csv')
}
