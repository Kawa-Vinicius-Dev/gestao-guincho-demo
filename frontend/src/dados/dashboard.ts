import { api } from '../api/http'
import { resumirOrdensPagamentoPorto } from '../api/porto'
import type { Dashboard } from '../types/modelos'
import { entradaDoCacheFinanceiro, geracaoDoCacheFinanceiro, guardarNoCacheFinanceiro } from './cacheFinanceiro'
import { ou, supabase } from './cliente'
import { moduloNoSupabase } from './modo'

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

/**
 * Do resumo Porto, a tela usa quatro numeros.
 *
 * O endpoint antigo devolvia vinte e dois — sem composicao, conciliadas, valor
 * acima, valor abaixo, vencidas, media por OP. Trafegar dezoito para descartar
 * dezoito e o tipo de heranca que nao vale a pena copiar.
 */
export interface ResumoPortoDashboard {
  quantidadeTotalOps: number
  valorTotalPrevisto: number
  valorProgramado: number
  valorRecebido: number
}

export interface ResumoDashboard {
  financeiro: Dashboard
  porto: ResumoPortoDashboard | null
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
  const dados = moduloNoSupabase('dashboard')
    ? await peloSupabase(inicio, fim, porCompetencia)
    : await peloRender(inicio, fim)

  guardarNoCacheFinanceiro(k, dados, geracaoDoPedido)
  return dados
}

async function peloSupabase(inicio: string, fim: string, porCompetencia: boolean): Promise<ResumoDashboard> {
  const resposta = ou(
    await supabase().rpc('dashboard_resumo', { p_inicio: inicio, p_fim: fim, p_por_competencia: porCompetencia }),
    'Não foi possível carregar os indicadores.',
  ) as { financeiro: Dashboard }
  // O resumo Porto saiu da chamada: a Visao geral nunca o usou (a aba Graficos
  // tem o dela). Continua no tipo so pelo caminho antigo do Render.
  return { financeiro: resposta.financeiro, porto: null }
}

/**
 * Caminho antigo: duas chamadas, e o resumo Porto podia falhar sozinho sem
 * derrubar os indicadores. Preservado inteiro para rollback.
 */
async function peloRender(inicio: string, fim: string): Promise<ResumoDashboard> {
  const [financeiro, porto] = await Promise.all([
    api<Dashboard>(`/api/dashboard?inicio=${inicio}&fim=${fim}`),
    resumirOrdensPagamentoPorto(new URLSearchParams({ dataInicio: inicio, dataFim: fim }))
      .catch(() => null),
  ])
  return { financeiro, porto }
}

/** So os indicadores, para a DRE e a tela de Veiculos, que nao mostram Porto. */
export async function lerIndicadores(inicio: string, fim: string, porCompetencia = true): Promise<Dashboard> {
  if (!moduloNoSupabase('dashboard')) {
    return api<Dashboard>(`/api/dashboard?inicio=${inicio}&fim=${fim}`)
  }
  return ou(
    await supabase().rpc('dashboard_financeiro', { p_inicio: inicio, p_fim: fim, p_por_competencia: porCompetencia }),
    'Não foi possível carregar os indicadores.',
  ) as Dashboard
}
