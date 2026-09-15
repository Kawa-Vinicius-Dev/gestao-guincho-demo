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

// Rolar, girar o aparelho ou abrir o teclado nao podem matar a escolha em
// andamento. Cada um desses ja foi um bug separado; a regra agora e uma so —
// o painel se reposiciona e segue aberto.
test.each([
  ['rolar a propria lista', () => {
    const lista = screen.getByRole('listbox', { name: 'Período' })
    lista.dispatchEvent(new Event('scroll', { bubbles: true }))
  }],
  ['rolar a pagina', () => {
    document.body.dispatchEvent(new Event('scroll', { bubbles: true }))
  }],
  ['teclado virtual (muda a altura)', () => {
    window.innerHeight = 380
    window.dispatchEvent(new Event('resize'))
  }],
  ['girar o aparelho (muda a largura)', () => {
    window.innerWidth = 900
    window.dispatchEvent(new Event('resize'))
  }],
])('%s nao fecha o painel', async (_nome, mexer) => {
  const user = userEvent.setup()
  render(<Selecao rotulo="Período" opcoes={veiculos}/>)
  await abrir(user, 'Período')

  act(() => { mexer() })

  expect(screen.getByRole('dialog', { name: 'Período' })).toBeInTheDocument()
})

// No celular o painel cobre a tela e leva o foco para dentro de si — o que rola
// a pagina e tira o campo de vista. Fechar nessa hora tornava o dropdown
// impossivel de abrir: ele aparecia e sumia no mesmo toque. NADA que mexa na
// janela pode fechar o painel; so Esc, o fundo ou escolher uma opcao.
test('campo sair de vista nao fecha o painel', async () => {
  const user = userEvent.setup()
  render(<Selecao rotulo="Período" opcoes={veiculos}/>)
  // Depois de aberto o painel tambem se chama "Período": pega o campo antes.
  const campo = screen.getByLabelText('Período')
  await abrir(user, 'Período')

  campo.getBoundingClientRect = () => ({ top: -500, bottom: -450 }) as DOMRect
  act(() => { document.body.dispatchEvent(new Event('scroll', { bubbles: true })) })
  // O reposicionamento roda dentro de requestAnimationFrame: sem esperar o
  // quadro a asercao acerta antes de ele rodar e o teste nao prova nada.
  await act(async () => { await new Promise(pronto => setTimeout(pronto, 50)) })

  expect(screen.getByRole('dialog', { name: 'Período' })).toBeInTheDocument()
})
