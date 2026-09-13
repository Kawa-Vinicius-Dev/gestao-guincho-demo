/**
 * Tema visual, escolhido pelo operador na tela de Configuracoes.
 *
 * De proposito nao acompanha o tema do sistema operacional: um sistema
 * financeiro que troca de cor sozinho no meio do expediente assusta quem esta
 * conferindo numero, e ninguem pediu isso. O padrao e claro; quem quiser
 * escuro, liga e fica ligado.
 *
 * O index.html le esta mesma chave antes da primeira pintura, para a tela nao
 * piscar branco antes do React montar. Se mudar a chave aqui, mude la tambem.
 */
export type Tema = 'claro' | 'escuro'

const CHAVE = 'fluxo-gestao:tema:v1'

export function temaAtual(): Tema {
  // Janela anonima ou navegador com armazenamento bloqueado: cai no claro.
  try { return localStorage.getItem(CHAVE) === 'escuro' ? 'escuro' : 'claro' }
  catch { return 'claro' }
}

export function aplicarTema(tema: Tema) {
  document.documentElement.dataset.tema = tema
  try { localStorage.setItem(CHAVE, tema) }
  catch { /* sem armazenamento: vale so enquanto a aba estiver aberta */ }
}
