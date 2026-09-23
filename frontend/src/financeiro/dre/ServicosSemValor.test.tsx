import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { LinhaOs } from '../../dados/porto/listaOs'

import { LIMITE_UM_POR_UM, ServicosSemValor } from './ServicosSemValor'

const listar = vi.hoisted(() => vi.fn())
vi.mock('../../dados/porto/listaOs', () => ({ listarTodasAsOs: (...a: unknown[]) => listar(...a) }))

const os = (i: number, extra: Partial<LinhaOs> = {}): LinhaOs => ({
  id: i, numero: `OS-${i}`, valorTotal: 0, situacao: 'AGUARDANDO_ANALISE',
  motorista: i % 2 ? 'Anderson' : 'Djalma', especialidade: 'Reboque', ...extra,
})

beforeEach(() => listar.mockReset())

test('poucos serviços sem valor aparecem um por um, e os que têm valor ficam de fora', async () => {
  listar.mockResolvedValue({ itens: [os(1), os(2), os(3, { valorPrevisto: 300, valorTotal: 300 })] })
  render(<ServicosSemValor inicio="2026-09-01" fim="2026-09-15"/>)
  expect(await screen.findByText('2 serviços ainda sem valor')).toBeTruthy()
  expect(screen.getByText('OS-1')).toBeTruthy()
  expect(screen.queryByText('OS-3')).toBeNull()
})

test('muitos serviços sem valor viram resumo por socorrista', async () => {
  const muitos = Array.from({ length: LIMITE_UM_POR_UM + 1 }, (_, i) => os(i + 1))
  listar.mockResolvedValue({ itens: muitos })
  render(<ServicosSemValor inicio="2026-09-01" fim="2026-09-15"/>)
  expect(await screen.findByText(`${LIMITE_UM_POR_UM + 1} serviços ainda sem valor`)).toBeTruthy()
  expect(screen.queryByText('OS-1')).toBeNull()
  expect(screen.getByText('Por socorrista')).toBeTruthy()
  expect(screen.getByText('Anderson')).toBeTruthy()
})

test('sem serviço sem valor, o painel não aparece', async () => {
  listar.mockResolvedValue({ itens: [] })
  const { container } = render(<ServicosSemValor inicio="2026-09-01" fim="2026-09-15"/>)
  await vi.waitFor(() => expect(listar).toHaveBeenCalled())
  expect(container.textContent).toBe('')
})
