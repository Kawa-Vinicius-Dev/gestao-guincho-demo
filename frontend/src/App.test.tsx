import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test } from 'vitest'
import App from './App'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})

test('administrador começa com a base vazia e cria o primeiro lançamento', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.clear(await screen.findByLabelText(/e-mail/i))
  await user.type(screen.getByLabelText(/e-mail/i), 'admin@fluxogestao.local')
  await user.clear(screen.getByLabelText(/senha/i))
  await user.type(screen.getByLabelText(/senha/i), 'Admin@123')
  await user.click(screen.getByRole('button', { name: /entrar no sistema/i }))

  expect(await screen.findByRole('heading', { name: /visão financeira/i })).toBeInTheDocument()
  const fluxo = screen.getByRole('region', { name: /fluxo do resultado operacional/i })
  expect(within(fluxo).getAllByText('R$ 0,00')).toHaveLength(3)

  await user.click(screen.getByRole('link', { name: /^entradas e saídas$/i }))
  expect(await screen.findByRole('heading', { name: /^entradas e saídas$/i })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /nova entrada ou saída/i }))

  const dialogo = screen.getByRole('dialog')
  await user.type(within(dialogo).getByLabelText(/descrição/i), 'Serviço particular de teste')
  await user.type(within(dialogo).getByLabelText(/^valor$/i), '300')
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
