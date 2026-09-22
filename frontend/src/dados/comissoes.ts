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

/**
 * Os periodos do proprio socorrista.
 *
 * `listarPeriodosComissao` le as OPs, e OP e tabela de administrador: para o
 * socorrista ela vinha vazia, e "Minha comissao" ficava parada em "Selecione".
 * A RPC devolve so as OPs em que ele tem servico, com numero e periodo, sem
 * valor nenhum.
 */
export async function listarMeusPeriodosComissao(): Promise<PeriodoPorto[]> {
  const linhas = ou(
    await supabase().rpc('meus_periodos_de_op'),
    'Não foi possível carregar os seus períodos.',
  ) as {
    id: number; numero: string; periodo_inicio: string | null; periodo_fim: string | null
    data_pagamento_programada: string | null
  }[]
  return agruparPorPeriodo((linhas ?? []).map(l => ({
    id: l.id, numero: l.numero, valorTotal: 0, situacao: 'RECEBIDO',
    quantidadeOrdensServico: 0, valorOrdensServico: 0, divergencia: 0,
    statusConciliacao: 'CONCILIADA',
    periodoInicio: l.periodo_inicio ?? undefined,
    periodoFim: l.periodo_fim ?? undefined,
    dataPagamentoProgramada: l.data_pagamento_programada ?? undefined,
  })))
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

/**
 * Comissao prevista da competencia: 20% do que ainda nao entrou em OP.
 *
 * Nao e promessa de pagamento — e a leitura do que vem, com o valor informado a
 * mao. Quem paga e a OP: quando ela chega, a mesma OS sai daqui e entra na
 * comissao confirmada, que vira despesa.
 */
export interface ComissaoPrevista {
  motoristaId: number
  socorrista: string
  servicos: number
  /** Serviços da conta que ainda estão sem valor nenhum. */
  semValor: number
  valorPrevisto: number
  comissaoPrevista: number
}

/**
 * Tira (ou devolve) a comissao de uma OS.
 *
 * Vale mesmo depois de a OS ter entrado numa OP: a comissao daquela OP e
 * refeita na hora e o liquido do socorrista baixa. E o caso de uma OS que caiu
 * no nome dele sem caber comissao, percebido so depois do pagamento.
 */
export async function definirComissaoDaOs(osId: number, semComissao: boolean): Promise<void> {
  invalidarCacheFinanceiro()
  ou(
    await supabase().rpc('porto_definir_comissao_da_os', {
      p_os_id: osId, p_sem_comissao: semComissao,
    }),
    semComissao ? 'Não foi possível tirar a comissão desta OS.' : 'Não foi possível devolver a comissão desta OS.',
  )
}

export async function listarComissaoPrevista(
  inicio: string, fim: string, motoristaId?: number,
): Promise<ComissaoPrevista[]> {
  const linhas = ou(
    await supabase().rpc('porto_comissao_prevista', {
      p_inicio: inicio, p_fim: fim, p_motorista_id: motoristaId ?? null,
    }),
    'Não foi possível carregar a comissão prevista.',
  ) as { motorista_id: number; socorrista: string; servicos: number; sem_valor: number
         valor_previsto: number; comissao_prevista: number }[]
  return (linhas ?? []).map(l => ({
    motoristaId: l.motorista_id, socorrista: l.socorrista,
    servicos: Number(l.servicos), semValor: Number(l.sem_valor),
    valorPrevisto: Number(l.valor_previsto), comissaoPrevista: Number(l.comissao_prevista),
  }))
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

// ---------------------------------------------------------------- % por OP
/**
 * A % de comissao de cada OP do periodo. `percentual` vazio: a OP nao tem % propria
 * e vale a de cada socorrista (ou o padrao da empresa).
 */
export interface PercentualDaOp { id: number; numero: string; percentual: number | null }

export async function listarPercentuaisDasOps(ids: number[]): Promise<PercentualDaOp[]> {
  if (!ids.length) return []
  const linhas = ou(
    await supabase().from('ordens_pagamento_porto').select('id,numero,percentual_comissao')
      .in('id', ids).order('numero'),
    'Não foi possível carregar a porcentagem das OPs.',
  ) as { id: number; numero: string; percentual_comissao: number | string | null }[]
  return linhas.map(l => ({
    id: l.id, numero: l.numero,
    percentual: l.percentual_comissao === null ? null : Number(l.percentual_comissao),
  }))
}

/** Define (ou tira, com null) a % da OP. A comissao dela e refeita na hora. */
export async function definirPercentualDaOp(opId: number, percentual: number | null): Promise<void> {
  invalidarCacheFinanceiro()
  ou(
    await supabase().rpc('definir_percentual_da_op', { p_op_id: opId, p_percentual: percentual }),
    'Não foi possível salvar a porcentagem da OP.',
  )
}

export async function lerPercentualPadrao(): Promise<number> {
  const linha = ou(
    await supabase().from('configuracao_comissao').select('percentual_padrao').maybeSingle(),
    'Não foi possível ler a comissão padrão.',
  ) as { percentual_padrao: number | string } | null
  return linha ? Number(linha.percentual_padrao) : 0.2
}

export async function definirPercentualPadrao(percentual: number): Promise<void> {
  invalidarCacheFinanceiro()
  ou(
    await supabase().rpc('definir_percentual_padrao', { p_percentual: percentual }),
    'Não foi possível salvar a comissão padrão.',
  )
}
