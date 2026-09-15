import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { Selecao } from './Selecao'

/** Passa do limite que liga a busca, como a lista de veiculos e a de periodos. */
const veiculos = Array.from({ length: 12 }, (_, indice) => ({
  valor: `v${indice}`, texto: `Viatura ${indice}`,
}))

async function abrir(user: ReturnType<typeof userEvent.setup>, rotulo: string) {
  await user.click(screen.getByLabelText(rotulo))
  return screen.findByRole('dialog', { name: rotulo })
}

// O painel abria sempre na primeira linha: o efeito que zera o destaque ao buscar
// rodava tambem na montagem e jogava fora o indice do valor atual. Numa lista de
// doze viaturas a pessoa abria o campo sem ver qual estava escolhida, e a seta
// para baixo andava a partir do topo em vez de a partir dela.
test('abre com o destaque na opcao ja escolhida, nao na primeira', async () => {
  const user = userEvent.setup()
  render(<Selecao rotulo="Viatura" opcoes={veiculos} value="v7" onChange={() => {}}/>)

  const painel = await abrir(user, 'Viatura')

  expect(within(painel).getByRole('option', { selected: true }))
    .toHaveAttribute('data-destacado', 'sim')
})

test('buscar devolve o destaque ao topo da lista filtrada', async () => {
  const user = userEvent.setup()
  render(<Selecao rotulo="Viatura" opcoes={veiculos} value="v7" onChange={() => {}}/>)

  const painel = await abrir(user, 'Viatura')
  await user.type(within(painel).getByLabelText('Buscar em Viatura'), 'Viatura 1')

  expect(within(painel).getAllByRole('option')[0]).toHaveAttribute('data-destacado', 'sim')
})

// O <select> nativo continua sendo o controle de verdade: e dele que o formulario
// tira o valor. Clicar na linha do painel precisa chegar ate ele.
test('escolher no painel escreve no select que o formulario envia', async () => {
  const user = userEvent.setup()
  render(<form><Selecao rotulo="Viatura" name="viatura" opcoes={veiculos} defaultValue="v7"/></form>)

  const painel = await abrir(user, 'Viatura')
  await user.click(within(painel).getByRole('option', { name: 'Viatura 3' }))

  expect(screen.getByLabelText('Viatura')).toHaveValue('v3')
})

// O listener de rolagem e em captura, para enxergar a rolagem de qualquer
// container que mova o campo por baixo do painel. So que em captura ele tambem
// enxergava a rolagem da PROPRIA lista: numa lista longa, como a de periodos da
// Porto, rolar para achar a opcao fechava o painel na cara da pessoa.
test('rolar a propria lista nao fecha o painel', async () => {
  const user = userEvent.setup()
  render(<Selecao rotulo="Período" opcoes={veiculos}/>)
  const painel = await abrir(user, 'Período')

  const lista = within(painel).getByRole('listbox', { name: 'Período' })
  act(() => { lista.dispatchEvent(new Event('scroll', { bubbles: true })) })

  expect(screen.getByRole('dialog', { name: 'Período' })).toBeInTheDocument()
})

test('rolar a pagina fecha o painel, que perderia a ancora no campo', async () => {
  const user = userEvent.setup()
  render(<Selecao rotulo="Período" opcoes={veiculos}/>)
  await abrir(user, 'Período')

  act(() => { document.body.dispatchEvent(new Event('scroll', { bubbles: true })) })

  expect(screen.queryByRole('dialog', { name: 'Período' })).not.toBeInTheDocument()
})

// No celular o teclado virtual e a barra de endereco mudam a altura da janela e
// disparam resize. Fechar nisso tornava o campo inutilizavel no telefone: o
// painel abria, o teclado subia e ele se fechava antes de dar para escolher.
// So aparecia em listas acima de 8 opcoes, que sao as que ganham busca — foi o
// calendario da Porto passar de 8 ciclos que deixou o campo travado.
test('teclado virtual (muda so a altura) nao fecha o painel', async () => {
  const user = userEvent.setup()
  render(<Selecao rotulo="Período" opcoes={veiculos}/>)
  await abrir(user, 'Período')

  act(() => {
    window.innerHeight = 380          // teclado ocupou metade da tela
    window.dispatchEvent(new Event('resize'))
  })

  expect(screen.getByRole('dialog', { name: 'Período' })).toBeInTheDocument()
})

test('girar o aparelho (muda a largura) fecha o painel, que perderia a ancora', async () => {
  const user = userEvent.setup()
  render(<Selecao rotulo="Período" opcoes={veiculos}/>)
  await abrir(user, 'Período')

  act(() => {
    window.innerWidth = 900
    window.dispatchEvent(new Event('resize'))
  })

  expect(screen.queryByRole('dialog', { name: 'Período' })).not.toBeInTheDocument()
})
