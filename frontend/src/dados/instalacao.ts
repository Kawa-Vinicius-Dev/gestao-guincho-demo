/**
 * Instalar o app pelo proprio sistema (Kawa, 15/10/2026). Nao ha loja: o app e
 * o site instalado na tela inicial. No Android, o Chrome avisa uma vez, logo que
 * a pagina abre, que da para instalar (`beforeinstallprompt`). Este modulo
 * guarda esse aviso desde o comeco, antes de qualquer tela carregar, para o
 * botao "Instalar o app" poder abrir a janela do Chrome depois.
 */

type PedidoDeInstalacao = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let pedido: PedidoDeInstalacao | null = null
const ouvintes = new Set<() => void>()
const avisar = () => { for (const ouvinte of ouvintes) ouvinte() }

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', evento => {
    // O botao da tela substitui a faixa automatica do Chrome.
    evento.preventDefault()
    pedido = evento as PedidoDeInstalacao
    avisar()
  })
  window.addEventListener('appinstalled', () => { pedido = null; avisar() })
}

export const podeInstalar = () => pedido !== null

/** Aberto pelo icone da tela inicial, e nao pelo navegador. */
export const jaInstalado = () =>
  (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches === true)
  || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** Abre a janela de instalacao do Chrome. Devolve se a pessoa aceitou. */
export async function instalar(): Promise<boolean> {
  if (!pedido) return false
  const atual = pedido
  await atual.prompt()
  const { outcome } = await atual.userChoice
  pedido = null
  avisar()
  return outcome === 'accepted'
}

export function ouvirInstalacao(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => { ouvintes.delete(ouvinte) }
}
