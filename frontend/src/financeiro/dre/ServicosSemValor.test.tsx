import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import type { LinhaOs } from '../../dados/porto/listaOs'
import { ServicosSemValor } from './ServicosSemValor'

const listar = vi.hoisted(() => vi.fn())
vi.mock('../../dados/porto/listaOs', () => ({ listarTodasAsOs: (...a: unknown[]) => listar(...a) }))

const os = (i: number, motorista: string, extra: Partial<LinhaOs> = {}): LinhaOs => ({
  id: i, numero: `OS-${i}`, valorTotal: 0, situacao: 'AGUARDANDO_ANALISE', motorista,
  motoristaId: motorista === 'ANDERSON' ? 7 : 8, especialidade: 'SOCORRO', dataAtendimento: '2026-09-21', ...extra,
})
const desenhar = () => render(<MemoryRouter><ServicosSemValor inicio="2026-09-21" fim="2026-09-21"/></MemoryRouter>)

beforeEach(() => listar.mockReset())

test('socorristas em ordem de quantidade de serviços, e o nome abre as OS numeradas', async () => {
  listar.mockResolvedValue({ itens: [os(1, 'DJALMA'), os(2, 'ANDERSON'), os(3, 'ANDERSON'), os(4, 'ANDERSON'),
    os(5, 'DJALMA', { valorPrevisto: 300, valorTotal: 300 })] })
  desenhar()
  expect(await screen.findByText('4 serviços no período')).toBeTruthy()
  const linhas = screen.getAllByRole('listitem').filter(li => li.querySelector('summary'))
  expect(linhas[0].textContent).toContain('ANDERSON')
  expect(linhas[0].textContent).toContain('3 serviços')
  expect(linhas[1].textContent).toContain('1 serviço')
  // A OS que ja tem valor fica de fora.
  expect(screen.queryByText('OS-5')).toBeNull()

  await userEvent.setup().click(within(linhas[0]).getByText('3 serviços'))
  expect(within(linhas[0]).getByRole('link', { name: 'OS-2' })).toBeTruthy()
})

test('sem serviço sem valor, o painel não aparece', async () => {
  listar.mockResolvedValue({ itens: [] })
  const { container } = desenhar()
  await vi.waitFor(() => expect(listar).toHaveBeenCalled())
  expect(container.textContent).toBe('')
})
