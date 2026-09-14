import { api } from '../api/http'
import { resumirOrdensPagamentoPorto } from '../api/porto'
import type { Dashboard } from '../types/modelos'
import { ou, supabase } from './cliente'
import { moduloNoSupabase } from './modo'

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
 * pagina e nao tem como ser invalidado quando a pessoa sai. O Map abaixo morre
 * junto com a aba, que e o comportamento certo para numero de caixa.
 *
 * Serve para a troca de periodo ida-e-volta nao repetir a consulta, e para a
 * tela pintar na hora enquanto revalida por baixo.
 */
const VALIDADE_MS = 60_000
const cache = new Map<string, { em: number; dados: ResumoDashboard }>()

const chave = (inicio: string, fim: string) => `${inicio}|${fim}`

/** O que ja se sabe sobre o periodo, para pintar antes da resposta chegar. */
export function dashboardEmCache(inicio: string, fim: string): ResumoDashboard | undefined {
  return cache.get(chave(inicio, fim))?.dados
}

/**
 * Chamado por quem muda dinheiro: aprovar, pagar, receber, lancar. Sem isto o
 * cache serviria por ate um minuto um total que a propria pessoa acabou de
 * alterar — e o numero errado logo depois da acao e pior do que a espera.
 */
export function invalidarCacheFinanceiro() {
  cache.clear()
}

export async function lerDashboard(
  inicio: string, fim: string, opcoes: { forcar?: boolean } = {},
): Promise<ResumoDashboard> {
  const k = chave(inicio, fim)
  const guardado = cache.get(k)
  if (!opcoes.forcar && guardado && Date.now() - guardado.em < VALIDADE_MS) {
    return guardado.dados
  }

  const dados = moduloNoSupabase('dashboard')
    ? await peloSupabase(inicio, fim)
    : await peloRender(inicio, fim)

  cache.set(k, { em: Date.now(), dados })
  return dados
}

async function peloSupabase(inicio: string, fim: string): Promise<ResumoDashboard> {
  const resposta = ou(
    await supabase().rpc('dashboard_resumo', { p_inicio: inicio, p_fim: fim }),
    'Não foi possível carregar os indicadores.',
  ) as { financeiro: Dashboard; porto: ResumoPortoDashboard }
  return { financeiro: resposta.financeiro, porto: resposta.porto }
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
export async function lerIndicadores(inicio: string, fim: string): Promise<Dashboard> {
  if (!moduloNoSupabase('dashboard')) {
    return api<Dashboard>(`/api/dashboard?inicio=${inicio}&fim=${fim}`)
  }
  return ou(
    await supabase().rpc('dashboard_financeiro', { p_inicio: inicio, p_fim: fim }),
    'Não foi possível carregar os indicadores.',
  ) as Dashboard
}
