import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { EntradaSenha } from './EntradaSenha'

test('o olho mostra e esconde a senha sem enviar o formulário', async () => {
  const user = userEvent.setup()
  let enviou = false
  render(<form onSubmit={e => { e.preventDefault(); enviou = true }}>
    <label className="field"><span>Senha</span><EntradaSenha name="senha"/></label>
  </form>)
  const campo = screen.getByLabelText('Senha')
  await user.type(campo, 'ABCD-2345')
  expect(campo).toHaveAttribute('type', 'password')

  await user.click(screen.getByRole('button', { name: 'Mostrar a senha' }))
  expect(campo).toHaveAttribute('type', 'text')
  expect(campo).toHaveValue('ABCD-2345')

  await user.click(screen.getByRole('button', { name: 'Esconder a senha' }))
  expect(campo).toHaveAttribute('type', 'password')
  expect(enviou).toBe(false)
})
