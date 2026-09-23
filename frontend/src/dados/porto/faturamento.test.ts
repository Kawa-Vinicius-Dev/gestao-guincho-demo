import { expect, test } from 'vitest'
import { nomesCurtos } from '../../utils/nomes'
import { faturamentoPorGrupo } from './faturamento'
import type { LinhaOs } from './listaOs'

const os = (i: number, extra: Partial<LinhaOs>): LinhaOs => ({
  id: i, numero: `OS-${i}`, valorTotal: 0, situacao: 'CONCILIADA', semValor: false, ...extra,
})

const lista = [
  os(1, { motoristaId: 1, motorista: 'DJALMA BEZERRA DE MELO NETO', viatura: 'K85', valorPrevisto: 200 }),
  os(2, { motoristaId: 1, motorista: 'DJALMA BEZERRA DE MELO NETO', viatura: 'K85', semValor: true }),
  os(3, { motoristaId: 2, motorista: 'ANDERSON JORGE RIBEIRO', viatura: 'L845', valorPrevisto: 150 }),
  os(4, { viatura: undefined, valorPrevisto: 50 }),
]

test('o nome do socorrista é o primeiro, e o último sobrenome só quando o primeiro repete', () => {
  const curtos = nomesCurtos(['DJALMA BEZERRA DE MELO NETO', 'JEFERSON MARTINS DA SILVA', 'JEFERSON FILHO', 'AUXILIAR'])
  expect(curtos.get('DJALMA BEZERRA DE MELO NETO')).toBe('DJALMA')
  expect(curtos.get('JEFERSON MARTINS DA SILVA')).toBe('JEFERSON SILVA')
  expect(curtos.get('JEFERSON FILHO')).toBe('JEFERSON FILHO')
  expect(curtos.get('AUXILIAR')).toBe('AUXILIAR')
})

test('faturamento por socorrista: valor, serviços, sem valor, e a OS sem dono à parte', () => {
  const linhas = faturamentoPorGrupo(lista, 'socorrista')
  const djalma = linhas.find(l => l.chave === '1')!
  expect(djalma).toMatchObject({ rotulo: 'DJALMA', valor: 200, quantidade: 2, detalhe: '2 serviços · 1 sem valor', link: '/equipe/1' })
  expect(linhas.find(l => l.semVinculo)).toMatchObject({ rotulo: 'Sem socorrista', valor: 50, quantidade: 1 })
  // A soma das barras fecha com o total da lista.
  expect(linhas.reduce((t, l) => t + l.valor, 0)).toBe(400)
  expect(linhas.reduce((t, l) => t + (l.quantidade ?? 0), 0)).toBe(4)
})

test('faturamento por viatura casa pela sigla e, sem sigla, pela identificação', () => {
  const linhas = faturamentoPorGrupo(lista, 'viatura', [
    { id: 3, identificacao: 'K85', siglaPorto: 'K85', ativo: true } as never,
    { id: 9, identificacao: 'L845', ativo: true } as never,
  ])
  expect(linhas.find(l => l.chave === 'K85')).toMatchObject({ valor: 200, link: '/veiculos?veiculo=3' })
  expect(linhas.find(l => l.chave === 'L845')).toMatchObject({ link: '/veiculos?veiculo=9' })
  expect(linhas.find(l => l.semVinculo)).toMatchObject({ rotulo: 'Sem viatura', quantidade: 1 })
})
