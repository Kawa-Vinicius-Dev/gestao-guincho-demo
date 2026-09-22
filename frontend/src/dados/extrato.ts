import { api } from '../api/http'
import type { LancamentoFinanceiro } from '../types/modelos'
import { ou, supabase } from './cliente'
import { moduloNoSupabase } from './modo'

/**
 * Extrato: receita e despesa na mesma lista, ordenadas por data.
 *
 * Era um merge em Java sobre duas listas carregadas inteiras. Virou um `union
 * all` com os nomes ja resolvidos por join — o banco entrega a lista pronta,
 * ordenada, e o browser so desenha.
 */

type LinhaExtrato = {
  id: string
  tipo: 'RECEITA' | 'DESPESA'
  referencia_id: number
  descricao: string
  categoria: string
  valor: number | string
  data: string
  status: string
  realizado: boolean
  veiculo: string | null
  veiculo_id: number | null
  motorista: string | null
  origem: string
  protocolo: string | null
  motorista_id: number | null
  numero_op: string | null
}

export async function lerExtrato(inicio: string, fim: string): Promise<LancamentoFinanceiro[]> {
  if (!moduloNoSupabase('dashboard')) {
    return api<LancamentoFinanceiro[]>(`/api/lancamentos?inicio=${inicio}&fim=${fim}`)
  }
  const linhas = ou(
    await supabase().rpc('extrato_financeiro', { p_inicio: inicio, p_fim: fim }),
    'Não foi possível carregar o extrato.',
  ) as LinhaExtrato[]

  return linhas.map(l => ({
    id: l.id,
    tipo: l.tipo,
    referenciaId: l.referencia_id,
    descricao: l.descricao,
    categoria: l.categoria,
    valor: Number(l.valor),
    data: l.data,
    status: l.status,
    realizado: l.realizado,
    veiculo: l.veiculo ?? undefined,
    veiculoId: l.veiculo_id ?? undefined,
    motorista: l.motorista ?? undefined,
    origem: l.origem,
    protocolo: l.protocolo ?? undefined,
    motoristaId: l.motorista_id ?? undefined,
    numeroOp: l.numero_op ?? undefined,
  }))
}
