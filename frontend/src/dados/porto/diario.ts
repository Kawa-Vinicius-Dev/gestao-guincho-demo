import { ou, supabase } from '../cliente'
import { lerPainelDiarioPorto } from './painelDiario'

/**
 * Diario Operacional: a colagem da consulta de servicos da Porto.
 *
 * A Porto entrega a consulta por dia; colar de uma vez um intervalo grande
 * costuma vir truncado pela propria tela de origem, e o erro so apareceria como
 * "dia sem servico" semanas depois, na conciliacao com a OP. Por isso o limite
 * combinado: no maximo 15 dias por colagem.
 */
export const LIMITE_DE_DIAS = 15

/** Primeiro dia com historico na Porto. */
export const INICIO_DO_HISTORICO = '2026-03-30'

export interface DiaDoDiario {
  dia: string
  /** O painel daquele dia ja foi colado alguma vez. */
  importado: boolean
  importadoEm?: string
  os: number
  /** OS do dia ainda sem valor (nem manual, nem de OP). */
  semValor: number
}

export async function mapaDoDiario(inicio: string, fim: string): Promise<DiaDoDiario[]> {
  const linhas = ou(
    await supabase().rpc('porto_diario_mapa', { p_inicio: inicio, p_fim: fim }),
    'Não foi possível carregar os dias do Diário.',
  ) as { dia: string; importado: boolean; importado_em?: string; os: number; sem_valor: number }[]
  return (linhas ?? []).map(l => ({
    dia: l.dia, importado: l.importado, importadoEm: l.importado_em ?? undefined,
    os: l.os, semValor: l.sem_valor,
  }))
}

export interface DiasColados {
  dias: string[]
  inicio: string
  fim: string
  /** Quantos dias o intervalo cobre, contando as pontas. */
  intervalo: number
  servicos: number
}

/**
 * Que dias vieram na colagem, antes de gravar qualquer coisa.
 *
 * A leitura acontece aqui no navegador: se a colagem passar do limite, nem
 * chega a virar previa no banco.
 */
export async function diasColados(conteudo: string): Promise<DiasColados> {
  const { linhas } = await lerPainelDiarioPorto(conteudo)
  const dias = [...new Set(linhas.map(l => l.dados.data_atendimento).filter(Boolean))].sort()
  if (!dias.length) throw new Error('O conteúdo colado não tem nenhuma data de atendimento.')
  const inicio = dias[0], fim = dias[dias.length - 1]
  const dia = 24 * 60 * 60 * 1000
  const intervalo = Math.round((Date.parse(`${fim}T12:00:00`) - Date.parse(`${inicio}T12:00:00`)) / dia) + 1
  return { dias, inicio, fim, intervalo, servicos: linhas.length }
}
