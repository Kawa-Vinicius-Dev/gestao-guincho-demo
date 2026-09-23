import type { Dashboard } from '../types/modelos'
import { entradaDoCacheFinanceiro, geracaoDoCacheFinanceiro, guardarNoCacheFinanceiro } from './cacheFinanceiro'
import { ou, supabase } from './cliente'

export { invalidarCacheFinanceiro } from './cacheFinanceiro'

/**
 * Indicadores do periodo.
 *
 * A tela abria com duas requisicoes — indicadores financeiros e resumo Porto —
 * que acontecem sempre juntas e sempre no mesmo periodo. No Supabase e uma
 * chamada: `dashboard_resumo` devolve os dois blocos ja somados pelo banco.
 *
 * O que chega e o resultado, nao as linhas. O caminho antigo carregava contas,
 * receitas, despesas, quilometragens e OSs do periodo inteiro para a memoria do
 * servidor e somava la; aqui o Postgres soma e responde alguns kilobytes.
 */

export interface ResumoDashboard {
  financeiro: Dashboard
}

/**
 * Cache em memoria, e so em memoria.
 *
 * Nada disto vai para localStorage: sao receita, lucro e margem da operacao, e
 * localStorage sobrevive ao fim da sessao, fica legivel para qualquer script da
 * pagina e nao tem como ser invalidado quando a pessoa sai. O armazenamento em
 * memoria morre junto com a aba, que e o comportamento certo para numero de caixa.
 *
 * Serve para a troca de periodo ida-e-volta nao repetir a consulta, e para a
 * tela pintar na hora enquanto revalida por baixo.
 */
const VALIDADE_MS = 60_000

/**
 * `porCompetencia` vem de utils/modoDoPeriodo: o mesmo periodo conta diferente
 * pela competencia e pela data do servico, entao cada modo tem a sua entrada.
 */
const chave = (inicio: string, fim: string, porCompetencia: boolean) =>
  `${inicio}|${fim}|${porCompetencia ? 'competencia' : 'data'}`

/** O que ja se sabe sobre o periodo, para pintar antes da resposta chegar. */
export function dashboardEmCache(inicio: string, fim: string, porCompetencia = true): ResumoDashboard | undefined {
  return entradaDoCacheFinanceiro<ResumoDashboard>(chave(inicio, fim, porCompetencia))?.dados
}

export async function lerDashboard(
  inicio: string, fim: string, opcoes: { forcar?: boolean; porCompetencia?: boolean } = {},
): Promise<ResumoDashboard> {
  const porCompetencia = opcoes.porCompetencia ?? true
  const k = chave(inicio, fim, porCompetencia)
  const guardado = entradaDoCacheFinanceiro<ResumoDashboard>(k)
  if (!opcoes.forcar && guardado && Date.now() - guardado.em < VALIDADE_MS) {
    return guardado.dados
  }

  const geracaoDoPedido = geracaoDoCacheFinanceiro()
  const dados = await peloSupabase(inicio, fim, porCompetencia)

  guardarNoCacheFinanceiro(k, dados, geracaoDoPedido)
  return dados
}

async function peloSupabase(inicio: string, fim: string, porCompetencia: boolean): Promise<ResumoDashboard> {
  const resposta = ou(
    await supabase().rpc('dashboard_resumo', { p_inicio: inicio, p_fim: fim, p_por_competencia: porCompetencia }),
    'Não foi possível carregar os indicadores.',
  ) as { financeiro: Dashboard }
  return { financeiro: resposta.financeiro }
}

/** So os indicadores, para a DRE e a tela de Veiculos, que nao mostram Porto. */
export async function lerIndicadores(inicio: string, fim: string, porCompetencia = true): Promise<Dashboard> {
  return ou(
    await supabase().rpc('dashboard_financeiro', { p_inicio: inicio, p_fim: fim, p_por_competencia: porCompetencia }),
    'Não foi possível carregar os indicadores.',
  ) as Dashboard
}
