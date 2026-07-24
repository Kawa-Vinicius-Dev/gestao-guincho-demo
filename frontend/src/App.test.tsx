import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test } from 'vitest'
import App from './App'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})

test('administrador cria um lançamento e o vê no dashboard financeiro', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.clear(await screen.findByLabelText(/e-mail/i))
  await user.type(screen.getByLabelText(/e-mail/i), 'admin@fluxogestao.local')
  await user.clear(screen.getByLabelText(/senha/i))
  await user.type(screen.getByLabelText(/senha/i), 'Admin@123')
  await user.click(screen.getByRole('button', { name: /entrar no sistema/i }))

  expect(await screen.findByRole('heading', { name: /visão financeira/i })).toBeInTheDocument()
  expect(screen.getByText(/atenção ao deslocamento improdutivo/i)).toBeInTheDocument()

  await user.click(screen.getByRole('link', { name: /^lançamentos$/i }))
  expect(await screen.findByRole('heading', { name: /^lançamentos$/i })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /novo lançamento/i }))

  const dialogo = screen.getByRole('dialog')
  await user.type(within(dialogo).getByLabelText(/descrição/i), 'Serviço particular de teste')
  await user.type(within(dialogo).getByLabelText(/^valor$/i), '300')
  await user.selectOptions(within(dialogo).getByLabelText(/^veículo/i), '1')
  await user.click(within(dialogo).getByRole('button', { name: /salvar lançamento/i }))

  expect(await screen.findByText(/dashboard e a DRE já foram atualizados/i)).toBeInTheDocument()
  expect(screen.getByText('Serviço particular de teste')).toBeInTheDocument()

  await user.click(screen.getByRole('link', { name: /visão geral/i }))
  expect(await screen.findByRole('heading', { name: /visão financeira/i })).toBeInTheDocument()
  expect(screen.getByText('Serviço particular de teste')).toBeInTheDocument()
})

test('funcionário vê apenas os lançamentos operacionais permitidos', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.clear(await screen.findByLabelText(/e-mail/i))
  await user.type(screen.getByLabelText(/e-mail/i), 'funcionario@gestaoguincho.demo')
  await user.clear(screen.getByLabelText(/senha/i))
  await user.type(screen.getByLabelText(/senha/i), 'Demo@123')
  await user.click(screen.getByRole('button', { name: /entrar no sistema/i }))

  expect(await screen.findByRole('heading', { name: /despesas/i })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /DRE mensal/i })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /km rodado e morto/i })).toBeInTheDocument()
})
