import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import type { LinhaOs } from '../../dados/porto/listaOs'
import { ServicosDoPeriodo } from './ServicosDoPeriodo'
import { DespesasDoPeriodo } from './DespesasDoPeriodo'

const listar = vi.hoisted(() => vi.fn())
vi.mock('../../dados/porto/listaOs', () => ({ listarTodasAsOs: (...a: unknown[]) => listar(...a) }))

const os = (i: number, motorista: string, extra: Partial<LinhaOs> = {}): LinhaOs => ({
  id: i, numero: `OS-${i}`, valorTotal: 0, situacao: 'AGUARDANDO_ANALISE', motorista,
  motoristaId: motorista === 'ANDERSON' ? 7 : 8, especialidade: 'SOCORRO', dataAtendimento: '2026-09-08', ...extra,
})
const desenhar = () => render(<MemoryRouter><ServicosDoPeriodo inicio="2026-09-08" fim="2026-09-08"/></MemoryRouter>)

beforeEach(() => listar.mockReset())

test('mostra todos os serviços do dia, com e sem valor, por quem mais fez', async () => {
  listar.mockResolvedValue({ itens: [os(1, 'DJALMA', { valorPrevisto: 300, valorTotal: 300 }),
    os(2, 'ANDERSON'), os(3, 'ANDERSON', { valorPrevisto: 200, valorTotal: 200 }), os(4, 'ANDERSON')] })
  desenhar()
  expect(await screen.findByRole('heading', { name: '4 serviços' })).toBeTruthy()
  expect(screen.getByText('Total').parentElement?.textContent).toContain('4 serviços')
  expect(screen.getByText('2', { selector: 'strong' }).parentElement?.textContent).toContain('ainda sem valor')
  const linhas = screen.getAllByRole('listitem').filter(li => li.querySelector('summary'))
  expect(linhas[0].textContent).toContain('ANDERSON')
  expect(linhas[0].textContent).toContain('3 serviços')

  await userEvent.setup().click(within(linhas[0]).getByText('3 serviços'))
  expect(within(linhas[0]).getByRole('link', { name: 'OS-3' })).toBeTruthy()
  expect(within(linhas[0]).getByText('R$ 200,00')).toBeTruthy()
})

test('dia sem serviço diz isso, em vez de sumir', async () => {
  listar.mockResolvedValue({ itens: [] })
  desenhar()
  expect(await screen.findByText(/nenhum serviço feito neste período/i)).toBeTruthy()
})

test('despesas do período: todas, uma por uma, sem as rejeitadas', () => {
  render(<MemoryRouter><DespesasDoPeriodo lancamentos={[
    { id: 'D1', tipo: 'DESPESA', referenciaId: 1, descricao: 'Diesel', categoria: 'Combustível', valor: 400,
      data: '2026-09-08', status: 'PAGO', realizado: true, origem: 'MANUAL' },
    { id: 'D2', tipo: 'DESPESA', referenciaId: 2, descricao: 'Pedágio', categoria: 'Pedágio', valor: 20,
      data: '2026-09-08', status: 'PENDENTE', realizado: false, origem: 'MANUAL' },
    { id: 'D3', tipo: 'DESPESA', referenciaId: 3, descricao: 'Recusada', categoria: 'Outros', valor: 99,
      data: '2026-09-08', status: 'REJEITADO', realizado: false, origem: 'MANUAL' },
  ]}/></MemoryRouter>)
  expect(screen.getByText('2 despesas')).toBeTruthy()
  expect(screen.getByText('Diesel')).toBeTruthy()
  expect(screen.getByText('Pedágio', { selector: 'strong' })).toBeTruthy()
  expect(screen.queryByText('Recusada')).toBeNull()
})
