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

export async function avaliar(dados: { nota: number; nome: string; placa: string; comentario: string }) {
  ou(
    await supabase().rpc('avaliar', {
      p_nota: dados.nota, p_nome: dados.nome, p_placa: dados.placa, p_comentario: dados.comentario,
    }),
    'Não foi possível enviar sua avaliação.',
  )
}

export async function listarAvaliacoes(): Promise<Avaliacao[]> {
  return (ou(await supabase().rpc('listar_avaliacoes'), 'Não foi possível carregar as avaliações.') as Avaliacao[] | null) ?? []
}
