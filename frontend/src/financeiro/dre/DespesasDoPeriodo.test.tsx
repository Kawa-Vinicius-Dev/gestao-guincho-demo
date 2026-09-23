import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import { DespesasDoPeriodo } from './DespesasDoPeriodo'

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
