import { act, screen, within } from '@testing-library/react'

/**
 * Toda acao importante abre "Tem certeza?" antes de executar. Nos testes, depois
 * de clicar na acao, este passo aperta o botao de confirmar da janela de
 * confirmacao (a lista aberta de um seletor tambem conta como dialog, entao a
 * janela e procurada pela etiqueta "Confirmação").
 */
export async function confirmarNaJanela() {
  const janelas = await screen.findAllByRole('dialog')
  const janela = janelas.filter(j => j.textContent?.startsWith('Confirmação')).at(-1) ?? janelas[janelas.length - 1]
  const botoes = within(janela).getAllByRole('button')
  await act(async () => { botoes[botoes.length - 1].click() })
}
