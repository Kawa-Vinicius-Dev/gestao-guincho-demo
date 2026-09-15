import { api } from '../api/http'
import type {
  AlimentacaoComissao, CalendarioPorto, Comissao, DetalheSocorrista,
  PagamentoComissao, ResumoComissao,
} from '../types/modelos'
import { ou, supabase } from './cliente'
import { moduloNoSupabase } from './modo'

/**
 * Comissao do ciclo.
 *
 * RPC, e nao consulta direta, por dois motivos. O calculo cruza OSs recebidas,
 * a OP que as pagou e as alimentacoes aprovadas do periodo — junta que nao cabe
 * num `.select()` sem virar varias idas. E o socorrista precisa ver o numero da
 * OP que pagou cada servico dele, e OP e tabela de administrador: a funcao le
 * por ele e devolve so as linhas dele, em vez de abrir o caixa da Porto inteiro.
 */

export async function lerComissaoDoCiclo(
  calendarioPagamentoId: number, motoristaId?: number,
): Promise<Comissao> {
  if (!moduloNoSupabase('comissoes')) {
    return motoristaId
      ? api<Comissao>(`/api/comissoes/${motoristaId}?calendarioPagamentoId=${calendarioPagamentoId}`)
      : api<Comissao>(`/api/minha-comissao?calendarioPagamentoId=${calendarioPagamentoId}`)
  }
  return ou(
    await supabase().rpc('comissao_do_ciclo', {
      p_calendario_id: calendarioPagamentoId,
      p_motorista_id: motoristaId ?? null,
    }),
    'Não foi possível carregar a comissão.',
  ) as Comissao
}

/** Os ciclos de pagamento. Leitura aberta a todo operador: e o seletor de periodo. */
export async function listarPeriodosComissoes(): Promise<CalendarioPorto[]> {
  if (!moduloNoSupabase('comissoes')) return api<CalendarioPorto[]>('/api/comissoes/periodos')

  const linhas = ou(
    await supabase().from('calendario_pagamentos_porto')
      .select('id,data_pagamento,competencia_inicio,competencia_fim,descricao,ativo,estimado,criado_em,atualizado_em')
      .eq('ativo', true).order('data_pagamento', { ascending: false }),
    'Não foi possível carregar os ciclos.',
  ) as Record<string, unknown>[]
  return linhas.map(l => ({
    id: l.id as number,
    dataPagamento: l.data_pagamento as string,
    competenciaInicio: l.competencia_inicio as string,
    competenciaFim: l.competencia_fim as string,
    descricao: l.descricao as string,
    ativo: l.ativo as boolean,
    estimado: l.estimado as boolean,
    criadoEm: l.criado_em as string,
    atualizadoEm: l.atualizado_em as string,
  }))
}

export async function resumirComissoes(
  calendarioPagamentoId: number, motoristaId?: number,
): Promise<ResumoComissao[]> {
  if (!moduloNoSupabase('comissoes')) {
    return api<ResumoComissao[]>(
      `/api/comissoes/resumo?calendarioPagamentoId=${calendarioPagamentoId}` +
      (motoristaId ? `&motoristaId=${motoristaId}` : ''))
  }
  return ou(
    await supabase().rpc('resumo_comissoes', {
      p_calendario_id: calendarioPagamentoId, p_motorista_id: motoristaId ?? null,
    }),
    'Não foi possível carregar o resumo de comissões.',
  ) as ResumoComissao[]
}

export async function obterDetalheSocorrista(
  motoristaId: number, calendarioPagamentoId: number,
): Promise<DetalheSocorrista> {
  if (!moduloNoSupabase('comissoes')) {
    return api<DetalheSocorrista>(
      `/api/equipe/${motoristaId}/detalhes?calendarioPagamentoId=${calendarioPagamentoId}`)
  }
  return ou(
    await supabase().rpc('detalhe_socorrista', {
      p_motorista_id: motoristaId, p_calendario_id: calendarioPagamentoId,
    }),
    'Não foi possível carregar o socorrista.',
  ) as DetalheSocorrista
}

export async function registrarAlimentacao(
  data: string, valor: number, observacoes?: string,
): Promise<AlimentacaoComissao> {
  if (!moduloNoSupabase('comissoes')) {
    return api<AlimentacaoComissao>('/api/minha-comissao/alimentacoes', {
      method: 'POST', body: JSON.stringify({ data, valor, observacoes: observacoes || null }),
    })
  }
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
  motoristaId: number, calendarioPagamentoId: number, dataPagamento: string,
  formaPagamento?: string, observacoes?: string,
): Promise<PagamentoComissao> {
  if (!moduloNoSupabase('comissoes')) {
    return api<PagamentoComissao>(
      `/api/comissoes/${motoristaId}/pagamentos?calendarioPagamentoId=${calendarioPagamentoId}`,
      { method: 'POST', body: JSON.stringify({
          dataPagamento, formaPagamento: formaPagamento || null, observacoes: observacoes || null }) })
  }
  const p = ou(
    await supabase().rpc('pagar_comissao', {
      p_motorista_id: motoristaId, p_calendario_id: calendarioPagamentoId,
      p_data_pagamento: dataPagamento, p_forma_pagamento: formaPagamento || null,
      p_observacoes: observacoes || null,
    }),
    'Não foi possível registrar o pagamento.',
  ) as Record<string, unknown>
  return {
    id: p.id as number,
    motoristaId: p.motorista_id as number,
    calendarioPagamentoId: p.calendario_pagamento_id as number,
    despesaId: p.despesa_id as number,
    valorPago: Number(p.valor_pago),
    dataPagamento: p.data_pagamento as string,
    formaPagamento: (p.forma_pagamento as string) ?? undefined,
    observacoes: (p.observacoes as string) ?? undefined,
    pagoPor: '',
    criadoEm: p.criado_em as string,
  }
}
