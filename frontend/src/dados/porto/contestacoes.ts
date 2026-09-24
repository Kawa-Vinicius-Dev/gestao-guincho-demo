import { ou, supabase } from '../cliente'

/**
 * Contestacao de glosa e pagamento a menos da Porto (Kawa, 24/09/2026).
 *
 * Cada caso e uma OS que a Porto nao pagou (nao veio na OP dela nem na seguinte)
 * ou pagou abaixo da tabela de precos. O banco detecta e fecha sozinho o que a
 * Porto acabou pagando; aqui a tela acompanha: contestei, aceitaram, perdi.
 */

export type TipoContestacao = 'NAO_PAGA' | 'PAGA_A_MENOS'
export type SituacaoContestacao = 'A_CONTESTAR' | 'CONTESTADA' | 'ACEITA' | 'PERDIDA'

export interface Contestacao {
  id: number
  tipo: TipoContestacao
  situacao: SituacaoContestacao
  valorEsperado: number | null
  valorPago: number
  /** Esperado menos pago; sem valor esperado, nao se sabe quanto falta. */
  diferenca: number | null
  prazo: string | null
  contestadaEm: string | null
  protocolo: string | null
  observacao: string | null
  resolvidaEm: string | null
  valorRecuperado: number | null
  os: {
    id: number
    numero: string
    data: string | null
    especialidade: string | null
    viatura: string | null
    motoristaId: number | null
    motorista: string | null
    numeroOp: string | null
  }
}

type Um<T> = T | T[] | null
const um = <T,>(v: Um<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v)
const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v))

type Linha = {
  id: number; tipo: TipoContestacao; situacao: SituacaoContestacao
  valor_esperado: string | number | null; valor_pago: string | number
  prazo: string | null; contestada_em: string | null; protocolo: string | null; observacao: string | null
  resolvida_em: string | null; valor_recuperado: string | number | null
  ordens_servico_porto: Um<{
    id: number; numero: string; data_atendimento: string | null; especialidade: string | null
    sigla_viatura: string | null; motorista_id: number | null
    motoristas: Um<{ nome: string }>; ordens_pagamento_porto: Um<{ numero: string }>
  }>
}

const COLUNAS = 'id,tipo,situacao,valor_esperado,valor_pago,prazo,contestada_em,protocolo,observacao,resolvida_em,valor_recuperado,'
  + 'ordens_servico_porto(id,numero,data_atendimento,especialidade,sigla_viatura,motorista_id,motoristas(nome),ordens_pagamento_porto(numero))'

function paraModelo(l: Linha): Contestacao {
  const os = um(l.ordens_servico_porto)
  const esperado = numero(l.valor_esperado)
  const pago = Number(l.valor_pago)
  return {
    id: l.id, tipo: l.tipo, situacao: l.situacao,
    valorEsperado: esperado, valorPago: pago,
    diferenca: esperado === null ? null : Math.max(esperado - pago, 0),
    prazo: l.prazo, contestadaEm: l.contestada_em, protocolo: l.protocolo, observacao: l.observacao,
    resolvidaEm: l.resolvida_em, valorRecuperado: numero(l.valor_recuperado),
    os: {
      id: os?.id ?? 0, numero: os?.numero ?? '—', data: os?.data_atendimento ?? null,
      especialidade: os?.especialidade ?? null, viatura: os?.sigla_viatura ?? null,
      motoristaId: os?.motorista_id ?? null, motorista: um(os?.motoristas ?? null)?.nome ?? null,
      numeroOp: um(os?.ordens_pagamento_porto ?? null)?.numero ?? null,
    },
  }
}

/** Cria os casos novos e fecha os que a Porto pagou. Devolve quantos casos novos. */
export async function detectarContestacoes(): Promise<number> {
  return Number(ou(await supabase().rpc('porto_detectar_contestacoes'), 'Não foi possível conferir as OPs.') ?? 0)
}

