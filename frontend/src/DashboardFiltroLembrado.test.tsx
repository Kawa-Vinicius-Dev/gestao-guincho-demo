import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import DashboardPage from './DashboardPage'

// Quem abria um semestre aqui, ia registrar uma despesa e voltava, reencontrava
// o mes corrente e refazia as duas datas a cada consulta.
test('o período escolhido continua valendo ao voltar para a tela', async () => {
  const primeira = render(<MemoryRouter><DashboardPage/></MemoryRouter>)
  const de = screen.getByLabelText('Data inicial'), ate = screen.getByLabelText('Data final')

  await userEvent.clear(de); await userEvent.type(de, '2026-04-01')
  await userEvent.clear(ate); await userEvent.type(ate, '2026-09-30')
  primeira.unmount()

  render(<MemoryRouter><DashboardPage/></MemoryRouter>)

  expect(screen.getByLabelText('Data inicial')).toHaveValue('2026-04-01')
  expect(screen.getByLabelText('Data final')).toHaveValue('2026-09-30')
})

// Durante a digitacao a data fica pela metade e o "de" chega a ficar vazio.
// Voltar para uma tela com filtro vazio e pior do que voltar para o mes corrente.
test('período pela metade não é gravado', async () => {
  const primeira = render(<MemoryRouter><DashboardPage/></MemoryRouter>)
  const inicial = screen.getByLabelText('Data inicial') as HTMLInputElement
  const mesCorrente = inicial.value

  await userEvent.clear(inicial)
  expect(inicial).toHaveValue('')
  primeira.unmount()

  render(<MemoryRouter><DashboardPage/></MemoryRouter>)

  expect(screen.getByLabelText('Data inicial')).toHaveValue(mesCorrente)
})
