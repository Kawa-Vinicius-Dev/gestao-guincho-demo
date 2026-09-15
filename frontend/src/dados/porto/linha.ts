/**
 * Uma linha de relatorio da Porto, ainda como texto.
 *
 * Porte fiel do LinhaPorto do backend. Os relatorios chegam com valor em
 * formato brasileiro ("R$ 1.234,56"), data em dd/MM/uuuu e, as vezes, HTML
 * colado junto — a leitura de cada campo trata isso aqui, num lugar so.
 */

export type AcaoLinha = 'IMPORTAR' | 'ATUALIZAR' | 'IGNORAR' | 'ERRO' | 'DIVERGENCIA'

export interface Linha {
  dados: Record<string, string>
  hashRegistro: string
  acao: AcaoLinha
  mensagem?: string
}

export function texto(l: Linha, chave: string): string | null {
  const v = l.dados[chave]
  return v == null || v.trim() === '' ? null : v
}

/**
 * "1.234,56" e "1234.56" chegam do mesmo relatorio conforme a origem. Com
 * ponto E virgula, o ponto e separador de milhar; so com virgula, ela e o
 * decimal.
 */
export function decimal(l: Linha, chave: string): number | null {
  const v = texto(l, chave)
  if (v == null) return null
  let limpo = v.replace('R$', '').replace(/\s/g, '')
  if (limpo.includes(',') && limpo.includes('.')) limpo = limpo.replace(/\./g, '').replace(',', '.')
  else if (limpo.includes(',')) limpo = limpo.replace(',', '.')
  const n = Number(limpo)
  if (!Number.isFinite(n)) throw new Error('valor total inválido')
  return n
}

/** Devolve ISO (uuuu-MM-dd), que e o formato que o banco recebe. */
export function data(l: Linha, chave: string): string | null {
  const v = texto(l, chave)
  if (v == null) return null
  if (v.includes('/')) {
    const m = v.slice(0, 10).match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!m) throw new Error('data inválida')
    const [, d, mes, ano] = m
    const iso = `${ano}-${mes}-${d}`
    // Rejeita 31/02 como o ResolverStyle.STRICT do Java faz.
    const conferencia = new Date(`${iso}T12:00:00`)
    if (conferencia.getUTCDate() !== Number(d) || conferencia.getUTCMonth() + 1 !== Number(mes)) {
      throw new Error('data inválida')
    }
    return iso
  }
  const iso = v.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('data inválida')
  return iso
}

/** Data e hora do painel diario. Sai em ISO com o fuso de Fortaleza (-03:00). */
export function dataHora(l: Linha, chave: string): string | null {
  const v = texto(l, chave)
  if (v == null) return null
  if (v.includes('/')) {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
    if (!m) return null
    const [, d, mes, ano, h, min, seg] = m
    return `${ano}-${mes}-${d}T${h}:${min}:${seg ?? '00'}-03:00`
  }
  const iso = v.replace(' ', 'T')
  return /[Z+]|-\d{2}:\d{2}$/.test(iso) ? iso : `${iso}-03:00`
}
