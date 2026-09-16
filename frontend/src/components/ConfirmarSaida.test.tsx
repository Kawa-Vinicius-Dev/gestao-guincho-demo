import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ConfirmarSaida } from './ConfirmarSaida'

// Sair ficava a um clique, ao lado do avatar e do menu: quem errava o alvo
// perdia o formulario aberto e caia na tela de login sem ter pedido nada.
test('sair so acontece depois da confirmação', async () => {
  const sair = vi.fn(), cancelar = vi.fn()
  render(<ConfirmarSaida nome="Kawã Viana" aoCancelar={cancelar} aoConfirmar={sair}/>)

  expect(screen.getByRole('dialog', { name: 'Sair do sistema?' })).toBeInTheDocument()
  expect(screen.getByText('Kawã Viana')).toBeInTheDocument()
  expect(sair).not.toHaveBeenCalled()

  await userEvent.click(screen.getByRole('button', { name: 'Sair do sistema' }))
  expect(sair).toHaveBeenCalledTimes(1)
})

test('cancelar e Esc voltam para o sistema sem encerrar a sessão', async () => {
  const sair = vi.fn(), cancelar = vi.fn()
  render(<ConfirmarSaida nome="Kawã Viana" aoCancelar={cancelar} aoConfirmar={sair}/>)

  await userEvent.click(screen.getByRole('button', { name: /continuar no sistema/i }))
  await userEvent.keyboard('{Escape}')

  expect(cancelar).toHaveBeenCalledTimes(2)
  expect(sair).not.toHaveBeenCalled()
})

// Enter logo depois de abrir nao pode deslogar: o foco entra no × do cabecalho,
// que cancela. Sair exige chegar ate o botao vermelho.
test('Enter logo após abrir cancela, não encerra a sessão', async () => {
  const sair = vi.fn(), cancelar = vi.fn()
  render(<ConfirmarSaida aoCancelar={cancelar} aoConfirmar={sair}/>)

  expect(screen.getByRole('button', { name: 'Sair do sistema' })).not.toHaveFocus()
  await userEvent.keyboard('{Enter}')

  expect(sair).not.toHaveBeenCalled()
  expect(cancelar).toHaveBeenCalledTimes(1)
})
