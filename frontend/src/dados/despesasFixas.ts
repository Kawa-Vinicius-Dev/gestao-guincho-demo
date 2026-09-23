import { api } from '../api/http'
import type { DespesaRecorrente, LancamentoRecorrente } from '../types/modelos'
import { excluirRegistro, ou, supabase } from './cliente'
import { invalidarCacheFinanceiro } from './dashboard'
import { moduloNoSupabase } from './modo'

/**
 * Despesas fixas: o molde, e o lancamento do mes a partir dele.
 *
 * Gerar o mes e RPC, nao insert em lote pelo cliente: precisa ser idempotente
 * (rodar duas vezes no mesmo mes nao pode duplicar) e resolver o dia 31 em
 * fevereiro. Regra que depende do estado do banco fica no banco.
 */

const COLUNAS = [
  'id', 'descricao', 'valor', 'dia_vencimento', 'ativo',
  'categoria_id', 'veiculo_id', 'motorista_id', 'observacoes',
  'total_parcelas', 'parcela_inicial', 'proxima_parcela',
  'categorias(nome)', 'veiculos(identificacao)', 'motoristas(nome)',
].join(',')

type Vinculo<T> = T | T[] | null
const um = <T,>(v: Vinculo<T>) => (!v ? undefined : Array.isArray(v) ? v[0] : v)

type Linha = {
  id: number; descricao: string; valor: number | string; dia_vencimento: number
  ativo: boolean; categoria_id: number; veiculo_id: number | null
  motorista_id: number | null; observacoes: string | null
  total_parcelas?: number | null; parcela_inicial?: number | null; proxima_parcela?: number | null
  categorias: Vinculo<{ nome: string }>
  veiculos: Vinculo<{ identificacao: string }>
  motoristas: Vinculo<{ nome: string }>
}

const paraModelo = (l: Linha): DespesaRecorrente => ({
  id: l.id,
  descricao: l.descricao,
  categoria: um(l.categorias)?.nome ?? '',
  categoriaId: l.categoria_id,
  valor: Number(l.valor),
  diaVencimento: l.dia_vencimento,
  veiculo: um(l.veiculos)?.identificacao,
  veiculoId: l.veiculo_id ?? undefined,
  motorista: um(l.motoristas)?.nome,
  motoristaId: l.motorista_id ?? undefined,
  observacoes: l.observacoes ?? undefined,
  ativo: l.ativo,
  totalParcelas: l.total_parcelas ?? undefined,
  parcelaInicial: l.parcela_inicial ?? undefined,
  proximaParcela: l.proxima_parcela ?? undefined,
})

export interface DadosDespesaFixa {
  descricao: string; categoriaId: number; valor: number; diaVencimento: number
  veiculoId?: number | null; motoristaId?: number | null; observacoes?: string | null
  /** As duas juntas ou nenhuma: "3 de 10" e parcelaInicial 3, totalParcelas 10. */
  parcelaInicial?: number | null; totalParcelas?: number | null
}

export async function listarDespesasFixas(): Promise<DespesaRecorrente[]> {
  if (!moduloNoSupabase('despesasFixas')) return api<DespesaRecorrente[]>('/api/despesas-recorrentes')

  const linhas = ou(
    await supabase().from('despesas_recorrentes').select(COLUNAS).order('descricao'),
    'Não foi possível carregar as despesas fixas.',
  ) as unknown as Linha[]
  return linhas.map(paraModelo)
}

export async function criarDespesaFixa(dados: DadosDespesaFixa): Promise<DespesaRecorrente> {
  if (!moduloNoSupabase('despesasFixas')) {
    return api<DespesaRecorrente>('/api/despesas-recorrentes', {
      method: 'POST', body: JSON.stringify(dados),
    })
  }
  const linha = ou(
    await supabase().from('despesas_recorrentes').insert({
      descricao: dados.descricao, categoria_id: dados.categoriaId, valor: dados.valor,
      dia_vencimento: dados.diaVencimento, veiculo_id: dados.veiculoId || null,
      motorista_id: dados.motoristaId || null, observacoes: dados.observacoes || null,
      total_parcelas: dados.totalParcelas || null, parcela_inicial: dados.totalParcelas ? (dados.parcelaInicial || 1) : null,
    }).select(COLUNAS).single(),
    'Não foi possível cadastrar a despesa fixa.',
  ) as unknown as Linha
  return paraModelo(linha)
}

export async function alternarAtivoDespesaFixa(fixa: DespesaRecorrente): Promise<DespesaRecorrente> {
  if (!moduloNoSupabase('despesasFixas')) {
    return api<DespesaRecorrente>(
      `/api/despesas-recorrentes/${fixa.id}/${fixa.ativo ? 'desativar' : 'reativar'}`,
      { method: 'PATCH' },
    )
  }
  const linha = ou(
    await supabase().from('despesas_recorrentes').update({ ativo: !fixa.ativo })
      .eq('id', fixa.id).select(COLUNAS).single(),
    'Não foi possível alterar a despesa fixa.',
  ) as unknown as Linha
  return paraModelo(linha)
}

export async function lancarDespesasFixasDoMes(mes: string): Promise<LancamentoRecorrente> {
  invalidarCacheFinanceiro()
  if (!moduloNoSupabase('despesasFixas')) {
    return api<LancamentoRecorrente>(`/api/despesas-recorrentes/lancamentos?mes=${mes}`, { method: 'POST' })
  }
  const r = ou(
    await supabase().rpc('lancar_despesas_recorrentes', { p_mes: `${mes}-01` }),
    'Não foi possível lançar as despesas fixas.',
  ) as { mes: string; lancadas: number; jaExistiam: number; valorLancado: number; encerradas?: number }
  return { ...r, despesas: [] }
}

export async function atualizarDespesaFixa(id: number, dados: DadosDespesaFixa): Promise<void> {
  ou(
    await supabase().from('despesas_recorrentes').update({
      descricao: dados.descricao, categoria_id: dados.categoriaId, valor: dados.valor,
      dia_vencimento: dados.diaVencimento, veiculo_id: dados.veiculoId || null,
      motorista_id: dados.motoristaId || null, observacoes: dados.observacoes || null,
      total_parcelas: dados.totalParcelas || null, parcela_inicial: dados.totalParcelas ? (dados.parcelaInicial || 1) : null,
    }).eq('id', id).select('id').single(),
    'Não foi possível salvar a despesa fixa.',
  )
}

/** As despesas ja lancadas a partir dela continuam; so o molde sai. */
export async function excluirDespesaFixa(id: number): Promise<void> {
  await excluirRegistro('despesas_recorrentes', id, 'Não foi possível excluir a despesa fixa.')
}

/**
 * Lanca, ja pagas, as fixas cujo vencimento deste mes ja chegou. O banco faz
 * isso sozinho todo dia; a tela chama ao abrir como garantia. Nao duplica.
 */
export async function lancarFixasVencidas(): Promise<number> {
  if (!moduloNoSupabase('despesasFixas')) return 0
  invalidarCacheFinanceiro()
  return Number(ou(
    await supabase().rpc('lancar_fixas_vencidas'),
    'Não foi possível lançar as despesas fixas do mês.',
  ) ?? 0)
}
