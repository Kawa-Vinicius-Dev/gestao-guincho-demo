const moedaBr = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const numeroBr = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
export const moeda = (valor:number) => moedaBr.format(valor)
export const numero = (valor:number) => numeroBr.format(valor)
/**
 * Percentual no formato do pais: 37,4% e nao 37.4%.
 *
 * O dashboard usava toFixed(1) direto, que e sempre com ponto, entao o mesmo
 * cartao mostrava "R$ 7.980,80" com virgula e "37.4%" com ponto, lado a lado.
 */
const percentualBr = new Intl.NumberFormat('pt-BR', { minimumFractionDigits:1, maximumFractionDigits:1 })
export const percentual = (valor:number) => `${percentualBr.format(valor)}%`

export const data = (valor:string) => new Intl.DateTimeFormat('pt-BR').format(new Date(`${valor}T12:00:00`))
export const dataHora = (valor:string) => new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(valor))
// toISOString devolve a data em UTC: depois das 21h no horario de Brasilia ela ja e a de amanha.
// O plantao vira a noite, entao a data padrao dos formularios precisa ser a do relogio do usuario.
export const hojeIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