export async function listarContestacoes(): Promise<Contestacao[]> {
  const linhas = ou(
    await supabase().from('porto_contestacoes').select(COLUNAS).order('prazo', { ascending: true, nullsFirst: false }),
    'Não foi possível carregar as contestações.',
  ) as unknown as Linha[]
  return linhas.map(paraModelo)
}

export async function atualizarContestacao(id: number, mudanca: {
  situacao: SituacaoContestacao
  protocolo?: string | null
  observacao?: string | null
  contestadaEm?: string | null
  valorRecuperado?: number | null
  prazo?: string | null
}): Promise<void> {
  const corpo: Record<string, unknown> = { situacao: mudanca.situacao }
  if (mudanca.protocolo !== undefined) corpo.protocolo = mudanca.protocolo
  if (mudanca.observacao !== undefined) corpo.observacao = mudanca.observacao
  if (mudanca.contestadaEm !== undefined) corpo.contestada_em = mudanca.contestadaEm
  if (mudanca.valorRecuperado !== undefined) corpo.valor_recuperado = mudanca.valorRecuperado
  if (mudanca.prazo !== undefined) corpo.prazo = mudanca.prazo
  const atualizadas = ou(
    await supabase().from('porto_contestacoes').update(corpo).eq('id', id).select('id'),
    'Não foi possível salvar a contestação.',
  ) as { id: number }[]
  if (!atualizadas.length) throw new Error('Você não tem permissão para mudar contestações.')
}

export interface EspecialidadeVista {
  especialidade: string
  servicos: number
  /** O valor que a Porto mais pagou por ela: ajuda a preencher a tabela. */
  valorMaisComum: number | null
  valorTabela: number | null
}

export async function especialidadesVistas(): Promise<EspecialidadeVista[]> {
  const linhas = ou(await supabase().rpc('porto_especialidades_vistas'), 'Não foi possível carregar as especialidades.') as
    { especialidade: string; servicos: number; valor_mais_comum: string | null; valor_tabela: string | null }[]
  return (linhas ?? []).map(l => ({
    especialidade: l.especialidade, servicos: Number(l.servicos),
    valorMaisComum: numero(l.valor_mais_comum), valorTabela: numero(l.valor_tabela),
  }))
}

/** Grava o preco; `null` tira a especialidade da tabela. */
export async function salvarPreco(especialidade: string, valor: number | null): Promise<void> {
  ou(await supabase().rpc('porto_salvar_preco', { p_especialidade: especialidade, p_valor: valor }),
    'Não foi possível salvar o preço.')
}

/** Quantos casos ainda nao foram contestados: o numero do menu. */
export async function contestacoesAContestar(): Promise<number> {
  const { count, error } = await supabase().from('porto_contestacoes')
    .select('id', { count: 'exact', head: true }).eq('situacao', 'A_CONTESTAR')
  if (error) return 0
  return count ?? 0
}

/** Totais que a tela mostra no topo. */
export function resumoDasContestacoes(casos: Contestacao[], hoje: string) {
  const abertos = casos.filter(c => c.situacao === 'A_CONTESTAR' || c.situacao === 'CONTESTADA')
  const mes = hoje.slice(0, 7)
  const doMes = (c: Contestacao) => (c.resolvidaEm ?? '').slice(0, 7) === mes
  const emSete = new Date(`${hoje}T12:00:00`); emSete.setDate(emSete.getDate() + 7)
  const limite = emSete.toISOString().slice(0, 10)
  return {
    abertos: abertos.length,
    valorAberto: abertos.reduce((t, c) => t + (c.diferenca ?? 0), 0),
    semValorEsperado: abertos.filter(c => c.diferenca === null).length,
    vencendo: abertos.filter(c => c.prazo && c.prazo <= limite).length,
    recuperadoNoMes: casos.filter(c => c.situacao === 'ACEITA' && doMes(c)).reduce((t, c) => t + (c.valorRecuperado ?? 0), 0),
    perdidoNoMes: casos.filter(c => c.situacao === 'PERDIDA' && doMes(c)).reduce((t, c) => t + (c.diferenca ?? 0), 0),
  }
}
