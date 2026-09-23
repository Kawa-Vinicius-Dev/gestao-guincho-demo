import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import type { LinhaOs } from '../dados/porto/listaOs'
import DesempenhoPage from './DesempenhoPage'

const os = (i: number, viatura: string, motorista: string, valor: number): LinhaOs => ({
  id: i, numero: `OS-${i}`, valorTotal: valor, valorPrevisto: valor || undefined, viatura, motorista,
  motoristaId: motorista === 'Anderson' ? 7 : 8, situacao: 'CONCILIADA', dataAtendimento: '2026-09-10', semValor: !valor,
})
const lista = [os(1, 'L168', 'Anderson', 500), os(2, 'L168', 'Djalma', 300), os(3, 'L204', 'Anderson', 0)]

vi.mock('../dados/porto/listaOs', async orig => ({ ...await orig<object>(), listarTodasAsOs: () => Promise.resolve({ itens: lista }) }))
vi.mock('../dados/quilometragem', () => ({ listarQuilometragens: () => Promise.resolve([{ veiculoId: 1, quilometragemTotal: 420 }]) }))
vi.mock('../dados/veiculos', () => ({ listarVeiculos: () => Promise.resolve([{ id: 1, identificacao: 'L168', siglaPorto: 'L168', custoPorKm: 2, ativo: true }]) }))

test('serviços por viatura, e o clique abre os serviços dela', async () => {
  render(<MemoryRouter><DesempenhoPage/></MemoryRouter>)
  const barras = await screen.findByRole('list', { name: /viaturas por serviços/i })
  const linhas = within(barras).getAllByRole('button')
  expect(linhas[0].textContent).toContain('L168')
  expect(linhas[0].textContent).toContain('2 serviços')

  const user = userEvent.setup()
  await user.click(linhas[0])
  expect(await screen.findByText('Serviços de L168')).toBeTruthy()
  expect(screen.getByText('OS-2')).toBeTruthy()
  expect(screen.queryByText('OS-3')).toBeNull()

  await user.click(screen.getByRole('button', { name: 'Km rodado' }))
  expect(within(screen.getByRole('list', { name: /km rodado/i })).getAllByRole('button')[0].textContent).toContain('420 km')
})

test('socorristas por produção, com link para a ficha dele', async () => {
  render(<MemoryRouter><DesempenhoPage/></MemoryRouter>)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Socorristas' }))
  await user.click(screen.getByRole('button', { name: 'Produção' }))
  const primeira = within(screen.getByRole('list', { name: /socorristas por produção/i })).getAllByRole('button')[0]
  expect(primeira.textContent).toContain('Anderson')
  expect(primeira.textContent).toContain('1 sem valor')
  await user.click(primeira)
  expect(screen.getByRole('link', { name: /abrir ficha e comissão/i }).getAttribute('href')).toBe('/equipe/7')
})

// Pedido do cliente (23/09/2026): varios meses no De-ate mostram cada viatura mes
// a mes, com o total de cada uma e o total de cada mes.
test('De–até de dois meses mostra cada viatura mês a mês, com os totais', async () => {
  sessionStorage.setItem('filtro:periodo', JSON.stringify({ inicio: '2026-08-01', fim: '2026-09-30' }))
  lista.push({ ...os(4, 'L168', 'Djalma', 200), dataAtendimento: '2026-08-05' })
  try {
    render(<MemoryRouter><DesempenhoPage/></MemoryRouter>)
    const tabela = await screen.findByRole('table', { name: /desempenho mês a mês/i })
    const cabecalho = within(tabela).getAllByRole('columnheader').map(c => c.textContent)
    expect(cabecalho).toHaveLength(4)
    expect(cabecalho.at(-1)).toBe('Total')
    // L168: 1 servico em agosto, 2 em setembro, 3 no total.
    const l168 = within(tabela).getByRole('row', { name: /^L168/ })
    expect(within(l168).getAllByRole('cell').map(c => c.textContent)).toEqual(['L168', '1', '2', '3'])
    const total = within(tabela).getByRole('row', { name: /^Total/ })
    expect(within(total).getAllByRole('cell').map(c => c.textContent)).toEqual(['Total', '1', '3', '4'])
  } finally {
    lista.pop()
    sessionStorage.clear()
  }
})

test('um mês só não mostra a tabela mês a mês', async () => {
  sessionStorage.setItem('filtro:periodo', JSON.stringify({ inicio: '2026-09-01', fim: '2026-09-30' }))
  render(<MemoryRouter><DesempenhoPage/></MemoryRouter>)
  await screen.findByRole('list', { name: /viaturas por serviços/i })
  expect(screen.queryByRole('table', { name: /desempenho mês a mês/i })).not.toBeInTheDocument()
  sessionStorage.clear()
})
