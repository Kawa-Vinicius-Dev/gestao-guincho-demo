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

export async function baixarOrdensServicoPorto(params?: URLSearchParams): Promise<void> {
  const oss = await listarOrdensServicoPorto(params)
  baixarArquivoCsv(
    paraCsv([['Ordens de serviço Porto'], [], CABECALHO_OS, ...oss.map(linhaOs)]),
    'ordens-servico-porto.csv')
}
