import { ou, supabase } from './cliente'

/**
 * Manutencao por quilometragem e danos da viatura (Kawa, 24/09/2026).
 *
 * O km atual sai do maior odometro ja apontado (turnos e quilometragem): nada a
 * digitar alem do intervalo de cada item. O dano marcado no checklist do turno
 * abre sozinho uma pendencia aqui.
 */

/** A partir de quantos km antes da troca o item passa a pedir atencao. */
export const KM_DE_AVISO = 1000

export const ITENS_SUGERIDOS = ['Troca de óleo', 'Filtros', 'Pneus', 'Revisão', 'Freios', 'Correia']

export type SituacaoManutencao = 'VENCIDA' | 'PROXIMA' | 'EM_DIA'

export interface PlanoManutencao {
  id: number
  veiculoId: number
  viatura: string
  item: string
  intervaloKm: number
  ultimoKm: number
  ultimaData: string | null
  /** Sem nenhum odometro apontado, nao se sabe. */
  kmAtual: number | null
  faltamKm: number
}

export function situacaoDoPlano(p: Pick<PlanoManutencao, 'faltamKm'>): SituacaoManutencao {
  return p.faltamKm <= 0 ? 'VENCIDA' : p.faltamKm <= KM_DE_AVISO ? 'PROXIMA' : 'EM_DIA'
}

export async function listarManutencao(): Promise<PlanoManutencao[]> {
  const linhas = ou(await supabase().rpc('manutencao_da_frota'), 'Não foi possível carregar a manutenção.') as {
    id: number; veiculo_id: number; viatura: string; item: string; intervalo_km: number
    ultimo_km: string | number; ultima_data: string | null; km_atual: string | number | null; faltam_km: string | number
  }[]
  return (linhas ?? []).map(l => ({
    id: l.id, veiculoId: l.veiculo_id, viatura: l.viatura, item: l.item, intervaloKm: l.intervalo_km,
    ultimoKm: Number(l.ultimo_km), ultimaData: l.ultima_data,
    kmAtual: l.km_atual === null ? null : Number(l.km_atual), faltamKm: Number(l.faltam_km),
  }))
}

export async function kmAtualDasViaturas(): Promise<Map<number, number>> {
  const linhas = ou(await supabase().rpc('km_atual_das_viaturas'), 'Não foi possível ler o odômetro das viaturas.') as
    { veiculo_id: number; km_atual: string | number | null }[]
  return new Map((linhas ?? []).filter(l => l.km_atual !== null).map(l => [l.veiculo_id, Number(l.km_atual)]))
}

export interface DadosPlano { veiculoId: number; item: string; intervaloKm: number; ultimoKm: number; ultimaData?: string | null }

const paraLinhaPlano = (d: DadosPlano) => ({
  veiculo_id: d.veiculoId, item: d.item.trim(), intervalo_km: Math.round(d.intervaloKm),
  ultimo_km: d.ultimoKm, ultima_data: d.ultimaData || null,
})

function erroDoItemRepetido(e: unknown): never {
  const mensagem = (e as Error).message ?? ''
  if (/duplicate|unique|manutencao_planos_um_item/i.test(mensagem)) {
    throw new Error('Esta viatura já tem esse item. Edite o que existe.')
  }
  throw e
}

export async function criarPlano(dados: DadosPlano): Promise<void> {
  try { ou(await supabase().from('manutencao_planos').insert(paraLinhaPlano(dados)).select('id'), 'Não foi possível salvar o plano.') }
  catch (e) { erroDoItemRepetido(e) }
}

export async function atualizarPlano(id: number, dados: DadosPlano): Promise<void> {
  try { ou(await supabase().from('manutencao_planos').update(paraLinhaPlano(dados)).eq('id', id).select('id'), 'Não foi possível salvar o plano.') }
  catch (e) { erroDoItemRepetido(e) }
}

/** Feito agora: a contagem recomeca do km informado. */
export async function registrarTroca(id: number, km: number, data: string): Promise<void> {
  ou(await supabase().from('manutencao_planos').update({ ultimo_km: km, ultima_data: data }).eq('id', id).select('id'),
    'Não foi possível registrar a troca.')
}

export async function excluirPlano(id: number): Promise<void> {
  ou(await supabase().from('manutencao_planos').delete().eq('id', id).select('id'), 'Não foi possível excluir o plano.')
}

export interface Dano {
  id: number
  veiculoId: number
  viatura: string | null
  turnoId: number | null
  motoristaId: number | null
  motorista: string | null
  descricao: string
  vistoEm: string
  resolvidoEm: string | null
  observacao: string | null
}

type Um<T> = T | T[] | null
const um = <T,>(v: Um<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v)

export async function listarDanos(): Promise<Dano[]> {
  const linhas = ou(
    await supabase().from('viatura_danos')
      .select('id,veiculo_id,turno_id,motorista_id,descricao,visto_em,resolvido_em,observacao,veiculos(identificacao),motoristas(nome)')
      .order('visto_em', { ascending: false }),
    'Não foi possível carregar os danos.',
  ) as unknown as {
    id: number; veiculo_id: number; turno_id: number | null; motorista_id: number | null; descricao: string
    visto_em: string; resolvido_em: string | null; observacao: string | null
    veiculos: Um<{ identificacao: string }>; motoristas: Um<{ nome: string }>
  }[]
  return linhas.map(l => ({
    id: l.id, veiculoId: l.veiculo_id, viatura: um(l.veiculos)?.identificacao ?? null, turnoId: l.turno_id,
    motoristaId: l.motorista_id, motorista: um(l.motoristas)?.nome ?? null, descricao: l.descricao,
    vistoEm: l.visto_em, resolvidoEm: l.resolvido_em, observacao: l.observacao,
  }))
}

export async function registrarDano(veiculoId: number, descricao: string, vistoEm: string): Promise<void> {
  ou(await supabase().from('viatura_danos').insert({ veiculo_id: veiculoId, descricao: descricao.trim(), visto_em: vistoEm }).select('id'),
    'Não foi possível registrar o dano.')
}

/** `resolvidoEm` nulo reabre. */
export async function marcarDano(id: number, resolvidoEm: string | null, observacao?: string | null): Promise<void> {
  const corpo: Record<string, unknown> = { resolvido_em: resolvidoEm }
  if (observacao !== undefined) corpo.observacao = observacao
  ou(await supabase().from('viatura_danos').update(corpo).eq('id', id).select('id'), 'Não foi possível salvar o dano.')
}

export async function excluirDano(id: number): Promise<void> {
  ou(await supabase().from('viatura_danos').delete().eq('id', id).select('id'), 'Não foi possível excluir o dano.')
}

/** O numero do menu: danos em aberto (a manutencao vencida entra pela tela). */
export async function danosEmAberto(): Promise<number> {
  const { count, error } = await supabase().from('viatura_danos')
    .select('id', { count: 'exact', head: true }).is('resolvido_em', null)
  return error ? 0 : count ?? 0
}
