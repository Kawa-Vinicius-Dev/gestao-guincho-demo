import { http, HttpResponse } from 'msw'
import { agruparPorPeriodo } from '../utils/periodos'
import type { OrdemPagamentoPorto } from '../types/modelos'

/** A OP como a view `porto_ops_conciliadas` devolve, so com o que o periodo usa. */
export interface OpDeTeste {
  id: number
  numero: string
  periodo_inicio?: string | null
  periodo_fim?: string | null
  data_pagamento_programada?: string | null
}

/**
 * `porto_periodos` a partir das OPs de um teste. O banco agrupa as quinzenas;
 * aqui o agrupamento em TypeScript faz o papel dele, com a mesma regra, para os
 * testes continuarem descrevendo OPs e nao quinzenas prontas.
 */
export function rpcPeriodos(base: string, ops: OpDeTeste[]) {
  const modelos = ops.map(o => ({
    id: o.id, numero: o.numero, valorTotal: 0, situacao: 'RECEBIDO',
    quantidadeOrdensServico: 0, valorOrdensServico: 0, divergencia: 0, statusConciliacao: 'CONCILIADA',
    periodoInicio: o.periodo_inicio ?? undefined, periodoFim: o.periodo_fim ?? undefined,
    dataPagamentoProgramada: o.data_pagamento_programada ?? undefined,
  })) as OrdemPagamentoPorto[]
  return http.post(`${base}/rest/v1/rpc/porto_periodos`, () => HttpResponse.json(
    agruparPorPeriodo(modelos).map(p => ({
      inicio: p.periodoInicio, fim: p.periodoFim, tem_op: true, op_ids: p.ids, op_numeros: p.numeros,
    }))))
}
