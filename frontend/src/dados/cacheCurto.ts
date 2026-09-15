/**
 * Cache curto, em memoria, para listas de cadastro.
 *
 * Medido: veiculos, categorias, motoristas e contratantes sao buscados de novo a
 * cada abertura de tela — veiculos em sete delas. Sao listas pequenas (dezenas
 * de linhas) e que quase nao mudam, entao o custo nao e o tamanho: e a ida e
 * volta. Navegar Despesas -> Receitas -> Lancamentos dispara doze requisicoes
 * para repetir os mesmos quatro seletores.
 *
 * Em memoria, e nao em localStorage: cadastro nao e segredo, mas um cache que
 * sobrevive a sessao envelhece sem ninguem perceber — o socorrista desativado
 * continuaria aparecendo no seletor amanha. Morre com a aba.
 *
 * A janela e curta de proposito. Nao e para evitar a consulta, e para evitar a
 * rajada de consultas iguais dentro da mesma sequencia de navegacao.
 */

const VALIDADE_MS = 30_000

type Entrada = { em: number; valor: unknown }
const cache = new Map<string, Entrada>()
/** Chamadas em voo, para duas telas simultaneas nao pedirem a mesma lista. */
const emVoo = new Map<string, Promise<unknown>>()

export async function comCacheCurto<T>(chave: string, buscar: () => Promise<T>): Promise<T> {
  const guardado = cache.get(chave)
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.valor as T

  const jaPedido = emVoo.get(chave)
  if (jaPedido) return jaPedido as Promise<T>

  const promessa = buscar()
    .then(valor => {
      cache.set(chave, { em: Date.now(), valor })
      return valor
    })
    .finally(() => emVoo.delete(chave))

  emVoo.set(chave, promessa)
  return promessa
}

/**
 * Chamado por quem cria ou altera um cadastro. Sem isto, o veiculo recem-criado
 * levaria ate trinta segundos para aparecer no seletor da tela ao lado — e o
 * cadastro que nao aparece logo depois de salvo parece cadastro perdido.
 */
export function invalidarCadastro(chave: string) {
  cache.delete(chave)
  emVoo.delete(chave)
}

/** Usado pelos testes. */
export function limparCacheCurto() {
  cache.clear()
  emVoo.clear()
}
