import type { OrdemPagamentoPorto, OrdemServicoPorto } from '../../types/modelos'
import { baixarRelatorio, type Formato, type Relatorio } from '../exportar'
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
 * Exportacoes do modulo Porto, em Excel e PDF organizados (ver dados/exportar).
 *
 * Cada relatorio e montado a partir dos mesmos dados que a tela mostra; montar
 * e baixar ficam separados para que o conteudo possa ser conferido em teste.
 */

const CONCILIACAO: Record<string, string> = {
  CONCILIADA: 'Conciliada', SEM_COMPOSICAO: 'Sem composição', VALOR_ABAIXO: 'Valor abaixo',
  VALOR_ACIMA: 'Valor acima', RECEBIDA_COM_DIVERGENCIA: 'Divergência no recebimento',
}

const periodoDaOp = (op: OrdemPagamentoPorto) =>
  op.periodoInicio && op.periodoFim ? `${formatarData(op.periodoInicio)} a ${formatarData(op.periodoFim)}` : ''

export function relatorioDeOps(ops: OrdemPagamentoPorto[], params?: URLSearchParams): Relatorio {
  const inicio = params?.get('dataInicio'), fim = params?.get('dataFim')
  const servicos = ops.reduce((s, op) => s + op.quantidadeOrdensServico, 0)
  const valor = ops.reduce((s, op) => s + op.valorOrdensServico, 0)
  return {
    titulo: 'Ordens de pagamento Porto',
    subtitulo: inicio && fim ? `Período: ${formatarData(inicio)} a ${formatarData(fim)}` : 'Todas as OPs',
    resumo: [['OPs', String(ops.length)], ['Serviços', String(servicos)], ['Valor dos serviços', moeda(valor)]],
    secoes: [{
      colunas: [
        { titulo: 'OP', largura: 12 }, { titulo: 'Período', largura: 25 },
        { titulo: 'Serviços', tipo: 'numero', largura: 10 }, { titulo: 'Valor dos serviços', tipo: 'moeda', largura: 18 },
        { titulo: 'Valor da OP', tipo: 'moeda', largura: 16 }, { titulo: 'Diferença', tipo: 'moeda', largura: 14 },
        { titulo: 'Conciliação', largura: 18 },
      ],
      linhas: ops.map(op => [op.numero, periodoDaOp(op), op.quantidadeOrdensServico, op.valorOrdensServico,
        op.valorTotal, op.divergencia, CONCILIACAO[op.statusConciliacao] ?? op.statusConciliacao]),
      totais: ['Total', null, servicos, valor, ops.reduce((s, op) => s + op.valorTotal, 0),
        ops.reduce((s, op) => s + op.divergencia, 0), null],
      vazio: 'Nenhuma OP no período.',
    }],
    nomeArquivo: inicio && fim ? `ops-porto-${inicio}-a-${fim}` : 'ops-porto',
  }
}

export async function baixarRelatorioPorto(formato: Formato, params?: URLSearchParams): Promise<void> {
  await baixarRelatorio(relatorioDeOps(await listarOrdensPagamentoPorto(params), params), formato)
}

export async function baixarRelatorioOpPorto(id: number, formato: Formato): Promise<void> {
  const detalhe = await detalharOrdemPagamentoPorto(id)
  const op = detalhe.ordemPagamento
  const oss = detalhe.ordensServico
  await baixarRelatorio({
    titulo: `Ordem de pagamento ${op.numero}`,
    subtitulo: op.periodoInicio && op.periodoFim ? `Período: ${periodoDaOp(op)}` : undefined,
    resumo: [
      ['Serviços', String(op.quantidadeOrdensServico)],
      ['Valor dos serviços', moeda(op.valorOrdensServico)],
      ['Valor da OP', moeda(op.valorTotal)],
      ['Conciliação', CONCILIACAO[op.statusConciliacao] ?? op.statusConciliacao],
    ],
    secoes: [
      {
        titulo: 'Ordens de serviço da OP',
        colunas: [
          { titulo: 'OS', largura: 16 }, { titulo: 'Atendimento', tipo: 'data', largura: 13 },
          { titulo: 'Especialidade', largura: 20 }, { titulo: 'Socorrista', largura: 32 },
          { titulo: 'Viatura', largura: 11 }, { titulo: 'Valor', tipo: 'moeda', largura: 14 },
        ],
        linhas: oss.map(os => [os.numero, os.dataAtendimento, os.especialidade, os.motorista ?? os.socorrista,
          os.viatura, os.valorTotal]),
        totais: ['Total', null, null, null, null, oss.reduce((s, os) => s + os.valorTotal, 0)],
        vazio: 'Nenhuma OS vinculada a esta OP.',
      },
      ...(detalhe.justificativas.length ? [{
        titulo: 'Justificativas',
        colunas: [
          { titulo: 'Motivo', largura: 18 }, { titulo: 'Observação', largura: 40 },
          { titulo: 'Diferença', tipo: 'moeda' as const, largura: 14 }, { titulo: 'Usuário', largura: 20 },
          { titulo: 'Registrada em', tipo: 'data' as const, largura: 14 },
        ],
        linhas: detalhe.justificativas.map(j => [j.motivo, j.observacao, j.valorDiferenca, j.usuario, j.criadoEm.slice(0, 10)]),
      }] : []),
    ],
    nomeArquivo: `op-porto-${op.numero}`,
  }, formato)
}

