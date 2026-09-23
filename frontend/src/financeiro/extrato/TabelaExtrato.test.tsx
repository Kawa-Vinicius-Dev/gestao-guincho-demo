import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import type { LancamentoFinanceiro } from '../../types/modelos'
import { moeda } from '../../utils/formatadores'
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

test('despesa comum continua com a própria descrição, e o único link é o Editar', () => {
  desenhar([{ ...base, descricao: 'Diesel', origem: 'MANUAL', protocolo: undefined,
    numeroOp: undefined, motoristaId: 7 }])
  expect(screen.getByText('Diesel')).toBeTruthy()
  expect(screen.getAllByRole('link').map(l => l.textContent)).toEqual(['Editar'])
  expect(screen.getByRole('link', { name: 'Editar' }).getAttribute('href')).toBe('/despesas?editar=1')
})

test('a comissão lançada pelo sistema não se edita pelo extrato', () => {
  desenhar([base])
  expect(screen.queryByRole('link', { name: 'Editar' })).toBeNull()
})

test('agrupa por dia, com o saldo realizado do dia e o previsto à parte', () => {
  desenhar([
    { ...base, id: 'R1', tipo: 'RECEITA', descricao: 'OP 1234', valor: 1000, origem: 'IMPORTADA', numeroOp: undefined },
    { ...base, id: 'D2', descricao: 'Diesel', valor: 300, origem: 'MANUAL', numeroOp: undefined },
    { ...base, id: 'D3', descricao: 'Pneu', valor: 50, realizado: false, status: 'PENDENTE', origem: 'MANUAL', numeroOp: undefined },
    { ...base, id: 'D4', descricao: 'Pedágio', valor: 20, data: '2026-09-14', origem: 'MANUAL', numeroOp: undefined },
  ])
  const dias = document.querySelectorAll('tr.extrato-dia')
  expect(dias).toHaveLength(2)
  expect(dias[0]!.textContent).toContain('15/09/2026')
  expect(dias[0]!.textContent).toContain('3 lançamentos')
  // 1000 recebidos menos 300 pagos; os 50 pendentes ficam como previsto.
  expect(dias[0]!.textContent).toContain(moeda(700))
  expect(dias[0]!.textContent).toMatch(/−\sR\$\s50,00 previsto/)
  expect(dias[1]!.textContent).toContain(moeda(-20))
})

test('categoria, viatura e origem ficam no detalhe, que abre com um clique', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  desenhar([{ ...base, descricao: 'Diesel', origem: 'RECORRENTE', numeroOp: undefined, veiculo: 'L25', veiculoId: 3 }])
  expect(screen.queryByText('Despesa fixa')).toBeNull()
  await user.click(screen.getByRole('button', { name: /ver detalhes de diesel/i }))
  expect(screen.getByText('Despesa fixa')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'L25' }).getAttribute('href')).toBe('/veiculos?veiculo=3')
  await user.click(screen.getByRole('button', { name: /fechar detalhes de diesel/i }))
  expect(screen.queryByText('Despesa fixa')).toBeNull()
})
