import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import '../dados/instalacao'
import { InstalarApp } from './AtivarAvisos'

/**
 * Instalar o app pelo sistema: sem loja, o Chrome do Android avisa que da para
 * instalar, e o botao abre a janela dele. Sem esse aviso (computador, outro
 * navegador), o botao nao aparece.
 */

test('sem o aviso do Chrome, nao oferece instalar', () => {
  render(<InstalarApp />)
  expect(screen.queryByRole('button', { name: 'Instalar o app no celular' })).not.toBeInTheDocument()
  expect(screen.getByText('Abra este endereço no celular para instalar o app.')).toBeInTheDocument()
})

test('com o aviso do Chrome, o botao abre a janela de instalacao e some depois de aceito', async () => {
  const prompt = vi.fn(() => Promise.resolve())
  const evento = Object.assign(new Event('beforeinstallprompt'), {
    prompt, userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  })
  render(<InstalarApp />)
  act(() => { window.dispatchEvent(evento) })

  const botao = await screen.findByRole('button', { name: 'Instalar o app no celular' })
  await userEvent.setup().click(botao)

  expect(prompt).toHaveBeenCalledOnce()
  await vi.waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Instalar o app no celular' })).not.toBeInTheDocument())
  expect(screen.getByText('✓ Você está usando o app instalado.')).toBeInTheDocument()
})