/**
 * Relatorio diario dos servicos prestados.
 *
 * E o fechamento do dia de quem opera: o que a equipe atendeu, com quem estava
 * na viatura e quanto cada servico vale, somado por socorrista e por
 * especialidade.
 *
 * O valor pode nao existir ainda: o painel do dia nao traz preco, e a Porto so
 * precifica na OP. Servico sem valor aparece como "a precificar", e nao como
 * R$ 0,00 — zero seria uma afirmacao errada.
 */
export async function relatorioDiarioPorto(dia: string): Promise<Relatorio> {
  const servicos = await listarOrdensServicoPorto(new URLSearchParams({ dataInicio: dia, dataFim: dia }))
  const validos = servicos.filter(os => os.statusOperacional !== 'CANCELADO')
  const cancelados = servicos.length - validos.length
  const soma = (lista: OrdemServicoPorto[]) => lista.reduce((total, os) => total + (os.valorTotal ?? 0), 0)
  const valorOuPendente = (total: number) => (total > 0 ? total : 'a precificar')

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

  return {
    titulo: `Serviços prestados em ${formatarData(dia)}`,
    resumo: [
      ['Serviços', String(validos.length)],
      ['Valor conhecido', soma(validos) > 0 ? moeda(soma(validos)) : 'a precificar'],
      ['Sem valor ainda', String(validos.filter(os => os.valorTotal <= 0).length)],
      ...(cancelados ? [['Cancelados', String(cancelados)] as [string, string]] : []),
    ],
    secoes: [
      {
        titulo: 'Serviços',
        colunas: [
          { titulo: 'OS', largura: 16 }, { titulo: 'Hora', largura: 8 }, { titulo: 'Especialidade', largura: 20 },
          { titulo: 'Viatura', largura: 11 }, { titulo: 'Socorrista', largura: 32 }, { titulo: 'Valor', tipo: 'moeda', largura: 14 },
        ],
        linhas: validos.map(os => [os.numero, os.dataHoraAtendimento ? os.dataHoraAtendimento.slice(11, 16) : '',
          os.especialidade, os.viatura, os.motorista ?? os.socorrista, valorOuPendente(os.valorTotal)]),
        vazio: 'Nenhum serviço neste dia.',
      },
      {
        titulo: 'Por socorrista',
        colunas: [{ titulo: 'Socorrista', largura: 32 }, { titulo: 'Serviços', tipo: 'numero' }, { titulo: 'Valor', tipo: 'moeda', largura: 14 }],
        linhas: agrupar(os => os.motorista ?? os.socorrista ?? ''),
      },
      {
        titulo: 'Por especialidade',
        colunas: [{ titulo: 'Especialidade', largura: 32 }, { titulo: 'Serviços', tipo: 'numero' }, { titulo: 'Valor', tipo: 'moeda', largura: 14 }],
        linhas: agrupar(os => os.especialidade ?? ''),
      },
    ],
    nomeArquivo: `servicos-prestados-${dia}`,
  }
}

export async function baixarRelatorioDiarioPorto(dia: string, formato: Formato): Promise<void> {
  await baixarRelatorio(await relatorioDiarioPorto(dia), formato)
}
