import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/**
 * Escolhe uma opcao no dropdown proprio (ver components/Selecao.tsx).
 *
 * Substitui user.selectOptions nos campos migrados: o componente barra o
 * pointerdown do <select> e abre um painel, entao o caminho do teste passa a ser
 * o mesmo da pessoa — abre o campo, clica na linha. O valor continua no <select>
 * de verdade, entao as asserções sobre o formulario nao mudam.
 */
export async function escolher(
  user: UserEvent,
  rotulo: RegExp | string,
  opcao: RegExp | string,
  escopo?: HTMLElement,
) {
  const area = escopo ? within(escopo) : screen
  await user.click(area.getByLabelText(rotulo))
  const painel = await screen.findByRole('dialog', { name: rotulo })
  await user.click(within(painel).getByRole('option', { name: opcao }))
}
