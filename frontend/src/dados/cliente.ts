import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '../api/http'

/**
 * Cliente do Supabase.
 *
 * Criado sob demanda, e nao na importacao do modulo, por dois motivos: enquanto a
 * migracao nao terminar existem builds sem as variaveis configuradas, e criar o
 * cliente na importacao faria a pagina inteira quebrar no carregamento por causa
 * de um modulo que talvez nem seja usado; e nos testes as variaveis sao definidas
 * depois que o modulo ja foi importado.
 *
 * A chave usada e a anon, que e publica por natureza: ela nao concede nada
 * sozinha. Quem decide o que cada pessoa alcanca sao as policies do banco, a
 * partir do JWT da sessao. A service_role nunca aparece aqui — em `VITE_*` ela
 * iria direto para o bundle que qualquer visitante baixa.
 */

let cliente: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (cliente) return cliente
  const url = import.meta.env.VITE_SUPABASE_URL
  const chave = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !chave) {
    throw new ApiError(
      'Conexão com o banco não configurada. Avise o administrador.', 500,
    )
  }
  recusarChaveDeServico(chave)
  cliente = createClient(url, chave, {
    auth: {
      // A sessao antiga vivia em sessionStorage e terminava ao fechar a aba.
      // Manter esse comportamento evita que um computador compartilhado no patio
      // fique logado para o proximo que sentar.
      storage: sessionStorage,
      storageKey: 'fluxo-gestao:sessao:v1',
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  return cliente
}

/**
 * Id de quem esta com a sessao aberta.
 *
 * As policies de insercao exigem que `criado_por` seja quem esta chamando — e a
 * trava que impede lancar despesa em nome de outra pessoa. Como o valor vai no
 * corpo do insert, a tela precisa saber quem e; sai da sessao, nao de um campo
 * do formulario, justamente para nao ser escolhivel.
 */
export async function usuarioAtualId(): Promise<string> {
  const { data } = await supabase().auth.getSession()
  const id = data.session?.user?.id
  if (!id) throw new ApiError('Sessão expirada. Entre novamente.', 401)
  return id
}

/**
 * Recusa subir com uma chave de servico.
 *
 * Tudo que comeca com VITE_ vai para o bundle que qualquer visitante baixa. Se
 * alguem colar a service_role em VITE_SUPABASE_ANON_KEY — um erro de copiar e
 * colar entre dois campos vizinhos no painel —, o sistema funcionaria
 * perfeitamente, e por isso ninguem notaria: a chave ignora RLS, entao todas as
 * telas abririam. O vazamento so apareceria quando alguem lesse o bundle.
 *
 * Duas formas de chave: as novas trazem o prefixo `sb_secret_`; as classicas sao
 * JWT com `"role":"service_role"` no payload, legivel sem verificar assinatura,
 * porque base64 nao e cifra.
 */
function recusarChaveDeServico(chave: string) {
  const parece = (texto: string) =>
    texto.startsWith('sb_secret_') || texto.includes('service_role')

  if (parece(chave)) throw new ApiError(erroDeChaveDeServico, 500)

  const payload = chave.split('.')[1]
  if (!payload) return
  try {
    if (parece(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))) {
      throw new ApiError(erroDeChaveDeServico, 500)
    }
  } catch (erro) {
    // Payload que nao e base64 valido nao e uma chave de servico; seguir.
    if (erro instanceof ApiError) throw erro
  }
}

const erroDeChaveDeServico =
  'Configuração insegura: a chave de serviço não pode ser usada no navegador. ' +
  'Use a chave anon/publishable.'

/** Usado pelos testes entre um caso e outro. */
export function esquecerCliente() {
  cliente = null
}

type ErroSupabase = { message?: string; code?: string; details?: string } | null

/**
 * Traduz o erro do Postgres para a frase que a tela ja sabe mostrar.
 *
 * As paginas fazem `catch(e){setMensagem((e as Error).message)}` e exibem o texto
 * cru. Com o backend no meio, esse texto vinha pronto e em portugues. Vindo do
 * banco ele chega como "duplicate key value violates unique constraint
 * veiculos_placa_unica" — que nao e uma frase para quem esta cadastrando um
 * guincho. Aqui cada codigo vira a mensagem que o backend dava.
 */
export function erroDoBanco(erro: ErroSupabase, contexto: string): ApiError {
  const codigo = erro?.code ?? ''
  const detalhe = erro?.message ?? ''

  // 23505 unique_violation — quase sempre um cadastro repetido.
  if (codigo === '23505') {
    if (detalhe.includes('placa')) return new ApiError('Já existe um veículo com esta placa.', 409)
    if (detalhe.includes('sigla_porto')) return new ApiError('Já existe um veículo com esta sigla da Porto.', 409)
    if (detalhe.includes('qra')) return new ApiError('Já existe um socorrista com este QRA.', 409)
    if (detalhe.includes('categorias_nome')) return new ApiError('Já existe uma categoria com este nome.', 409)
    if (detalhe.includes('contratantes_nome')) return new ApiError('Já existe um contratante com este nome.', 409)
    return new ApiError('Este registro já existe.', 409)
  }
  // 23503 foreign_key_violation — apagar algo que ainda e referido.
  if (codigo === '23503') {
    // A despesa que representa o pagamento de uma comissao e o unico caso em
    // que a mensagem generica nao ajuda: ela nao foi digitada por ninguem, e
    // quem tenta apagar precisa saber que o caminho e desfazer o pagamento.
    if (detalhe.includes('pagamentos_comissao')) {
      return new ApiError(
        'Esta despesa é o pagamento da comissão de um socorrista. Para desfazê-la, cancele o pagamento da comissão.',
        409,
      )
    }
    return new ApiError('Não dá para excluir: há lançamentos ligados a este cadastro. Desative em vez de excluir.', 409)
  }
  // 23514 check_violation — um valor fora da regra da tabela.
  if (codigo === '23514') {
    if (detalhe.includes('custo_por_km')) return new ApiError('O custo por km não pode ser negativo.', 400)
    if (detalhe.includes('valor')) return new ApiError('O valor não pode ser negativo.', 400)
    return new ApiError('Há um campo preenchido fora do formato esperado.', 400)
  }
  // 42501 e a recusa da policy: a pessoa nao tem permissao para isto.
  if (codigo === '42501') {
    return new ApiError('Você não tem permissão para esta operação.', 403)
  }
  // P0001 e `raise exception` das funcoes do banco, que ja escrevem em portugues
  // pensando em quem le. Repassar sem reescrever.
  if (codigo === 'P0001' && detalhe) {
    return new ApiError(detalhe, 400)
  }
  // PGRST116: o filtro nao encontrou a linha unica esperada.
  if (codigo === 'PGRST116') {
    return new ApiError('Registro não encontrado.', 404)
  }
  return new ApiError(detalhe || contexto, 500)
}

/** Levanta o erro traduzido, ou devolve os dados. Evita repetir o if em cada função. */
export function ou<T>(
  resposta: { data: T | null; error: ErroSupabase },
  contexto: string,
): T {
  if (resposta.error) throw erroDoBanco(resposta.error, contexto)
  return resposta.data as T
}

/**
 * Exclui um registro e confirma que saiu.
 *
 * O delete que a policy nao alcanca nao da erro: volta zero linhas. Sem conferir,
 * a tela fecharia a janela como se tivesse apagado.
 */
export async function excluirRegistro(tabela: string, id: number, contexto: string): Promise<void> {
  const apagadas = ou(
    await supabase().from(tabela).delete().eq('id', id).select('id'),
    contexto,
  ) as { id: number }[]
  if (!apagadas.length) throw new ApiError('Você não tem permissão para excluir este registro.', 403)
}
