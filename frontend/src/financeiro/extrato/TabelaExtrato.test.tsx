import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import type { LancamentoFinanceiro } from '../../types/modelos'
import { TabelaExtrato } from './TabelaExtrato'

/**
 * A comissao que o sistema lanca aparece como "Fulano — comissao da OP tal", e
 * o nome leva a ficha dele. As outras despesas continuam com a descricao dela.
 */
const base: LancamentoFinanceiro = {
  id: 'D1', tipo: 'DESPESA', referenciaId: 1, descricao: 'ANDERSON JORGE — comissão da OP 1234',
  categoria: 'Comissão de socorrista', valor: 200, data: '2026-09-15', status: 'PAGO',
  realizado: true, origem: 'COMISSAO', protocolo: 'COMISSAO-OP-9-7',
  motorista: 'ANDERSON JORGE', motoristaId: 7, numeroOp: '1234',
}

const desenhar = (itens: LancamentoFinanceiro[]) => render(
  <MemoryRouter><TabelaExtrato itens={itens} carregando={false} aoPagar={() => {}}/></MemoryRouter>)

test('comissão mostra o socorrista e a OP, com o nome levando à ficha dele', () => {
  desenhar([base])
  const link = screen.getByRole('link', { name: 'ANDERSON JORGE' })
  expect(link.getAttribute('href')).toBe('/equipe/7')
  expect(link.closest('strong')?.textContent).toBe('ANDERSON JORGE — comissão da OP 1234')
})

test('despesa comum continua com a própria descrição e sem link', () => {
  desenhar([{ ...base, descricao: 'Diesel', origem: 'MANUAL', protocolo: undefined,
    numeroOp: undefined, motoristaId: 7 }])
  expect(screen.getByText('Diesel')).toBeTruthy()
  expect(screen.queryByRole('link')).toBeNull()
})
