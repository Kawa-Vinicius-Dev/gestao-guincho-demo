import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { Modal } from './Modal'

test('Esc fecha a janela mesmo com o foco fora dela', () => {
  const fechar = vi.fn()
  render(<Modal titulo="Detalhe" aoFechar={fechar}><p>conteúdo</p></Modal>)

  ;(document.activeElement as HTMLElement | null)?.blur()
  fireEvent.keyDown(document.body, { key: 'Escape' })

  expect(fechar).toHaveBeenCalledOnce()
})

test('Esc fecha só a janela de cima', () => {
  const fecharFormulario = vi.fn(), fecharConfirmacao = vi.fn()
  render(<>
    <Modal titulo="Formulário" aoFechar={fecharFormulario}><input aria-label="campo"/></Modal>
    <Modal titulo="Tem certeza?" aoFechar={fecharConfirmacao}><p>confirmar</p></Modal>
  </>)

  fireEvent.keyDown(document.body, { key: 'Escape' })

  expect(fecharConfirmacao).toHaveBeenCalledOnce()
  expect(fecharFormulario).not.toHaveBeenCalled()
})

// Formulario nao fecha no fundo: um clique errado perderia o que foi digitado.
test('clicar no fundo não fecha formulário', () => {
  const fechar = vi.fn()
  const { container } = render(<Modal titulo="Nova despesa" aoFechar={fechar}><input aria-label="valor"/></Modal>)

  fireEvent.mouseDown(container.querySelector('.modal-backdrop')!)

  expect(fechar).not.toHaveBeenCalled()
})

test('janela sem dado a perder fecha no fundo, mas não ao clicar dentro', () => {
  const fechar = vi.fn()
  const { container } = render(<Modal titulo="Tem certeza?" fecharAoClicarFora aoFechar={fechar}><p>texto</p></Modal>)

  fireEvent.mouseDown(screen.getByText('texto'))
  fireEvent.mouseDown(screen.getByRole('dialog'))
  expect(fechar).not.toHaveBeenCalled()

  fireEvent.mouseDown(container.querySelector('.modal-backdrop')!)
  expect(fechar).toHaveBeenCalledOnce()
})
