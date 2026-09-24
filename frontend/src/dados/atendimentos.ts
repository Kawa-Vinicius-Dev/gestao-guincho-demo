import { erroDoBanco, ou, supabase } from './cliente'
import { ApiError } from './erros'
import { normalizarNumero } from './porto/importacao'
import { comprimirFoto } from './turnos'

/**
 * Registro do atendimento no celular (Kawa, 24/09/2026): prova para contestar a
 * Porto. O socorrista digita o numero da OS do app da Porto, marca a chegada,
 * fotografa o veiculo do segurado e colhe a assinatura. Quando a OS chega pelo
 * diario/OP, o registro se junta a ela pelo numero normalizado.
 *
 * Fotos e assinatura vao comprimidas para o Storage (pasta atendimentos/<id>/);
 * saem quando a OS esta paga e sem contestacao aberta, ou em 120 dias.
 */

const BUCKET = 'comprovantes'
const LARGURA_FOTO = 1280
const QUALIDADE_FOTO = 0.6
export const MAXIMO_DE_FOTOS = 4

export { normalizarNumero as normalizarNumeroOs }

export interface NovoAtendimento {
  numeroOs: string
  chegadaEm: Date
  placa?: string
  nomeAssinante?: string
  observacao?: string
  antes: File[]
  depois: File[]
  assinatura: Blob | null
}

/** Grava o registro e sobe os arquivos. Devolve o id. */
export async function registrarAtendimento(a: NovoAtendimento): Promise<number> {
  const numero = a.numeroOs.trim()
  const id = ou(
    await supabase().rpc('registrar_atendimento', {
      p_numero_os: numero, p_numero_normalizado: normalizarNumero(numero), p_chegada_em: a.chegadaEm.toISOString(),
      p_placa: a.placa?.trim() || null, p_nome_assinante: a.nomeAssinante?.trim() || null, p_observacao: a.observacao?.trim() || null,
    }),
    'Não foi possível registrar o atendimento.',
  ) as number

  const subir = async (nome: string, arquivo: Blob, tipo: string) => {
    const caminho = `atendimentos/${id}/${nome}-${Date.now()}.${tipo === 'image/png' ? 'png' : 'jpg'}`
    const { error } = await supabase().storage.from(BUCKET).upload(caminho, arquivo, { contentType: tipo, upsert: false })
    if (error) throw erroDoBanco({ message: error.message }, 'Não foi possível enviar as fotos.')
    return caminho
  }
  try {
    const antes: string[] = [], depois: string[] = []
    for (const [i, f] of a.antes.entries()) {
      const c = await comprimirFoto(f, LARGURA_FOTO, QUALIDADE_FOTO); antes.push(await subir(`antes-${i + 1}`, c, c.type))
    }
    for (const [i, f] of a.depois.entries()) {
      const c = await comprimirFoto(f, LARGURA_FOTO, QUALIDADE_FOTO); depois.push(await subir(`depois-${i + 1}`, c, c.type))
    }
    const assinatura = a.assinatura ? await subir('assinatura', a.assinatura, 'image/png') : null
    ou(await supabase().rpc('anexar_arquivos_atendimento', { p_id: id, p_fotos: { antes, depois }, p_assinatura: assinatura }),
      'Não foi possível registrar as fotos.')
  } catch {
    throw new ApiError(`O atendimento da OS ${numero} foi salvo, mas as fotos não subiram. Confira a internet e registre as fotos de novo.`, 400)
  }
  return id
}

export interface MeuAtendimento { id: number; numeroOs: string; chegadaEm: string; fotos: number; assinado: boolean }

/** Os atendimentos do socorrista de hoje, para ele conferir o que ja registrou. */
export async function meusAtendimentosDeHoje(): Promise<MeuAtendimento[]> {
  const inicio = new Date(); inicio.setHours(0, 0, 0, 0)
  const linhas = ou(
    await supabase().from('atendimentos').select('id,numero_os,chegada_em,fotos,assinatura')
      .gte('chegada_em', inicio.toISOString()).order('chegada_em', { ascending: false }),
    'Não foi possível carregar seus atendimentos.',
  ) as { id: number; numero_os: string; chegada_em: string; fotos: { antes?: string[]; depois?: string[] }; assinatura: string | null }[]
  return (linhas ?? []).map(l => ({
    id: l.id, numeroOs: l.numero_os, chegadaEm: l.chegada_em,
    fotos: (l.fotos.antes?.length ?? 0) + (l.fotos.depois?.length ?? 0), assinado: Boolean(l.assinatura),
  }))
}

export interface AtendimentoRegistrado {
  id: number
  numeroOs: string
  numeroNormalizado: string
  chegadaEm: string
  placa: string | null
  motoristaId: number
  motorista: string
  viatura: string | null
  fotos: { antes: string[]; depois: string[] }
  assinatura: string | null
  nomeAssinante: string | null
  observacao: string | null
  arquivosApagados: boolean
  /** A OS da Porto, quando ja chegou. */
  osId: number | null
  dataAtendimento: string | null
  especialidade: string | null
  numeroOp: string | null
}

export async function listarAtendimentos(inicio: string, fim: string): Promise<AtendimentoRegistrado[]> {
  const itens = ou(await supabase().rpc('atendimentos_registrados', { p_inicio: inicio, p_fim: fim }),
    'Não foi possível carregar os atendimentos.') as AtendimentoRegistrado[]
  return (itens ?? []).map(a => ({ ...a, fotos: { antes: a.fotos?.antes ?? [], depois: a.fotos?.depois ?? [] } }))
}

/** Tira do Storage os arquivos que ja cumpriram o papel. Falhar aqui nao atrapalha a tela. */
export async function limparAtendimentosAntigos(): Promise<void> {
  try {
    const lista = ou(await supabase().rpc('atendimentos_para_apagar'), '') as { id: number; caminhos: string[] }[]
    if (!lista?.length) return
    const { error } = await supabase().storage.from(BUCKET).remove(lista.flatMap(a => a.caminhos))
    if (error) return
    await supabase().rpc('marcar_atendimentos_apagados', { p_ids: lista.map(a => a.id) })
  } catch {
    // Tenta de novo na proxima vez.
  }
}
