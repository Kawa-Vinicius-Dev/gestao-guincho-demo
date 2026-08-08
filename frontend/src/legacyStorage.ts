const CHAVES_DEMO_LEGADAS = [
  'gestao-guincho:demo:v1',
  'gestao-guincho:demo:v2',
  'gestao-guincho:demo:v3',
  'gestao-guincho:demo:v4',
] as const

export function removerDadosDemoLegados() {
  CHAVES_DEMO_LEGADAS.forEach(chave => localStorage.removeItem(chave))
}
