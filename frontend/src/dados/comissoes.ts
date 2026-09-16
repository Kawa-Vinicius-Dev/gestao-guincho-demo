import type {
  AlimentacaoComissao, Comissao, DetalheSocorrista,
  OrdemPagamentoPorto, PagamentoComissao, ResumoComissao,
} from '../types/modelos'
import { invalidarCacheFinanceiro } from './cacheFinanceiro'
import { ou, supabase } from './cliente'


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
 * da OP com as alimentacoes aprovadas do periodo, junta que nao cabe num
 * `.select()` sem virar varias idas. E o socorrista precisa ver o numero da OP
 * que pagou cada servico dele, e OP e tabela de administrador: a funcao le por
 * ele e devolve so as linhas dele, em vez de abrir o caixa da Porto inteiro.
 */

export async function lerComissaoDaOp(
  ordemPagamentoId: number, motoristaId?: number,
): Promise<Comissao> {
  return ou(
    await supabase().rpc('comissao_da_op', {
      p_op_id: ordemPagamentoId,
      p_motorista_id: motoristaId ?? null,
    }),
    'Não foi possível carregar a comissão.',
  ) as Comissao
}

/**
 * As OPs que servem de periodo na tela de comissoes.
 *
 * Nao existe uma "lista de periodos" separada para manter em dia: o periodo
 * agora e a propria OP. A consulta e daqui, e nao emprestada da tela de ordens
 * de pagamento, porque a comissao nao pode depender do modulo Porto estar
 * ligado — quem ve a propria comissao nem alcanca aquela tela.
 *
 * So o suficiente para o seletor: numero e janela.
 */
export async function listarOpsComissao(): Promise<OrdemPagamentoPorto[]> {
  const linhas = ou(
    await supabase().from('porto_ops_conciliadas')
      .select('id,numero,valor_total,situacao_financeira,periodo_inicio,periodo_fim,data_pagamento_programada')
      .order('periodo_fim', { ascending: false, nullsFirst: false }),
    'Não foi possível carregar as ordens de pagamento.',
  ) as Record<string, unknown>[]

  return linhas.map(l => ({
    id: l.id as number,
    numero: l.numero as string,
    valorTotal: Number(l.valor_total ?? 0),
    situacao: l.situacao_financeira as OrdemPagamentoPorto['situacao'],
    quantidadeOrdensServico: 0,
    valorOrdensServico: 0,
    divergencia: 0,
    statusConciliacao: 'CONCILIADA',
    periodoInicio: (l.periodo_inicio as string) ?? undefined,
    periodoFim: (l.periodo_fim as string) ?? undefined,
    dataPagamentoProgramada: (l.data_pagamento_programada as string) ?? undefined,
  }))
}

export async function resumirComissoes(
  ordemPagamentoId: number, motoristaId?: number,
): Promise<ResumoComissao[]> {
  return ou(
    await supabase().rpc('resumo_comissoes_op', {
      p_op_id: ordemPagamentoId, p_motorista_id: motoristaId ?? null,
    }),
    'Não foi possível carregar o resumo de comissões.',
  ) as ResumoComissao[]
}

export async function obterDetalheSocorrista(
  motoristaId: number, ordemPagamentoId: number,
): Promise<DetalheSocorrista> {
  return ou(
    await supabase().rpc('detalhe_socorrista_op', {
      p_motorista_id: motoristaId, p_op_id: ordemPagamentoId,
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

export async function registrarPagamentoComissao(
  motoristaId: number, ordemPagamentoId: number, dataPagamento: string,
  formaPagamento?: string, observacoes?: string,
): Promise<PagamentoComissao> {
  const p = ou(
    await supabase().rpc('pagar_comissao_op', {
      p_motorista_id: motoristaId, p_op_id: ordemPagamentoId,
      p_data_pagamento: dataPagamento, p_forma_pagamento: formaPagamento || null,
      p_observacoes: observacoes || null,
    }),
    'Não foi possível registrar o pagamento.',
  ) as Record<string, unknown>
  const pagamento = {
    id: p.id as number,
    motoristaId: p.motorista_id as number,
    ordemPagamentoId: p.ordem_pagamento_id as number,
    despesaId: p.despesa_id as number,
    valorPago: Number(p.valor_pago),
    dataPagamento: p.data_pagamento as string,
    formaPagamento: (p.forma_pagamento as string) ?? undefined,
    observacoes: (p.observacoes as string) ?? undefined,
    pagoPor: '',
    criadoEm: p.criado_em as string,
  }
  // O repasse nasce como despesa paga: o resultado do periodo mudou.
  invalidarCacheFinanceiro()
  return pagamento
}
