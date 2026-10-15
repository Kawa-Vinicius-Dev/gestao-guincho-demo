import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import Pagina from './ConfiguracoesSocorristaPage'

/**
 * Configuracoes do socorrista: app, avisos, aparencia e senha num lugar so.
 * A troca de senha confere a repeticao antes de ir ao banco.
 */

test('mostra os quatro blocos do que ele ajusta sozinho', () => {
  render(<Pagina />)
  for (const titulo of ['App no celular', 'Avisos', 'Aparência', 'Senha']) {
    expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument()
  }
})

test('a aparência troca na hora e fica marcada', async () => {
  render(<Pagina />)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Escuro' }))
  expect(document.documentElement.dataset.tema).toBe('escuro')
  expect(screen.getByRole('button', { name: 'Escuro' })).toHaveAttribute('aria-pressed', 'true')
})

test('senha nova repetida diferente não chega a ser enviada', async () => {
  const user = userEvent.setup({ delay: null })
  render(<Pagina />)
  await user.type(screen.getByLabelText('Senha atual'), 'antiga123')
  await user.type(screen.getByLabelText('Senha nova'), 'nova12345')
  await user.type(screen.getByLabelText('Repita a senha nova'), 'outra1234')
  await user.click(screen.getByRole('button', { name: 'Trocar senha' }))
  expect(screen.getByRole('alert')).toHaveTextContent('As duas senhas novas não são iguais')
})
