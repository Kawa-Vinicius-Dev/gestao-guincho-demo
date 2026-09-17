import { baixarRelatorioCsv as csvPeloRender } from '../api/relatorios'
import { baixarRelatorioComissoes as comissoesPeloRender } from '../api/comissoes'
import { moduloNoSupabase } from './modo'
import { lerIndicadores } from './dashboard'
import { resumirComissoes } from './comissoes'
import { data, moeda } from '../utils/formatadores'
import { baixarRelatorio, type Formato } from './exportar'

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

/**
 * DRE do periodo em Excel ou PDF: resultado no topo, despesas por categoria e
 * resultado por viatura.
 */
export async function baixarDre(inicio: string, fim: string, formato: Formato): Promise<void> {
  if (!moduloNoSupabase('dashboard')) return csvPeloRender('dre', inicio, fim, `dre-${inicio}-a-${fim}.csv`)
  const d = await lerIndicadores(inicio, fim)
  const lucro = d.receitaRecebida - d.despesasPagas
  const margem = d.receitaRecebida ? (lucro / d.receitaRecebida) * 100 : 0
  const categorias = d.despesasPorCategoria ?? []
  const viaturas = d.resultadoPorVeiculo.filter(v => v.receitas || v.despesas)
  await baixarRelatorio({
    titulo: 'DRE - Demonstrativo de resultado',
    subtitulo: `Período: ${data(inicio)} a ${data(fim)}`,
    resumo: [
      ['Receitas recebidas', moeda(d.receitaRecebida)],
      ['Despesas pagas', moeda(d.despesasPagas)],
      ['Lucro operacional', moeda(lucro)],
      ['Margem', `${margem.toFixed(1).replace('.', ',')}%`],
    ],
    secoes: [
      {
        titulo: 'Resultado',
        colunas: [{ titulo: 'Linha', largura: 34 }, { titulo: 'Valor', tipo: 'moeda', largura: 18 }],
        linhas: [['Receita bruta (recebida)', d.receitaRecebida], ['(-) Despesas pagas', -d.despesasPagas]],
        totais: ['Lucro operacional', lucro],
      },
      {
        titulo: 'Despesas por categoria',
        colunas: [{ titulo: 'Categoria', largura: 34 }, { titulo: 'Valor', tipo: 'moeda', largura: 18 }, { titulo: 'Participação', tipo: 'percentual', largura: 14 }],
        linhas: categorias.map(c => [c.categoria, c.valor, c.participacao]),
        totais: ['Total', categorias.reduce((s, c) => s + c.valor, 0), categorias.length ? 100 : null],
        vazio: 'Nenhuma despesa paga no período.',
      },
      {
        titulo: 'Resultado por viatura',
        colunas: [
          { titulo: 'Viatura', largura: 14 }, { titulo: 'Receitas', tipo: 'moeda', largura: 16 },
          { titulo: 'Despesas', tipo: 'moeda', largura: 16 }, { titulo: 'Resultado', tipo: 'moeda', largura: 16 },
          { titulo: 'Km morto', tipo: 'numero', largura: 11 }, { titulo: 'Custo do km morto', tipo: 'moeda', largura: 18 },
        ],
        linhas: viaturas.map(v => [v.veiculo, v.receitas, v.despesas, v.resultado, v.kmMorto, v.custoKmMorto]),
        totais: ['Total', viaturas.reduce((s, v) => s + v.receitas, 0), viaturas.reduce((s, v) => s + v.despesas, 0),
          viaturas.reduce((s, v) => s + v.resultado, 0), viaturas.reduce((s, v) => s + v.kmMorto, 0),
          viaturas.reduce((s, v) => s + v.custoKmMorto, 0)],
        vazio: 'Nenhuma viatura com movimento no período.',
      },
    ],
    nomeArquivo: `dre-${inicio}-a-${fim}`,
  }, formato)
}

export async function baixarRelatorioComissoes(ordensPagamento: number[], periodo: string, formato: Formato): Promise<void> {
  if (!moduloNoSupabase('comissoes')) return comissoesPeloRender(ordensPagamento[0])

  const resumo = await resumirComissoes(ordensPagamento)
  const soma = (f: (r: typeof resumo[number]) => number) => resumo.reduce((s, r) => s + f(r), 0)
  await baixarRelatorio({
    titulo: 'Comissões dos socorristas',
    subtitulo: `Período: ${periodo}`,
    resumo: [
      ['Produção paga', moeda(soma(r => r.producaoPaga))],
      ['Comissão bruta', moeda(soma(r => r.comissaoBruta))],
      ['Descontos', moeda(soma(r => r.descontos))],
      ['Líquido', moeda(soma(r => r.liquido))],
    ],
    secoes: [{
      colunas: [
        { titulo: 'Socorrista', largura: 34 }, { titulo: 'Serviços', tipo: 'numero', largura: 10 },
        { titulo: 'Produção', tipo: 'moeda', largura: 16 }, { titulo: 'Comissão bruta', tipo: 'moeda', largura: 16 },
        { titulo: 'Descontos', tipo: 'moeda', largura: 14 }, { titulo: 'Líquido', tipo: 'moeda', largura: 16 },
      ],
      linhas: resumo.map(r => [r.socorrista, r.quantidadeServicosPagos, r.producaoPaga, r.comissaoBruta, r.descontos, r.liquido]),
      totais: ['Total', soma(r => r.quantidadeServicosPagos), soma(r => r.producaoPaga), soma(r => r.comissaoBruta),
        soma(r => r.descontos), soma(r => r.liquido)],
      vazio: 'Nenhuma comissão no período.',
    }],
    nomeArquivo: 'comissoes',
  }, formato)
}
