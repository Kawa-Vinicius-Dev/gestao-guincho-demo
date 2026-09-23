/**
 * O nome do socorrista em listas, rankings e graficos: so o primeiro nome, e o
 * ultimo sobrenome quando o primeiro se repete (Kawa, 23/09/2026: "o ideal seria
 * so o primeiro nome e o servico do lado"; Jeferson e "Jeferson filho" viram
 * "JEFERSON SILVA" e "JEFERSON FILHO"). O nome completo continua na ficha e nos
 * relatorios.
 *
 * Recebe todos os nomes que vao aparecer juntos: a repeticao so existe dentro do
 * mesmo conjunto.
 */
export function nomesCurtos(nomes: (string | undefined)[]): Map<string, string> {
  const partes = (nome: string) => nome.trim().split(/\s+/).filter(Boolean)
  const unicos = [...new Set(nomes.filter((n): n is string => Boolean(n?.trim())))]
  const porPrimeiro = new Map<string, number>()
  for (const nome of unicos) {
    const primeiro = partes(nome)[0]!.toUpperCase()
    porPrimeiro.set(primeiro, (porPrimeiro.get(primeiro) ?? 0) + 1)
  }
  return new Map(unicos.map(nome => {
    const p = partes(nome)
    const repetido = (porPrimeiro.get(p[0]!.toUpperCase()) ?? 0) > 1
    return [nome, repetido && p.length > 1 ? `${p[0]} ${p.at(-1)}` : p[0]!]
  }))
}
