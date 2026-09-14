import { api } from '../api/http'
import type { Comissao } from '../types/modelos'
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
