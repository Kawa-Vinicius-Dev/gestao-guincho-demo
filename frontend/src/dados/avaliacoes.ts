import { ou, supabase } from './cliente'

/**
 * Avaliacoes dos clientes (03/11/2026). O cliente avalia em /avaliar, sem
 * login; so o administrador le a lista.
 */

export interface Avaliacao {
  id: number
  nota: number
  nome: string | null
  placa: string | null
  comentario: string | null
  criadoEm: string
}

/**
 * `empresa` e o codigo que vem no link (/avaliar?e=codigo). O link antigo, sem
 * codigo, e o do primeiro cliente: nesse caso o parametro nem e enviado.
 */
export async function avaliar(dados: { nota: number; nome: string; placa: string; comentario: string; empresa?: string }) {
  ou(
    await supabase().rpc('avaliar', {
      p_nota: dados.nota, p_nome: dados.nome, p_placa: dados.placa, p_comentario: dados.comentario,
      ...(dados.empresa ? { p_empresa: dados.empresa } : {}),
    }),
    'Não foi possível enviar sua avaliação.',
  )
}

export async function listarAvaliacoes(): Promise<Avaliacao[]> {
  return (ou(await supabase().rpc('listar_avaliacoes'), 'Não foi possível carregar as avaliações.') as Avaliacao[] | null) ?? []
}

/** Nome da empresa do link, para a pagina publica dizer de quem e a avaliacao. */
export async function empresaDoLink(codigo: string): Promise<string | null> {
  const { data, error } = await supabase().rpc('empresa_do_link', { p_codigo: codigo })
  return error || !data ? null : String(data)
}
