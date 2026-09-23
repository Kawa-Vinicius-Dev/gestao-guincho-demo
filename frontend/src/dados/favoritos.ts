import { ou, supabase } from './cliente'

/**
 * Atalhos do menu. Sao do usuario e de mais ninguem — nem o administrador ve os
 * de outro. A lista inteira e substituida de uma vez pela RPC, que apaga e
 * insere na mesma transacao: dois cliques rapidos nao deixam o menu vazio.
 */

export async function listarFavoritos(): Promise<string[]> {
  const linhas = ou(
    await supabase().from('favoritos_menu').select('rota').order('ordem').order('id'),
    'Não foi possível carregar os atalhos.',
  ) as { rota: string }[]
  return linhas.map(l => l.rota)
}

export async function salvarFavoritos(rotas: string[]): Promise<string[]> {
  const linhas = ou(
    await supabase().rpc('substituir_favoritos', { p_rotas: rotas }),
    'Não foi possível salvar os atalhos.',
  ) as { rota: string }[]
  return linhas.map(l => l.rota)
}
