import { baixarRelatorioCsv as csvPeloRender } from '../api/relatorios'
import { baixarRelatorioComissoes as comissoesPeloRender } from '../api/comissoes'
import { moduloNoSupabase } from './modo'
import { lerIndicadores } from './dashboard'
import { resumirComissoes } from './comissoes'
import { moeda } from '../utils/formatadores'
import { baixarRelatorio, type Formato } from './exportar'
import { diasDoPeriodo, montarDre, relatorioDaDre } from './dre'
import { lerExtrato } from './extrato'
import { listarTodasAsOs } from './porto/listaOs'
import { listarVeiculos } from './veiculos'

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
 * DRE do periodo em Excel ou PDF: a mesma montagem da tela (dados/dre.ts) —
 * resultado, servicos prestados (um a um ate 8 dias, resumidos acima) e cada
 * despesa paga dentro da categoria.
 */
export async function baixarDre(inicio: string, fim: string, formato: Formato, porCompetencia = true): Promise<void> {
  if (!moduloNoSupabase('dashboard')) return csvPeloRender('dre', inicio, fim, `dre-${inicio}-a-${fim}.csv`)
  const [financeiro, extrato, servicos, veiculos] = await Promise.all([
    lerIndicadores(inicio, fim, porCompetencia),
    lerExtrato(inicio, fim),
    listarTodasAsOs({ inicio, fim, porCompetencia }).then(p => p.itens),
    listarVeiculos().catch(() => []),
  ])
  const dre = montarDre(financeiro, extrato, servicos, diasDoPeriodo(inicio, fim), veiculos)
  await baixarRelatorio(relatorioDaDre(dre, inicio, fim), formato)
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
