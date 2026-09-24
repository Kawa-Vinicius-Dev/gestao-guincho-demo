import type { LinhaFaturamento } from '../components/Graficos'
import type { Dashboard, LancamentoFinanceiro, Veiculo } from '../types/modelos'
import { nomesCurtos } from '../utils/nomes'
import { resultadoComRateio, type ResultadoDaFrota } from './resultadoViaturas'
import type { Relatorio } from './exportar'
import { faturamentoPorGrupo } from './porto/faturamento'
import { valorDaOs, type LinhaOs } from './porto/listaOs'
import { data as formatarData, moeda } from '../utils/formatadores'

/**
 * A DRE, montada num lugar so para a tela e para o Excel/PDF.
 *
 * Kawa, 23/09/2026: a DRE exportada cabe em uma folha A4, "sem muita burocracia":
 * resumo de servicos, receitas, despesas e resultado, com detalhe suficiente
 * para conferir. Servico por servico nao entra na folha em periodo nenhum — a
 * lista um a um e do relatorio operacional; aqui ela vai numa aba do Excel.
 */

/** Quantas linhas cada quadro de resumo mostra na folha; o resto vira "Outros". */
const LINHAS_POR_QUADRO = 8

export interface CategoriaDaDre {
  categoria: string
  valor: number
  itens: LancamentoFinanceiro[]
}

export interface MontagemDre {
  receitaBruta: number
  totalDespesas: number
  lucro: number
  margem: number | null
  /** Receita dos servicos da Porto, e cada receita avulsa (credito, lancamento) por categoria. */
  receitaServicos: number
  receitasAvulsas: { categoria: string; valor: number }[]
  servicos: {
    total: number
    comValor: number
    semValor: number
    valor: number
    lista: LinhaOs[]
    porSocorrista: LinhaFaturamento[]
    porViatura: LinhaFaturamento[]
  }
  despesas: CategoriaDaDre[]
  /** Resultado de cada viatura com as despesas gerais rateadas pela receita. */
  viaturas: ResultadoDaFrota
}

export function diasDoPeriodo(inicio: string, fim: string): number {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000) + 1
}

export function montarDre(
  financeiro: Dashboard, extrato: LancamentoFinanceiro[], servicos: LinhaOs[], veiculos: Veiculo[] = [],
): MontagemDre {
  const receitaBruta = financeiro.receitaRecebida
  const totalDespesas = financeiro.despesasPagas
  const lucro = receitaBruta - totalDespesas

  // Receita avulsa: a lancada a mao (credito da OP, outra receita). O resto da
  // receita e dos servicos da Porto; assim a soma das linhas fecha com o total
  // nos dois modos do periodo.
  const avulsas = new Map<string, number>()
  for (const l of extrato) {
    if (l.tipo !== 'RECEITA' || !l.realizado || l.origem !== 'MANUAL') continue
    avulsas.set(l.categoria || 'Sem categoria', (avulsas.get(l.categoria || 'Sem categoria') ?? 0) + l.valor)
  }
  const receitasAvulsas = [...avulsas].map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor)
  const receitaServicos = receitaBruta - receitasAvulsas.reduce((t, r) => t + r.valor, 0)

  // Despesas pagas por categoria, com cada gasto dentro.
  const porCategoria = new Map<string, LancamentoFinanceiro[]>()
  for (const l of extrato) {
    if (l.tipo !== 'DESPESA' || !l.realizado) continue
    const c = l.categoria || 'Sem categoria'
    porCategoria.set(c, [...(porCategoria.get(c) ?? []), l])
  }
  const despesas = [...porCategoria].map(([categoria, itens]) => ({
    categoria,
    valor: itens.reduce((t, l) => t + l.valor, 0),
    itens: [...itens].sort((a, b) => a.data.localeCompare(b.data) || b.valor - a.valor),
  })).sort((a, b) => b.valor - a.valor)

  const semValor = servicos.filter(os => os.semValor).length
  return {
    receitaBruta, totalDespesas, lucro,
    margem: receitaBruta ? lucro / receitaBruta * 100 : null,
    receitaServicos, receitasAvulsas,
    servicos: {
      total: servicos.length,
      comValor: servicos.length - semValor,
      semValor,
      valor: servicos.reduce((t, os) => t + valorDaOs(os), 0),
      lista: [...servicos].sort((a, b) => (a.dataAtendimento ?? '').localeCompare(b.dataAtendimento ?? '') || a.numero.localeCompare(b.numero)),
      porSocorrista: faturamentoPorGrupo(servicos, 'socorrista'),
      porViatura: faturamentoPorGrupo(servicos, 'viatura', veiculos),
    },
    despesas,
    viaturas: resultadoComRateio(financeiro),
  }
}

