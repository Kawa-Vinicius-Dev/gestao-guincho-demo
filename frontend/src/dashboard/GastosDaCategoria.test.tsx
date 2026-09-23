import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import type { Dashboard } from '../types/modelos'
import { PainelDeGastos } from './PaineisDoResultado'

// A lista separada de despesas saiu da Visao geral (Kawa, 23/09/2026): cada
// categoria de "Para onde foi o dinheiro" abre os gastos dela, como na DRE.
test('cada categoria abre os gastos dela, a pagar marcados e sem os rejeitados', async () => {
  const dados = { despesasPagas: 400, despesasPorCategoria: [
    { categoriaId: 1, categoria: 'Combustível', valor: 400, participacao: 100 },
  ], despesasAcumuladasPorDia: [] } as unknown as Dashboard
  render(<MemoryRouter><PainelDeGastos dados={dados} inicio="2026-09-01" fim="2026-09-30" lancamentos={[
    { id: 'D1', tipo: 'DESPESA', referenciaId: 1, descricao: 'Diesel', categoria: 'Combustível', valor: 400,
      data: '2026-09-08', status: 'PAGO', realizado: true, origem: 'MANUAL' },
    { id: 'D2', tipo: 'DESPESA', referenciaId: 2, descricao: 'Pedágio da BR', categoria: 'Pedágio', valor: 20,
      data: '2026-09-08', status: 'PENDENTE', realizado: false, origem: 'MANUAL' },
    { id: 'D3', tipo: 'DESPESA', referenciaId: 3, descricao: 'Recusada', categoria: 'Outros', valor: 99,
      data: '2026-09-08', status: 'REJEITADO', realizado: false, origem: 'MANUAL' },
  ]}/></MemoryRouter>)

  const user = userEvent.setup()
  await user.click(screen.getByText('Pedágio', { selector: 'summary span' }))
  expect(screen.getByText(/Pedágio da BR/)).toBeTruthy()
  expect(screen.getByText(/a pagar/)).toBeTruthy()
  expect(screen.queryByText('Outros', { selector: 'summary span' })).toBeNull()
})
