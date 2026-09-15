import { api } from '../api/http'
import type { ContaReceber } from '../types/modelos'
import { invalidarCacheFinanceiro } from './dashboard'
import { ou, supabase } from './cliente'
import { moduloNoSupabase } from './modo'

/**
 * Contas a receber.
 *
 * Consulta direta, nao RPC: e um select com filtro e ordenacao, sem agregacao
 * nem regra que dependa de quem chama. Envolver isso numa funcao so adicionaria
 * uma camada para repassar parametros.
 *
 * Receber, ao contrario, e RPC: precisa recusar conta ja recebida ou cancelada
 * e gravar valor e data juntos.
 */

const COLUNAS = [
  'id', 'protocolo', 'descricao', 'valor_previsto', 'valor_recebido',
  'data_competencia', 'vencimento', 'data_recebimento', 'status', 'origem',
  'observacoes', 'importacao_id', 'veiculo_id',
  'contratantes(id,nome,ativo)', 'veiculos(id,identificacao,placa,custo_por_km,ativo)',
].join(',')

type Vinculo<T> = T | T[] | null
type LinhaConta = {
  id: number
  protocolo: string | null
  descricao: string
  valor_previsto: number | string
  valor_recebido: number | string | null
  data_competencia: string
  vencimento: string
  data_recebimento: string | null
  status: ContaReceber['status']
  origem: ContaReceber['origem']
  observacoes: string | null
  importacao_id: number | null
  veiculo_id: number | null
  contratantes: Vinculo<{ id: number; nome: string; ativo: boolean }>
  veiculos: Vinculo<{ id: number; identificacao: string; placa: string; custo_por_km: number | string; ativo: boolean }>
}

function um<T>(v: Vinculo<T>): T | undefined {
  if (!v) return undefined
  return Array.isArray(v) ? v[0] : v
}

function paraModelo(l: LinhaConta): ContaReceber {
  const previsto = Number(l.valor_previsto)
  const recebido = l.valor_recebido === null ? undefined : Number(l.valor_recebido)
  const contratante = um(l.contratantes)
  const veiculo = um(l.veiculos)
  return {
    id: l.id,
    contratante: contratante ?? { id: 0, nome: '', ativo: false },
    protocolo: l.protocolo ?? undefined,
    descricao: l.descricao,
    valorPrevisto: previsto,
    valorRecebido: recebido,
    // A diferenca era calculada no servidor; e subtracao dos dois campos que ja
    // vieram, entao nao vale uma coluna a mais no trafego.
    diferenca: recebido === undefined ? undefined : recebido - previsto,
    dataCompetencia: l.data_competencia,
    vencimento: l.vencimento,
    dataRecebimento: l.data_recebimento ?? undefined,
    status: l.status,
    veiculo: veiculo
      ? {
          id: veiculo.id, identificacao: veiculo.identificacao, placa: veiculo.placa,
          custoPorKm: Number(veiculo.custo_por_km), ativo: veiculo.ativo,
        }
      : undefined,
    observacoes: l.observacoes ?? undefined,
    origem: l.origem,
    importacaoId: l.importacao_id ?? undefined,
  }
}

export interface FiltroContas { status?: string; pesquisa?: string; sinal?: AbortSignal }

export async function listarContas(filtro: FiltroContas = {}): Promise<ContaReceber[]> {
  if (!moduloNoSupabase('dashboard')) {
    const params = new URLSearchParams({
      ...(filtro.status && { status: filtro.status }),
      ...(filtro.pesquisa && { pesquisa: filtro.pesquisa }),
    })
    return api<ContaReceber[]>(`/api/contas-receber?${params}`, { signal: filtro.sinal })
  }

  let consulta = supabase().from('contas_receber').select(COLUNAS)
  if (filtro.status) consulta = consulta.eq('status', filtro.status)
  if (filtro.pesquisa) {
    // A busca do backend olhava protocolo e descricao. `or` do PostgREST resolve
    // isso numa consulta; filtrar no browser exigiria trazer a tabela inteira.
    const termo = filtro.pesquisa.replace(/[%,()]/g, ' ').trim()
    if (termo) consulta = consulta.or(`protocolo.ilike.%${termo}%,descricao.ilike.%${termo}%`)
  }
  if (filtro.sinal) consulta = consulta.abortSignal(filtro.sinal)

  const linhas = ou(
    await consulta.order('vencimento', { ascending: true }).limit(300),
    'Não foi possível carregar as contas a receber.',
  ) as unknown as LinhaConta[]
  return linhas.map(paraModelo)
}

export async function receberConta(
  id: number, valorRecebido: number, dataRecebimento: string,
): Promise<void> {
  invalidarCacheFinanceiro()
  if (!moduloNoSupabase('dashboard')) {
    await api(`/api/contas-receber/${id}/receber`, {
      method: 'PATCH', body: JSON.stringify({ valorRecebido, dataRecebimento }),
    })
    return
  }
  ou(
    await supabase().rpc('receber_conta', {
      p_conta_id: id, p_valor_recebido: valorRecebido, p_data_recebimento: dataRecebimento,
    }),
    'Não foi possível registrar o recebimento.',
  )
}

export interface DadosConta {
  contratanteId: number
  protocolo?: string | null
  descricao: string
  valorPrevisto: number
  dataCompetencia: string
  vencimento: string
  veiculoId?: number | null
  observacoes?: string | null
  origem?: 'MANUAL' | 'IMPORTADA'
}

export async function criarConta(dados: DadosConta): Promise<ContaReceber> {
  invalidarCacheFinanceiro()
  if (!moduloNoSupabase('dashboard')) {
    return api<ContaReceber>('/api/contas-receber', { method: 'POST', body: JSON.stringify(dados) })
  }
  const linha = ou(
    await supabase().from('contas_receber').insert({
      contratante_id: dados.contratanteId,
      protocolo: dados.protocolo || null,
      descricao: dados.descricao,
      valor_previsto: dados.valorPrevisto,
      data_competencia: dados.dataCompetencia,
      vencimento: dados.vencimento,
      veiculo_id: dados.veiculoId || null,
      observacoes: dados.observacoes || null,
      origem: dados.origem ?? 'MANUAL',
    }).select(COLUNAS).single(),
    'Não foi possível registrar a conta.',
  ) as unknown as LinhaConta
  return paraModelo(linha)
}
