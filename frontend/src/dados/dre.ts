import type { LinhaFaturamento } from '../components/Graficos'
import type { Dashboard, LancamentoFinanceiro, Veiculo } from '../types/modelos'
import { nomesCurtos } from '../utils/nomes'
import type { Relatorio } from './exportar'
import { faturamentoPorGrupo } from './porto/faturamento'
import { valorDaOs, type LinhaOs } from './porto/listaOs'
import { data as formatarData, moeda } from '../utils/formatadores'

/**
 * A DRE, montada num lugar so para a tela e para o Excel/PDF.
 *
 * Kawa, 23/09/2026: "a DRE tem que conter tudo detalhadamente" — os servicos
 * prestados (com valor, ou "sem valor" enquanto a OP nao chega) e as despesas
 * discriminadas por gasto, de forma simplificada. O tamanho depende do periodo:
 * ate 8 dias, servico por servico ("a diaria vai imprimir um a um? sim"); acima
 * disso, o resumo por socorrista e por viatura ("o mensal vai imprimir 500
 * servicos um a um? fica ruim").
 */
export const DIAS_PARA_DETALHAR = 8

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
    /** Periodo curto: a lista inteira, um a um. */
    detalhado: boolean
    lista: LinhaOs[]
    porSocorrista: LinhaFaturamento[]
    porViatura: LinhaFaturamento[]
  }
  despesas: CategoriaDaDre[]
}

export function diasDoPeriodo(inicio: string, fim: string): number {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000) + 1
}

export function montarDre(
  financeiro: Dashboard, extrato: LancamentoFinanceiro[], servicos: LinhaOs[],
  dias: number, veiculos: Veiculo[] = [],
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
      detalhado: dias <= DIAS_PARA_DETALHAR,
      lista: [...servicos].sort((a, b) => (a.dataAtendimento ?? '').localeCompare(b.dataAtendimento ?? '') || a.numero.localeCompare(b.numero)),
      porSocorrista: faturamentoPorGrupo(servicos, 'socorrista'),
      porViatura: faturamentoPorGrupo(servicos, 'viatura', veiculos),
    },
    despesas,
  }
}

/** A mesma DRE da tela, em Excel ou PDF. */
export function relatorioDaDre(m: MontagemDre, inicio: string, fim: string): Relatorio {
  const curtos = nomesCurtos(m.servicos.lista.map(os => os.motorista))
  const ordenar = (linhas: LinhaFaturamento[]) =>
    [...linhas].sort((a, b) => Number(a.semVinculo) - Number(b.semVinculo) || b.valor - a.valor)
  const resumoPor = (titulo: string, linhas: LinhaFaturamento[]) => ({
    titulo,
    colunas: [{ titulo: titulo.replace('Serviços por ', '').replace(/^./, c => c.toUpperCase()), largura: 26 },
      { titulo: 'Serviços', tipo: 'numero' as const, largura: 10 }, { titulo: 'Valor', tipo: 'moeda' as const, largura: 16 },
      { titulo: 'Observação', largura: 24 }],
    linhas: ordenar(linhas).map(l => [l.rotulo, l.quantidade ?? 0, l.valor, (l.detalhe ?? '').split(' · ')[1] ?? '']),
    totais: ['Total', m.servicos.total, m.servicos.valor, m.servicos.semValor ? `${m.servicos.semValor} sem valor` : ''],
    vazio: 'Nenhum serviço no período.',
  })

  return {
    titulo: 'DRE - Demonstrativo de resultado',
    subtitulo: `Período: ${formatarData(inicio)} a ${formatarData(fim)}`,
    resumo: [
      ['Receitas recebidas', moeda(m.receitaBruta)],
      ['Despesas pagas', moeda(m.totalDespesas)],
      ['Lucro operacional', moeda(m.lucro)],
      ['Margem', m.margem === null ? '—' : `${m.margem.toFixed(1).replace('.', ',')}%`],
      ['Serviços prestados', `${m.servicos.total}${m.servicos.semValor ? ` (${m.servicos.semValor} sem valor)` : ''}`],
    ],
    secoes: [
      {
        titulo: 'Resultado',
        colunas: [{ titulo: 'Linha', largura: 40 }, { titulo: 'Valor', tipo: 'moeda', largura: 18 }],
        linhas: [
          ['Receita bruta', m.receitaBruta],
          ['   Serviços da Porto', m.receitaServicos],
          ...m.receitasAvulsas.map(r => [`   ${r.categoria}`, r.valor]),
          ['(−) Despesas pagas', -m.totalDespesas],
          ...m.despesas.map(d => [`   ${d.categoria}`, -d.valor]),
        ],
        totais: ['Lucro operacional', m.lucro],
      },
      resumoPor('Serviços por socorrista', m.servicos.porSocorrista),
      ...(m.servicos.detalhado
        ? [{
            titulo: 'Serviços prestados, por socorrista',
            colunas: [
              { titulo: 'Socorrista', largura: 18 }, { titulo: 'Data', tipo: 'data' as const, largura: 12 },
              { titulo: 'OS', largura: 16 }, { titulo: 'Especialidade', largura: 16 },
              { titulo: 'Viatura', largura: 10 }, { titulo: 'OP', largura: 12 }, { titulo: 'Valor', tipo: 'moeda' as const, largura: 14 },
            ],
            linhas: [...m.servicos.lista]
              .map(os => ({ os, quem: curtos.get(os.motorista ?? '') ?? os.motorista ?? 'Sem socorrista' }))
              .sort((a, b) => Number(a.quem === 'Sem socorrista') - Number(b.quem === 'Sem socorrista')
                || a.quem.localeCompare(b.quem) || (a.os.dataAtendimento ?? '').localeCompare(b.os.dataAtendimento ?? ''))
              .map(({ os, quem }) => [quem, os.dataAtendimento, os.numero, os.especialidade, os.viatura ?? 'Sem viatura',
                os.numeroOp ?? 'Aguardando OP', os.semValor ? 'Sem valor' : valorDaOs(os)]),
            totais: ['Total', null, `${m.servicos.total} serviços`, null, null, null, m.servicos.valor],
            vazio: 'Nenhum serviço no período.',
          }]
        : [resumoPor('Serviços por viatura', m.servicos.porViatura)]),
      {
        titulo: 'Despesas pagas, gasto por gasto',
        colunas: [
          { titulo: 'Categoria', largura: 22 }, { titulo: 'Data', tipo: 'data', largura: 12 },
          { titulo: 'Descrição', largura: 34 }, { titulo: 'Viatura', largura: 10 }, { titulo: 'Valor', tipo: 'moeda', largura: 14 },
        ],
        linhas: m.despesas.flatMap(d => d.itens.map(l => [d.categoria, l.data, l.descricao, l.veiculo ?? '', l.valor])),
        totais: ['Total', null, null, null, m.despesas.reduce((t, d) => t + d.valor, 0)],
        vazio: 'Nenhuma despesa paga no período.',
      },
    ],
    nomeArquivo: `dre-${inicio}-a-${fim}`,
  }
}