/** As maiores linhas e, se sobrar, uma linha "Outros" com a soma do resto. */
function comOutros(linhas: [string, number, number][], rotuloOutros = 'Outros'): [string, number, number][] {
  if (linhas.length <= LINHAS_POR_QUADRO) return linhas
  const resto = linhas.slice(LINHAS_POR_QUADRO - 1)
  return [...linhas.slice(0, LINHAS_POR_QUADRO - 1),
    [`${rotuloOutros} (${resto.length})`, resto.reduce((t, l) => t + l[1], 0), resto.reduce((t, l) => t + l[2], 0)]]
}

/**
 * A DRE em uma folha A4 (PDF) e, no Excel, a mesma folha na primeira aba com os
 * servicos e os gastos um a um em abas proprias, para conferir.
 *
 * Quando nenhum servico do periodo tem valor ainda (a OP nao chegou), o arquivo
 * diz "parcial": os servicos aparecem em quantidade, sem virar R$ 0,00.
 */
export function relatorioDaDre(m: MontagemDre, inicio: string, fim: string, numerosOps: string[] = []): Relatorio {
  const curtos = nomesCurtos(m.servicos.lista.map(os => os.motorista))
  const ordenar = (linhas: LinhaFaturamento[]) =>
    [...linhas].sort((a, b) => Number(a.semVinculo) - Number(b.semVinculo) || b.valor - a.valor)
  const quadro = (titulo: string, rotulo: string, linhas: [string, number, number][]) => ({
    titulo, metade: true,
    colunas: [{ titulo: rotulo, largura: 24 }, { titulo: 'Serviços', tipo: 'numero' as const, largura: 10 },
      { titulo: 'Valor', tipo: 'moeda' as const, largura: 16 }],
    linhas: comOutros(linhas),
    totais: ['Total', m.servicos.total, m.servicos.valor],
    vazio: 'Nenhum serviço no período.',
  })

  const porEspecialidade = new Map<string, [number, number]>()
  for (const os of m.servicos.lista) {
    const nome = os.especialidade?.trim() || 'Não informada'
    const [q, v] = porEspecialidade.get(nome) ?? [0, 0]
    porEspecialidade.set(nome, [q + 1, v + valorDaOs(os)])
  }

  const semViatura = m.servicos.lista.filter(os => !os.viatura).length
  const semSocorrista = m.servicos.lista.filter(os => !os.motoristaId).length
  const situacao = !m.servicos.total ? 'Sem serviços no período'
    : !m.servicos.semValor ? 'DRE completa: todos os serviços com valor'
    : !m.servicos.comValor ? 'DRE parcial: nenhuma OP chegou para estes serviços ainda'
    : `DRE parcial: ${m.servicos.semValor} de ${m.servicos.total} serviços aguardando OP`

  // Categorias de despesa: as maiores e "Outras", para o demonstrativo caber na folha.
  const categorias = m.despesas.length <= LINHAS_POR_QUADRO ? m.despesas
    : [...m.despesas.slice(0, LINHAS_POR_QUADRO - 1), {
        categoria: `Outras (${m.despesas.length - LINHAS_POR_QUADRO + 1})`,
        valor: m.despesas.slice(LINHAS_POR_QUADRO - 1).reduce((t, d) => t + d.valor, 0), itens: [],
      }]

  return {
    titulo: 'DRE - Demonstrativo de resultado',
    subtitulo: `Período: ${formatarData(inicio)} a ${formatarData(fim)}${numerosOps.length ? ` · OP ${numerosOps.join(', ')}` : ''}`,
    folhaUnica: true,
    resumo: [
      ['Serviços', `${m.servicos.total}${m.servicos.semValor ? ` (${m.servicos.semValor} sem valor)` : ''}`],
      ['Receitas', moeda(m.receitaBruta)],
      ['Despesas', moeda(m.totalDespesas)],
      ['Resultado', `${moeda(m.lucro)}${m.margem === null ? '' : ` · ${m.margem.toFixed(1).replace('.', ',')}%`}`],
      ['Situação', situacao],
    ],
    secoes: [
      {
        titulo: 'Demonstrativo',
        colunas: [{ titulo: 'Linha', largura: 40 }, { titulo: 'Valor', tipo: 'moeda', largura: 18 }],
        linhas: [
          ['Receita bruta', m.receitaBruta],
          ['   Serviços da Porto', m.receitaServicos],
          ...m.receitasAvulsas.map(r => [`   ${r.categoria}`, r.valor]),
          ['(-) Despesas pagas', -m.totalDespesas],
          ...categorias.map(d => [`   ${d.categoria}`, -d.valor]),
        ],
        totais: ['Resultado operacional', m.lucro],
      },
      quadro('Serviços por especialidade', 'Especialidade',
        [...porEspecialidade].map(([nome, [q, v]]) => [nome, q, v] as [string, number, number])
          .sort((a, b) => b[2] - a[2] || b[1] - a[1])),
      quadro('Serviços por socorrista', 'Socorrista',
        ordenar(m.servicos.porSocorrista).map(l => [l.rotulo, l.quantidade ?? 0, l.valor])),
      quadro('Serviços por viatura', 'Viatura',
        ordenar(m.servicos.porViatura).map(l => [l.rotulo, l.quantidade ?? 0, l.valor])),
      {
        titulo: 'Conferência', metade: true,
        colunas: [{ titulo: 'Item', largura: 30 }, { titulo: 'Quantidade', tipo: 'numero', largura: 12 }],
        linhas: [
          ['OPs no período', numerosOps.length],
          ['Serviços com valor', m.servicos.comValor],
          ['Serviços aguardando OP', m.servicos.semValor],
          ['Serviços sem viatura', semViatura],
          ['Serviços sem socorrista', semSocorrista],
          ['Despesas pagas (lançamentos)', m.despesas.reduce((t, d) => t + d.itens.length, 0)],
        ],
      },
      // So no Excel: o detalhe para conferir linha a linha.
      {
        titulo: 'Serviços', aba: 'Serviços',
        colunas: [
          { titulo: 'Data', tipo: 'data', largura: 12 }, { titulo: 'OS', largura: 16 },
          { titulo: 'Especialidade', largura: 22 }, { titulo: 'Socorrista', largura: 18 },
          { titulo: 'Viatura', largura: 10 }, { titulo: 'OP', largura: 12 }, { titulo: 'Valor', tipo: 'moeda', largura: 14 },
        ],
        linhas: m.servicos.lista.map(os => [os.dataAtendimento, os.numero, os.especialidade,
          curtos.get(os.motorista ?? '') ?? os.motorista ?? 'Sem socorrista', os.viatura ?? 'Sem viatura',
          os.numeroOp ?? 'Aguardando OP', os.semValor ? 'Sem valor' : valorDaOs(os)]),
        totais: ['Total', `${m.servicos.total} serviços`, null, null, null, null, m.servicos.valor],
        vazio: 'Nenhum serviço no período.',
      },
      {
        titulo: 'Viaturas', aba: 'Viaturas',
        colunas: [
          { titulo: 'Viatura', largura: 12 }, { titulo: 'Receita', tipo: 'moeda', largura: 16 },
          { titulo: 'Despesas da viatura', tipo: 'moeda', largura: 20 }, { titulo: 'Despesas gerais (rateio)', tipo: 'moeda', largura: 24 },
          { titulo: 'Resultado', tipo: 'moeda', largura: 16 }, { titulo: 'Margem', tipo: 'percentual', largura: 10 },
        ],
        linhas: m.viaturas.viaturas.map(v => [v.veiculo, v.receitas, v.despesasProprias, v.rateio, v.resultado, v.margem]),
        totais: ['Total', m.viaturas.viaturas.reduce((t, v) => t + v.receitas, 0), m.viaturas.viaturas.reduce((t, v) => t + v.despesasProprias, 0),
          m.viaturas.despesasGerais, m.viaturas.viaturas.reduce((t, v) => t + v.resultado, 0), null],
        vazio: 'Nenhuma viatura com lançamentos no período.',
      },
      {
        titulo: 'Despesas', aba: 'Despesas',
        colunas: [
          { titulo: 'Categoria', largura: 22 }, { titulo: 'Data', tipo: 'data', largura: 12 },
          { titulo: 'Descrição', largura: 34 }, { titulo: 'Viatura', largura: 10 }, { titulo: 'Valor', tipo: 'moeda', largura: 14 },
        ],
        linhas: m.despesas.flatMap(d => d.itens.map(l => [d.categoria, l.data, l.descricao, l.veiculo ?? '', l.valor])),
        totais: ['Total', null, null, null, m.totalDespesas],
        vazio: 'Nenhuma despesa paga no período.',
      },
    ],
    // Quinzena da OP: o arquivo leva os numeros das OPs, mais facil de achar na pasta.
    nomeArquivo: numerosOps.length ? `dre-OPs-${numerosOps.join('-')}` : `dre-${inicio}-a-${fim}`,
  }
}
