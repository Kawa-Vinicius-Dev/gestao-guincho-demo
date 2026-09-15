import { api } from '../api/http'
import type { Quilometragem } from '../types/modelos'
import { ou, supabase } from './cliente'
import { invalidarCacheFinanceiro } from './dashboard'
import { moduloNoSupabase } from './modo'

/**
 * Quilometragem.
 *
 * km_total, km_morto e custo_km_morto sao colunas geradas pelo banco — o que se
 * grava sao os hodometros, o km remunerado e o custo do km no momento do
 * registro. Congelar o custo e de proposito: mudar a tabela do veiculo amanha
 * nao pode mudar o custo do que ja rodou.
 */

const COLUNAS = [
  'id', 'data_registro', 'protocolo', 'hodometro_inicial', 'hodometro_final',
  'km_total', 'km_remunerado', 'km_morto', 'custo_por_km', 'custo_km_morto',
  'observacoes', 'veiculo_id', 'motorista_id',
  'veiculos(identificacao)', 'motoristas(nome)',
].join(',')

type Vinculo<T> = T | T[] | null
const um = <T,>(v: Vinculo<T>) => (!v ? undefined : Array.isArray(v) ? v[0] : v)

type Linha = {
  id: number; data_registro: string; protocolo: string | null
  hodometro_inicial: number | string; hodometro_final: number | string
  km_total: number | string; km_remunerado: number | string
  km_morto: number | string; custo_por_km: number | string
  custo_km_morto: number | string; observacoes: string | null
  veiculo_id: number; motorista_id: number | null
  veiculos: Vinculo<{ identificacao: string }>
  motoristas: Vinculo<{ nome: string }>
}

function paraModelo(l: Linha): Quilometragem {
  return {
    id: l.id,
    data: l.data_registro,
    veiculo: um(l.veiculos)?.identificacao ?? '',
    motorista: um(l.motoristas)?.nome,
    protocolo: l.protocolo ?? undefined,
    hodometroInicial: Number(l.hodometro_inicial),
    hodometroFinal: Number(l.hodometro_final),
    quilometragemTotal: Number(l.km_total),
    quilometragemRemunerada: Number(l.km_remunerado),
    kmMorto: Number(l.km_morto),
    custoPorKm: Number(l.custo_por_km),
    custoKmMorto: Number(l.custo_km_morto),
    observacoes: l.observacoes ?? undefined,
  }
}

export interface DadosQuilometragem {
  data: string
  veiculoId: number
  motoristaId?: number | null
  protocolo?: string | null
  hodometroInicial: number
  hodometroFinal: number
  quilometragemRemunerada: number
  custoPorKm: number
  observacoes?: string | null
  /** O Spring aceita remunerado maior que o rodado quando quem lanca confirma. */
  confirmarExcesso?: boolean
}

export async function listarQuilometragens(): Promise<Quilometragem[]> {
  if (!moduloNoSupabase('quilometragem')) return api<Quilometragem[]>('/api/quilometragens')

  const linhas = ou(
    await supabase().from('quilometragens').select(COLUNAS)
      .order('data_registro', { ascending: false }).order('id', { ascending: false })
      .limit(300),
    'Não foi possível carregar a quilometragem.',
  ) as unknown as Linha[]
  return linhas.map(paraModelo)
}

export async function criarQuilometragem(dados: DadosQuilometragem): Promise<Quilometragem> {
  invalidarCacheFinanceiro()
  if (!moduloNoSupabase('quilometragem')) {
    return api<Quilometragem>('/api/quilometragens', { method: 'POST', body: JSON.stringify(dados) })
  }
  // Vai por RPC, e nao por insert, porque a confirmacao do excesso e regra:
  // precisa ser verificada no servidor, nao na tela.
  const bruta = ou(
    await supabase().rpc('registrar_quilometragem', {
      p_data: dados.data,
      p_veiculo_id: dados.veiculoId,
      p_motorista_id: dados.motoristaId ?? null,
      p_hodometro_inicial: dados.hodometroInicial,
      p_hodometro_final: dados.hodometroFinal,
      p_km_remunerado: dados.quilometragemRemunerada,
      p_custo_por_km: dados.custoPorKm,
      p_protocolo: dados.protocolo || null,
      p_observacoes: dados.observacoes || null,
      p_confirmar_excesso: dados.confirmarExcesso ?? false,
    }),
    'Não foi possível registrar a quilometragem.',
  ) as Record<string, unknown>

  // A RPC devolve a linha crua, sem os joins de nome; a listagem seguinte
  // recarrega com eles.
  const linha = ou(
    await supabase().from('quilometragens').select(COLUNAS).eq('id', bruta.id as number).single(),
    'Não foi possível carregar a quilometragem registrada.',
  ) as unknown as Linha
  return paraModelo(linha)
}
