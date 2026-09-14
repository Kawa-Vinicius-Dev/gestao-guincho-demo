import { api } from '../api/http'
import type { Receita } from '../types/modelos'
import { ou, supabase } from './cliente'
import { moduloNoSupabase } from './modo'

/**
 * Receitas.
 *
 * A regra que decide se uma receita pode ser editada ou excluida nao esta mais
 * na tela nem no servico: `manual` e uma coluna gerada pelo banco, derivada da
 * origem (nasceu de uma OS da Porto? de uma importacao?). A tela le a coluna
 * para esconder os botoes, e a policy recusa a escrita de qualquer jeito —
 * esconder o botao e cortesia, a recusa e a garantia.
 */

const COLUNAS = [
  'id', 'descricao', 'valor', 'data_competencia', 'data_recebimento', 'status',
  'recorrente', 'observacoes', 'manual', 'contratante_id', 'categoria_id',
  'veiculo_id', 'conta_receber_id',
  'contratantes(nome)', 'categorias(nome)', 'veiculos(identificacao)',
].join(',')

type Vinculo<T> = T | T[] | null
type LinhaReceita = {
  id: number
  descricao: string
  valor: number | string
  data_competencia: string
  data_recebimento: string | null
  status: Receita['status']
  recorrente: boolean
  observacoes: string | null
  manual: boolean
  contratante_id: number | null
  categoria_id: number | null
  veiculo_id: number | null
  conta_receber_id: number | null
  contratantes: Vinculo<{ nome: string }>
  categorias: Vinculo<{ nome: string }>
  veiculos: Vinculo<{ identificacao: string }>
}

function um<T>(vinculo: Vinculo<T>): T | undefined {
  if (!vinculo) return undefined
  return Array.isArray(vinculo) ? vinculo[0] : vinculo
}

function paraModelo(linha: LinhaReceita): Receita {
  return {
    id: linha.id,
    descricao: linha.descricao,
    valor: Number(linha.valor),
    dataCompetencia: linha.data_competencia,
    dataRecebimento: linha.data_recebimento ?? undefined,
    status: linha.status,
    recorrente: linha.recorrente,
    contratante: um(linha.contratantes)?.nome,
    contratanteId: linha.contratante_id ?? undefined,
    categoria: um(linha.categorias)?.nome,
    categoriaId: linha.categoria_id ?? undefined,
    veiculo: um(linha.veiculos)?.identificacao,
    veiculoId: linha.veiculo_id ?? undefined,
    contaReceberId: linha.conta_receber_id ?? undefined,
    observacoes: linha.observacoes ?? undefined,
    manual: linha.manual,
  }
}

export interface DadosReceita {
  descricao: string
  valor: number
  dataCompetencia: string
  dataRecebimento?: string | null
  status: Receita['status']
  recorrente: boolean
  contratanteId?: number | null
  categoriaId?: number | null
  veiculoId?: number | null
  observacoes?: string | null
}

function paraBanco(dados: DadosReceita) {
  return {
    descricao: dados.descricao,
    valor: dados.valor,
    data_competencia: dados.dataCompetencia,
    data_recebimento: dados.dataRecebimento || null,
    status: dados.status,
    recorrente: dados.recorrente,
    contratante_id: dados.contratanteId || null,
    categoria_id: dados.categoriaId || null,
    veiculo_id: dados.veiculoId || null,
    observacoes: dados.observacoes || null,
  }
}

/** Mesmo motivo do teto das despesas: a tela nao pagina e a tabela so cresce. */
export const TETO_DA_LISTA = 300

export async function listarReceitas(): Promise<Receita[]> {
  if (!moduloNoSupabase('receitas')) return api<Receita[]>('/api/receitas')

  const linhas = ou(
    await supabase().from('receitas').select(COLUNAS)
      .order('data_competencia', { ascending: false })
      .order('id', { ascending: false })
      .limit(TETO_DA_LISTA),
    'Não foi possível carregar as receitas.',
  ) as unknown as LinhaReceita[]
  return linhas.map(paraModelo)
}

export async function criarReceita(dados: DadosReceita): Promise<Receita> {
  if (!moduloNoSupabase('receitas')) {
    return api<Receita>('/api/receitas', { method: 'POST', body: JSON.stringify(dados) })
  }
  const linha = ou(
    await supabase().from('receitas').insert(paraBanco(dados)).select(COLUNAS).single(),
    'Não foi possível registrar a receita.',
  ) as unknown as LinhaReceita
  return paraModelo(linha)
}

export async function atualizarReceita(id: number, dados: DadosReceita): Promise<Receita> {
  if (!moduloNoSupabase('receitas')) {
    return api<Receita>(`/api/receitas/${id}`, { method: 'PUT', body: JSON.stringify(dados) })
  }
  const linha = ou(
    await supabase().from('receitas').update(paraBanco(dados)).eq('id', id)
      .select(COLUNAS).single(),
    'Não foi possível salvar a receita.',
  ) as unknown as LinhaReceita
  return paraModelo(linha)
}

/**
 * Excluir so alcanca receita manual — a policy filtra por `manual` no USING.
 * Uma receita da Porto simplesmente nao e encontrada pelo delete, e o banco
 * responde "0 linhas". Sem o aviso abaixo isso passaria por sucesso silencioso:
 * a tela fecharia o dialogo e a linha continuaria na lista.
 */
export async function excluirReceita(id: number): Promise<void> {
  if (!moduloNoSupabase('receitas')) {
    await api(`/api/receitas/${id}`, { method: 'DELETE' })
    return
  }
  const apagadas = ou(
    await supabase().from('receitas').delete().eq('id', id).select('id'),
    'Não foi possível excluir a receita.',
  ) as { id: number }[]

  if (!apagadas.length) {
    const { ApiError } = await import('../api/http')
    throw new ApiError(
      'Receitas originadas da Porto ou de importação não podem ser excluídas manualmente.',
      403,
    )
  }
}
