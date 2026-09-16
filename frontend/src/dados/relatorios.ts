import { ApiError } from '../api/http'
import { baixarRelatorioCsv as csvPeloRender } from '../api/relatorios'
import { baixarRelatorioComissoes as comissoesPeloRender } from '../api/comissoes'
import { moduloNoSupabase } from './modo'
import { lerIndicadores } from './dashboard'
import { resumirComissoes } from './comissoes'
import { moeda } from '../utils/formatadores'

/**
 * Relatorios em CSV.
 *
 * Nao precisam de servidor: os dados ja chegam prontos das RPCs e montar texto
 * separado por ponto e virgula e trabalho de uma funcao. Mandar isso para uma
 * Edge Function gastaria invocacao para concatenar string.
 */

/** Excel brasileiro le CSV com ponto e virgula; virgula quebra as colunas. */
export function paraCsv(linhas: (string | number)[][]) {
  return linhas
    .map(l => l.map(c => {
      const t = String(c ?? '')
      return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
    }).join(';'))
    .join('\r\n')
}

export function baixarArquivoCsv(conteudo: string, nomeArquivo: string) {
  // BOM para o Excel reconhecer UTF-8 e nao trocar os acentos.
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  link.click()
  URL.revokeObjectURL(url)
}

export async function baixarRelatorioCsv(
  tipo: string, inicio: string, fim: string, nomeArquivo: string,
): Promise<void> {
  if (!moduloNoSupabase('dashboard')) return csvPeloRender(tipo, inicio, fim, nomeArquivo)

  if (tipo !== 'dre') throw new ApiError('Relatório não disponível.', 404)

  const d = await lerIndicadores(inicio, fim)
  const linhas: (string | number)[][] = [
    ['Demonstrativo de resultado'],
    ['Período', `${inicio} a ${fim}`],
    [],
    ['Linha', 'Valor'],
    ['Receita recebida', moeda(d.receitaRecebida)],
    ['Receita prevista', moeda(d.receitaPrevista)],
    ['Total em atraso', moeda(d.totalAtrasado)],
    ['Despesas pagas', moeda(d.despesasPagas)],
    ['Despesas previstas', moeda(d.despesasPrevistas)],
    ['Resultado realizado', moeda(d.saldoRealizado)],
    ['Resultado projetado', moeda(d.saldoProjetado)],
    [],
    ['Despesas por categoria'],
    ['Categoria', 'Valor', 'Participação'],
    ...(d.despesasPorCategoria ?? []).map(c =>
      [c.categoria, moeda(c.valor), `${c.participacao}%`]),
    [],
    ['Resultado por veículo'],
    ['Veículo', 'Receitas', 'Despesas', 'Resultado', 'Km morto', 'Custo do km morto'],
    ...d.resultadoPorVeiculo.map(v =>
      [v.veiculo, moeda(v.receitas), moeda(v.despesas), moeda(v.resultado),
       v.kmMorto, moeda(v.custoKmMorto)]),
  ]
  baixarArquivoCsv(paraCsv(linhas), nomeArquivo)
}

export async function baixarRelatorioComissoes(calendarioPagamentoId: number): Promise<void> {
  if (!moduloNoSupabase('comissoes')) return comissoesPeloRender(calendarioPagamentoId)

  const resumo = await resumirComissoes(calendarioPagamentoId)
  const linhas: (string | number)[][] = [
    ['Socorrista', 'Serviços pagos', 'Produção', 'Comissão bruta', 'Descontos', 'Líquido', 'Lançada em'],
    ...resumo.map(r => [
      r.socorrista, r.quantidadeServicosPagos, moeda(r.producaoPaga),
      moeda(r.comissaoBruta), moeda(r.descontos), moeda(r.liquido),
      r.pagamento?.dataPagamento ?? '',
    ]),
  ]
  baixarArquivoCsv(paraCsv(linhas), 'relatorio-comissoes.csv')
}
