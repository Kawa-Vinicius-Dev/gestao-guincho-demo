import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import PortoRelatoriosPage from './PortoRelatoriosPage'

test('atalho preenche o De–até e diz quantos dias', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-23T15:00:00'))
  const user = userEvent.setup({ delay: null })
  render(<MemoryRouter><PortoRelatoriosPage/></MemoryRouter>)

  await user.click(screen.getByRole('button', { name: 'Últimos 7 dias' }))
  expect(screen.getByLabelText('Data inicial')).toHaveValue('2026-09-17')
  expect(screen.getByLabelText('Data final')).toHaveValue('2026-09-23')
  expect(screen.getByText('7 dias')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Mês passado' }))
  expect(screen.getByLabelText('Data inicial')).toHaveValue('2026-08-01')
  expect(screen.getByLabelText('Data final')).toHaveValue('2026-08-31')
  vi.useRealTimers()
})

test('data inicial depois da final trava o download', async () => {
  const user = userEvent.setup({ delay: null })
  render(<MemoryRouter><PortoRelatoriosPage/></MemoryRouter>)

  await user.click(screen.getByRole('button', { name: 'Ontem' }))
  const inicio = screen.getByLabelText('Data inicial')
  await user.clear(inicio); await user.type(inicio, '2099-01-01')

  expect(screen.getByText('A data inicial passa da final')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'Baixar PDF' })[0]).toBeDisabled()
})
