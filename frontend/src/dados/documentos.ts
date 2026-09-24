import { ou, supabase } from './cliente'

/**
 * Documentos e vencimentos do credenciamento (Kawa, 24/09/2026).
 *
 * Documento vencido pode tirar a viatura ou o socorrista do acionamento da
 * Porto. Aqui fica so a validade — o arquivo nao entra no sistema.
 */

/** Com quantos dias de antecedencia o documento passa a pedir atencao. */
export const DIAS_DE_AVISO = 30

// Os que o Manual de Frota da Porto (abril/2026) cobra. A vistoria periodica nao
// entra aqui: o calendario dela sai da placa (dados/vistorias).
export const TIPOS_DA_VIATURA = [
  'CRLV', 'Seguro Casco + RCF', 'Registro ANTT (RNTRC)', 'AETC (caminhão em SP)', 'Tacógrafo', 'Licença ambiental',
]
export const TIPOS_DO_SOCORRISTA = ['CNH', 'Curso da Porto', 'Exame toxicológico', 'ASO (saúde ocupacional)']

export type SituacaoDocumento = 'VENCIDO' | 'VENCE_LOGO' | 'EM_DIA'

export interface Documento {
  id: number
  tipo: string
  venceEm: string
  observacao: string | null
  veiculoId: number | null
  veiculo: string | null
  motoristaId: number | null
  motorista: string | null
}

type Um<T> = T | T[] | null
const um = <T,>(v: Um<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v)

type Linha = {
  id: number; tipo: string; vence_em: string; observacao: string | null
  veiculo_id: number | null; motorista_id: number | null
  veiculos: Um<{ identificacao: string }>; motoristas: Um<{ nome: string }>
}

export async function listarDocumentos(): Promise<Documento[]> {
  const linhas = ou(
    await supabase().from('documentos')
      .select('id,tipo,vence_em,observacao,veiculo_id,motorista_id,veiculos(identificacao),motoristas(nome)')
      .order('vence_em'),
    'Não foi possível carregar os documentos.',
  ) as unknown as Linha[]
  return linhas.map(l => ({
    id: l.id, tipo: l.tipo, venceEm: l.vence_em, observacao: l.observacao,
    veiculoId: l.veiculo_id, veiculo: um(l.veiculos)?.identificacao ?? null,
    motoristaId: l.motorista_id, motorista: um(l.motoristas)?.nome ?? null,
  }))
}

export interface DadosDocumento {
  tipo: string
  venceEm: string
  observacao?: string | null
  veiculoId?: number | null
  motoristaId?: number | null
}

const paraLinha = (d: DadosDocumento) => ({
  tipo: d.tipo.trim(), vence_em: d.venceEm, observacao: d.observacao?.trim() || null,
  veiculo_id: d.veiculoId ?? null, motorista_id: d.veiculoId ? null : d.motoristaId ?? null,
})

export async function criarDocumento(dados: DadosDocumento): Promise<void> {
  ou(await supabase().from('documentos').insert(paraLinha(dados)).select('id'), 'Não foi possível salvar o documento.')
}

export async function atualizarDocumento(id: number, dados: DadosDocumento): Promise<void> {
  const linhas = ou(await supabase().from('documentos').update(paraLinha(dados)).eq('id', id).select('id'),
    'Não foi possível salvar o documento.') as { id: number }[]
  if (!linhas.length) throw new Error('Você não tem permissão para editar documentos.')
}

export async function excluirDocumento(id: number): Promise<void> {
  ou(await supabase().from('documentos').delete().eq('id', id).select('id'), 'Não foi possível excluir o documento.')
}

/** Dias ate vencer (negativo: ja venceu). */
export function diasParaVencer(venceEm: string, hoje: string): number {
  return Math.round((Date.parse(`${venceEm}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000)
}

export function situacaoDoDocumento(venceEm: string, hoje: string): SituacaoDocumento {
  const dias = diasParaVencer(venceEm, hoje)
  return dias < 0 ? 'VENCIDO' : dias <= DIAS_DE_AVISO ? 'VENCE_LOGO' : 'EM_DIA'
}

/** O numero do menu: vencidos mais os que vencem em ate 30 dias. */
export async function documentosPedindoAtencao(hoje: string): Promise<number> {
  const limite = new Date(`${hoje}T12:00:00`)
  limite.setDate(limite.getDate() + DIAS_DE_AVISO)
  const { count, error } = await supabase().from('documentos')
    .select('id', { count: 'exact', head: true }).lte('vence_em', limite.toISOString().slice(0, 10))
  return error ? 0 : count ?? 0
}
