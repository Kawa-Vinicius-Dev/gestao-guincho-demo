import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

/** O projeto de mentira que vite.config.ts configura para todo teste. */
export const URL_SUPABASE = 'https://projeto-teste.supabase.co'

/**
 * Respostas padrao: toda tabela lida sem handler proprio volta vazia, e a
 * sessao comeca sem ninguem logado. Cada teste sobrepoe o que precisa com
 * servidor.use(...).
 */
export const servidor = setupServer(
  http.get(`${URL_SUPABASE}/rest/v1/:tabela`, () => HttpResponse.json([])),
  // Contagem (select com head: true): sem linhas, total zero.
  http.head(`${URL_SUPABASE}/rest/v1/:tabela`, () => new HttpResponse(null, { headers: { 'Content-Range': '*/0' } })),
  http.get(`${URL_SUPABASE}/auth/v1/user`, () => HttpResponse.json({}, { status: 401 })),
  // Consultas que quase toda tela faz ao abrir, vazias.
  rpcVazia('porto_periodos', []),
  rpcVazia('extrato_financeiro', []),
  rpcVazia('porto_pendencias_os', []),
  rpcVazia('fila_de_aprovacoes', { itens: [], turnosNaoFechados: [] }),
  rpcVazia('porto_listar_os', { total: 0, valorTotal: 0, itens: [] }),
)

function rpcVazia(nome: string, corpo: Record<string, unknown> | unknown[]) {
  return http.post(`${URL_SUPABASE}/rest/v1/rpc/${nome}`, () => HttpResponse.json(corpo))
}
