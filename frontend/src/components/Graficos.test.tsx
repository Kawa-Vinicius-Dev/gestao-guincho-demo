import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { FaixaDeIndicadores } from '../dashboard/PaineisDoResultado'
import type { Dashboard } from '../types/modelos'
import { DespesaAcumulada, GastosPorCategoria, ProducaoXRecebimentos } from './Graficos'

test('rosca mantém valores exatos e agrupa só o que excede cinco categorias', () => {
  render(<GastosPorCategoria total={1000} linhas={[
    { id:1, rotulo:'Combustível', valor:400, participacao:40 },
    { id:2, rotulo:'Manutenção', valor:200, participacao:20 },
    { id:3, rotulo:'Comissão', valor:150, participacao:15 },
    { id:4, rotulo:'Alimentação', valor:100, participacao:10 },
    { id:5, rotulo:'Pedágio', valor:80, participacao:8 },
    { id:6, rotulo:'Limpeza', valor:70, participacao:7 },
  ]}/>)

  const lista=screen.getByRole('list',{name:'Despesas por categoria'})
  expect(within(lista).getAllByRole('listitem')).toHaveLength(6)
  expect(within(lista).getByText('Combustível').closest('li')).toHaveTextContent('R$ 400,00')
  expect(within(lista).getByText('Outros').closest('li')).toHaveTextContent('R$ 70,00')
})

test('trajetória descreve os gastos e usa linha em degraus', () => {
  render(<DespesaAcumulada inicio="2026-09-01" fim="2026-09-30" pontos={[
    { data:'2026-09-08', valorDia:400, acumulado:400 },
    { data:'2026-09-21', valorDia:150, acumulado:550 },
  ]}/>)

  const grafico=screen.getByRole('img',{name:/08\/09: R\$\s*400,00 no dia/})
  expect(grafico.querySelector('.trajetoria-linha')?.getAttribute('d')).toContain(' H ')
  expect(screen.getByText(/Maior gasto em 08\/09/)).toHaveTextContent('R$ 400,00')
})

test('trajetória não desenha coordenadas inválidas ou fora do período', () => {
  const { rerender }=render(<DespesaAcumulada inicio="" fim="2026-09-30" pontos={[
    { data:'2026-09-08', valorDia:400, acumulado:400 },
  ]}/>)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getByText(/Informe um período válido/)).toBeInTheDocument()

  rerender(<DespesaAcumulada inicio="2026-09-01" fim="2026-09-30" pontos={[
    { data:'2026-10-08', valorDia:400, acumulado:400 },
  ]}/>)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('a receber não soma de novo o valor que já está em atraso', () => {
  const dados={
    receitaRecebida:1000,receitaPrevista:300,totalAtrasado:200,
    despesasPagas:200,despesasPrevistas:0,saldoRealizado:800,saldoProjetado:1100,
    registrosImportados:0,quilometragemTotal:0,kmRemunerado:0,kmMorto:0,custoKmMorto:0,
    resultadoPorVeiculo:[],producaoPaga:0,comissaoSobreProducao:0,producaoPendente:0,
    servicosPendentes:0,servicosDoPeriodo:0,comissaoAPagar:0,despesasPorCategoria:[],
    resultadoPorSocorrista:[],
  } satisfies Dashboard

  render(<FaixaDeIndicadores dados={dados} margem={80}/>)

  const cartao=screen.getByText('A receber').closest('article')
  expect(cartao).toHaveTextContent('R$ 300,00')
  expect(cartao).not.toHaveTextContent('R$ 500,00')
  expect(cartao).toHaveTextContent('R$ 200,00 em atraso')
})

// Os rotulos do eixo sao desenhados para a esquerda a partir da margem. Com a
// margem simetrica de antes sobravam 48px para "R$ 74,8 mil" — onze caracteres
// de monospace 10px, uns 66px —, e o texto vazava do painel, colado na borda.
test('o maior rótulo do eixo cabe dentro do gráfico, sem vazar pela esquerda', () => {
  const { container } = render(<ProducaoXRecebimentos
    pontos={[
      { inicio: '2026-04-23', produzido: 74800, recebido: 0, programado: 0, servicos: 1 },
      { inicio: '2026-04-24', produzido: 12000, recebido: 74800, programado: 0, servicos: 1 },
    ]}
    rotulo={inicio => inicio.slice(8)}/>)

  const rotulos = [...container.querySelectorAll('text.producao-escala')]
  expect(rotulos.length).toBeGreaterThan(0)

  const LARGURA_DO_CARACTERE = 6   // monospace 10px
  for (const rotulo of rotulos) {
    const direita = Number(rotulo.getAttribute('x'))
    const esquerda = direita - (rotulo.textContent ?? '').length * LARGURA_DO_CARACTERE
    expect(esquerda, `"${rotulo.textContent}" comeca em ${esquerda}`).toBeGreaterThan(0)
  }
})
