import type {
  AlimentacaoComissao, Comissao, DetalheSocorrista, ResumoComissao,
} from '../types/modelos'
import { invalidarCacheFinanceiro } from './cacheFinanceiro'
import { ou, supabase } from './cliente'
import { listarPeriodosDeOp } from './porto'
import { agruparPorPeriodo, type PeriodoPorto } from '../utils/periodos'


/**
 * Comissao da OP.
 *
 * A comissao fechava por ciclo do calendario: para saber quanto o socorrista
 * tinha a receber era preciso que alguem tivesse cadastrado o ciclo certo, com
 * a competencia certa, antes. Agora a pergunta e direta — chegou a OP, quem
 * trabalhou nela recebe a parte dele —, e a janela da alimentacao que abate e o
 * proprio periodo da OP.
 *
 * Tudo por RPC, e nao consulta direta, por dois motivos. O calculo cruza as OS
 * da OP com os gastos marcados do periodo, junta que nao cabe num
 * `.select()` sem virar varias idas. E o socorrista precisa ver o numero da OP
 * que pagou cada servico dele, e OP e tabela de administrador: a funcao le por
 * ele e devolve so as linhas dele, em vez de abrir o caixa da Porto inteiro.
 */

/**
 * O periodo das telas de comissao e a propria OP — a mesma listagem que o painel
 * Porto usa, reexportada aqui para as telas de comissao nao precisarem saber de
 * onde ela vem.
 */
export { listarPeriodosDeOp as listarOpsComissao }

/** Os periodos das telas de comissao: as OPs de cada quinzena juntas. */
export async function listarPeriodosComissao(): Promise<PeriodoPorto[]> {
  return agruparPorPeriodo(await listarPeriodosDeOp())
}

export async function lerComissaoDaOp(
  ordensPagamento: number[], motoristaId?: number,
): Promise<Comissao> {
  return ou(
    await supabase().rpc('comissao_das_ops', {
      p_op_ids: ordensPagamento,
      p_motorista_id: motoristaId ?? null,
    }),
    'Não foi possível carregar a comissão.',
  ) as Comissao
}

export async function resumirComissoes(
  ordensPagamento: number[], motoristaId?: number,
): Promise<ResumoComissao[]> {
  return ou(
    await supabase().rpc('resumo_comissoes_ops', {
      p_op_ids: ordensPagamento, p_motorista_id: motoristaId ?? null,
    }),
    'Não foi possível carregar o resumo de comissões.',
  ) as ResumoComissao[]
}

export async function obterDetalheSocorrista(
  motoristaId: number, ordensPagamento: number[],
): Promise<DetalheSocorrista> {
  return ou(
    await supabase().rpc('detalhe_socorrista_ops', {
      p_motorista_id: motoristaId, p_op_ids: ordensPagamento,
    }),
    'Não foi possível carregar o socorrista.',
  ) as DetalheSocorrista
}

export async function registrarAlimentacao(
  data: string, valor: number, observacoes?: string,
): Promise<AlimentacaoComissao> {
  const d = ou(
    await supabase().rpc('registrar_alimentacao', {
      p_data: data, p_valor: valor, p_observacoes: observacoes || null,
    }),
    'Não foi possível registrar a alimentação.',
  ) as Record<string, unknown>
  invalidarCacheFinanceiro()
  return {
    id: d.id as number,
    motoristaId: d.motorista_id as number,
    data: d.data_lancamento as string,
    valor: Number(d.valor),
    situacao: d.status as string,
    aprovada: d.aprovada as boolean,
    observacoes: (d.observacoes as string) ?? undefined,
  }
}
