import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import App from './App'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})

test('administrador começa com a base vazia e cria o primeiro lançamento', async () => {
  const user = userEvent.setup()
  render(<App />)

  expect(await screen.findByText(/sistema de gestão · ANAIV/i)).toBeInTheDocument()
  expect(screen.getByText(/J M S · visão do dono/i)).toBeInTheDocument()
  expect(screen.queryByText(/demo profissional/i)).not.toBeInTheDocument()

  await user.clear(await screen.findByLabelText(/e-mail/i))
  await user.type(screen.getByLabelText(/e-mail/i), 'admin@fluxogestao.local')
  await user.clear(screen.getByLabelText(/senha/i))
  await user.type(screen.getByLabelText(/senha/i), 'Admin@123')
  await user.click(screen.getByRole('button', { name: /entrar no sistema/i }))

  expect(await screen.findByRole('heading', { name: /visão financeira/i })).toBeInTheDocument()
  const fluxo = await screen.findByRole('region', { name: /fluxo do resultado operacional/i })
  expect(within(fluxo).getByText('R$ 780,00')).toBeInTheDocument()
  expect(within(fluxo).getByText('R$ 200,00')).toBeInTheDocument()
  expect(within(fluxo).getByText('R$ 580,00')).toBeInTheDocument()

  await user.click(screen.getByRole('link', { name: /^entradas e saídas$/i }))
  expect(await screen.findByRole('heading', { name: /^entradas e saídas$/i })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /nova entrada ou saída/i }))

  // So existe lancamento manual de despesa: receita vem dos servicos das seguradoras,
  // pela importacao, e por isso a categoria (de despesa) e obrigatoria aqui.
  const dialogo = screen.getByRole('dialog')
  await user.type(within(dialogo).getByLabelText(/descrição/i), 'Serviço particular de teste')
  await user.type(within(dialogo).getByLabelText(/^valor$/i), '300')
  await user.selectOptions(within(dialogo).getByLabelText(/categoria/i), '2')
  await user.click(within(dialogo).getByRole('button', { name: /salvar lançamento/i }))

  expect(await screen.findByText(/totais oficiais foram atualizados/i)).toBeInTheDocument()
  expect(screen.getByText('Serviço particular de teste')).toBeInTheDocument()

  await user.click(screen.getByRole('link', { name: /visão geral/i }))
  expect(await screen.findByRole('heading', { name: /visão financeira/i })).toBeInTheDocument()
  expect(await screen.findByRole('region', { name: /fluxo do resultado operacional/i })).toBeInTheDocument()
})

test('socorrista vê apenas os lançamentos operacionais permitidos', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.clear(await screen.findByLabelText(/e-mail/i))
  await user.type(screen.getByLabelText(/e-mail/i), 'socorrista@gestaoguincho.demo')
  await user.clear(screen.getByLabelText(/senha/i))
  await user.type(screen.getByLabelText(/senha/i), 'Demo@123')
  await user.click(screen.getByRole('button', { name: /entrar no sistema/i }))

  expect(await screen.findByRole('heading', { name: /despesas/i })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /DRE mensal/i })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /km rodado e morto/i })).toBeInTheDocument()
})

test('mede a transição entre rotas no navegador', async () => {
  const medida = vi.spyOn(performance, 'measure')
  const marcacao = vi.spyOn(performance, 'mark')
  try {
    const user = userEvent.setup()
    render(<App />)

    await user.clear(await screen.findByLabelText(/e-mail/i))
    await user.type(screen.getByLabelText(/e-mail/i), 'admin@fluxogestao.local')
    await user.clear(screen.getByLabelText(/senha/i))
    await user.type(screen.getByLabelText(/senha/i), 'Admin@123')
    await user.click(screen.getByRole('button', { name: /entrar no sistema/i }))
    await screen.findByRole('heading', { name: /visão financeira/i })
    medida.mockClear()
    marcacao.mockClear()
    const link = screen.getByRole('link', { name: /^entradas e saídas$/i })
    let inicioMarcadoNoClique = false
    const conferirInicio = () => {
      inicioMarcadoNoClique = marcacao.mock.calls.some(([nome]) => String(nome).startsWith('route:/lancamentos:start:'))
    }
    link.addEventListener('click', conferirInicio)
    await user.click(link)
    link.removeEventListener('click', conferirInicio)
    expect(await screen.findByRole('heading', { name: /^entradas e saídas$/i })).toBeInTheDocument()
    expect(inicioMarcadoNoClique).toBe(true)

    await waitFor(() => expect(medida).toHaveBeenCalledWith(
      'route:/lancamentos',
      expect.stringMatching(/^route:\/lancamentos:start:/),
      expect.stringMatching(/^route:\/lancamentos:end:/),
    ))
    const inicio = marcacao.mock.calls.findIndex(([nome]) => String(nome).startsWith('route:/lancamentos:start:'))
    const fim = marcacao.mock.calls.findIndex(([nome]) => String(nome).startsWith('route:/lancamentos:end:'))
    expect(fim).toBeGreaterThan(inicio)
  } finally {
    marcacao.mockRestore()
    medida.mockRestore()
  }
})
