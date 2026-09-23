import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import type { Dashboard } from '../types/modelos'
import { PainelFaturamentoPorSocorrista, PainelFaturamentoPorViatura } from './PaineisDoResultado'

/** "Sem viatura" e "Sem socorrista" tambem sao dado: levam a lista das OS que faltam. */
const dados = {
  receitaRecebida: 1000, producaoPaga: 1000,
  resultadoPorVeiculo: [{ veiculoId: 2, veiculo: 'L168', receitas: 600, despesas: 0, resultado: 600, kmMorto: 0, custoKmMorto: 0 }],
  resultadoPorSocorrista: [{ motoristaId: 9, socorrista: 'ANDERSON', servicos: 3, producao: 700, comissao: 140, despesas: 0, custoTotal: 140 }],
} as unknown as Dashboard

test('Sem viatura leva às OS sem viatura', () => {
  render(<MemoryRouter><PainelFaturamentoPorViatura dados={dados}/></MemoryRouter>)
  expect(screen.getByRole('link', { name: 'Sem viatura' })).toHaveAttribute('href', '/porto/ordens-servico?semViatura=1')
})

test('Sem socorrista leva às pendências de socorrista', () => {
  render(<MemoryRouter><PainelFaturamentoPorSocorrista dados={dados}/></MemoryRouter>)
  expect(screen.getByRole('link', { name: 'Sem socorrista' })).toHaveAttribute('href', '/porto/pendencias?filtro=SOCORRISTA')
})
