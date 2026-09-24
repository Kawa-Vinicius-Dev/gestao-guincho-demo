import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import { ComparativoDaFrota } from './ComparativoDaFrota'

test('receita e despesas da viatura abrem o Extrato daquela viatura', () => {
  const frota = {
    despesasGerais: 1000,
    viaturas: [{
      veiculoId: 2, veiculo: 'L168', receitas: 8000, despesasProprias: 3000,
      rateio: 1000, resultado: 4000, margem: 50,
    }],
  }
  render(<MemoryRouter>
    <ComparativoDaFrota frota={frota as never} selecionado={0} aoEscolher={() => {}} />
  </MemoryRouter>)

  expect(screen.getByTitle('Ver as receitas da L168 no Extrato'))
    .toHaveAttribute('href', '/lancamentos?atalho=RECEITAS&veiculo=2')
  expect(screen.getByTitle('Ver as despesas da L168 no Extrato'))
    .toHaveAttribute('href', '/lancamentos?atalho=DESPESAS&veiculo=2')
})
