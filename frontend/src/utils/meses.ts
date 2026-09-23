/** Os meses que o periodo cobre, "2026-07", "2026-08"... */
export function mesesDoPeriodo(inicio: string, fim: string): string[] {
  const meses: string[] = []
  let [ano, mes] = inicio.slice(0, 7).split('-').map(Number)
  const [anoFim, mesFim] = fim.slice(0, 7).split('-').map(Number)
  while (ano! < anoFim! || (ano === anoFim && mes! <= mesFim!)) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`)
    if (mes === 12) { ano = ano! + 1; mes = 1 } else { mes = mes! + 1 }
  }
  return meses
}

/** "Jul de 2026". */
export function nomeDoMes(mes: string): string {
  const [ano, numero] = mes.split('-').map(Number)
  const texto = new Date(ano!, numero! - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** O primeiro dia do mes, `quantos` meses antes de `hoje` (0 = o mes de hoje). */
export function inicioDeMesesAtras(hoje: string, quantos: number): string {
  const [ano, mes] = hoje.slice(0, 7).split('-').map(Number)
  const d = new Date(Date.UTC(ano!, mes! - 1 - quantos, 1))
  return d.toISOString().slice(0, 10)
}
