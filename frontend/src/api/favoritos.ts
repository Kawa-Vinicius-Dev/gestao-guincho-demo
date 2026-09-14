import { api } from './http'

/**
 * Atalhos do menu, guardados por usuario no backend.
 *
 * Nao ha "adicionar" nem "remover" separados: a barra lateral sempre conhece a
 * lista inteira, e trocar a lista de uma vez dispensa a conversa sobre o que
 * fazer quando dois cliques rapidos chegam fora de ordem.
 */
type Resposta = { rotas: string[] }

export const listarFavoritos = () => api<Resposta>('/api/favoritos').then(r => r.rotas)

export const salvarFavoritos = (rotas: string[]) =>
  api<Resposta>('/api/favoritos', { method: 'PUT', body: JSON.stringify({ rotas }) }).then(r => r.rotas)
