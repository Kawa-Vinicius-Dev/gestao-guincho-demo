import { invalidarCacheFinanceiro } from './cacheFinanceiro'
import { ou, supabase } from './cliente'
import { anexarComprovante } from './comprovantes'
import type { Despesa } from '../types/modelos'

/**
 * Multas (Kawa, 15/10/2026). A multa e uma despesa da categoria Multas, com o
 * numero do auto no protocolo. O banco acha quem estava com a viatura pelo
 * turno aberto naquele horario; o administrador confirma ou escolhe.
 */

export interface QuemDirigia {
  turnoId: number
  motoristaId: number
  socorrista: string
  abertoEm: string
  fechadoEm: string | null
}

export interface Multa {
  id: number
  auto: string
  valor: number
  data: string
  vencimento: string | null
  situacao: 'PENDENTE' | 'PAGO' | 'ATRASADO' | 'REJEITADO'
  dataPagamento: string | null
  descontaComissao: boolean
  veiculoId: number | null
  viatura: string | null
  motoristaId: number | null
  socorrista: string | null
  temComprovante: boolean
}

export async function quemEstavaNaViatura(veiculoId: number, data: string, hora: string): Promise<QuemDirigia[]> {
  return (ou(
    await supabase().rpc('quem_estava_na_viatura', { p_veiculo_id: veiculoId, p_data: data, p_hora: hora }),
    'Não foi possível ver quem estava com a viatura.',
  ) as QuemDirigia[] | null) ?? []
}

export async function registrarMulta(dados: {
  veiculoId: number
  data: string
  hora: string
  valor: number
  auto: string
  vencimento?: string | null
  motoristaId?: number | null
  descontaComissao: boolean
  observacoes?: string
  notificacao?: File | null
}): Promise<{ semNotificacao?: string }> {
  const despesa = ou(
    await supabase().rpc('registrar_multa', {
      p_veiculo_id: dados.veiculoId,
      p_data: dados.data,
      p_hora: dados.hora,
      p_valor: dados.valor,
      p_auto: dados.auto.trim(),
      p_vencimento: dados.vencimento || null,
      p_motorista_id: dados.motoristaId || null,
      p_desconta_comissao: dados.descontaComissao,
      p_observacoes: dados.observacoes?.trim() || null,
    }),
    'Não foi possível lançar a multa.',
  ) as { id: number }
  invalidarCacheFinanceiro()
  // A foto da notificacao vai como comprovante da despesa, pelo mesmo caminho
  // das outras. Se falhar, a multa ja esta lancada: a tela avisa e segue.
  if (dados.notificacao) {
    try {
      await anexarComprovante({ id: despesa.id } as Despesa, dados.notificacao)
    } catch (e) {
      return { semNotificacao: (e as Error).message }
    }
  }
  return {}
}

export async function listarMultas(inicio: string, fim: string): Promise<Multa[]> {
  const linhas = (ou(
    await supabase().rpc('listar_multas', { p_inicio: inicio, p_fim: fim }),
    'Não foi possível carregar as multas.',
  ) as Record<string, unknown>[] | null) ?? []
  return linhas.map(l => ({ ...(l as unknown as Multa), valor: Number(l.valor) }))
}
