import { expect, test } from 'vitest'
import { despesasPorCategoria, resumoMensal, serieMensal } from './calculos'
import { dadosIniciais } from './dadosIniciais'
import type { DemoState } from './modelosDemo'

const estadoComDespesa = (status: 'PENDENTE' | 'PAGO'): DemoState => ({
  ...dadosIniciais,
  lancamentos: [{
    id: 1,
    tipo: 'DESPESA',
    categoria: 'Combustível',
    descricao: 'Despesa de teste',
    valor: 100,
    data: '2026-07-24',
    status,
    origem: 'Manual',
    classeCusto: 'VARIAVEL',
  }],
})

test('despesa pendente não entra no dashboard, gráficos ou lucro antes da aprovação', () => {
  const pendente = estadoComDespesa('PENDENTE')
  expect(resumoMensal(pendente, '2026-07')).toMatchObject({ despesas: 0, lucro: 0 })
  expect(despesasPorCategoria(pendente, '2026-07')).toEqual([])
  expect(serieMensal(pendente)).toEqual([{ mes: '2026-07', entradas: 0, saidas: 0 }])

  const aprovada = estadoComDespesa('PAGO')
  expect(resumoMensal(aprovada, '2026-07')).toMatchObject({ despesas: 100, lucro: -100 })
  expect(despesasPorCategoria(aprovada, '2026-07')).toEqual([{ categoria: 'Combustível', valor: 100 }])
  expect(serieMensal(aprovada)).toEqual([{ mes: '2026-07', entradas: 0, saidas: 100 }])
})
