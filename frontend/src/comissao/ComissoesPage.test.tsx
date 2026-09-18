import { render,screen,within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http,HttpResponse } from 'msw'
import { afterEach,beforeEach,expect,test,vi } from 'vitest'
import { servidor } from '../test/servidor'

/**
 * As telas de comissao falam direto com o Supabase, entao o teste precisa subir
 * com as variaveis no lugar e importar a pagina depois — o cliente e criado sob
 * demanda, mas o modo e lido na importacao do modulo.
 */
const URL_SUPABASE = 'https://projeto-teste.supabase.co'

async function abrirPagina<T>(carregador: () => Promise<{ default: T }>) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', URL_SUPABASE)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('../dados/cliente')
  esquecerCliente()
  return (await carregador()).default
}

beforeEach(() => { sessionStorage.clear(); localStorage.clear() })
afterEach(() => vi.unstubAllEnvs())

const ops = [{
  id: 7, numero: '06389821', valor_total: 74770, situacao_financeira: 'RECEBIDO',
  periodo_inicio: '2026-03-30', periodo_fim: '2026-04-29',
  quantidade_ordens_servico: 275, valor_ordens_servico: 74770, divergencia: 0,
  status_conciliacao: 'CONCILIADA', periodo_financeiro: '30/03/2026 a 29/04/2026',
}]

const detalhe = {
  ordemPagamentoId: 7, numeroOp: '06389821', periodo: 'OP 06389821 · 30/03 a 29/04',
  socorrista: 'Ana Motorista', motoristaId: 4, quantidadeServicosPagos: 2,
  producaoPaga: 1000, percentualComissao: .2, comissaoBruta: 200,
  descontos: 250, descontosPendentes: 35, liquido: -50, aguardandoOp: false,
  servicos: [{ id: 1, numeroOs: 'OS-1', especialidade: 'GUINCHO', dataAtendimento: '2026-04-14',
    numeroOp: '06389821', valorServico: 1000, comissaoServico: 200 }],
  gastos: [
    { id: 9, descricao: 'Compra pessoal no cartão', data: '2026-04-10', valor: 250,
      categoria: 'Alimentação', situacao: 'PAGO', aprovada: true, descontaDaComissao: true },
    { id: 11, descricao: 'Almoço da equipe', data: '2026-04-11', valor: 40,
      categoria: 'Alimentação', situacao: 'PAGO', aprovada: true, descontaDaComissao: false },
    { id: 12, descricao: 'Pedágio pessoal', data: '2026-04-12', valor: 15,
      categoria: 'Pedágio', situacao: 'PAGO', aprovada: true, descontaDaComissao: false, descontaEmOutraOp: true },
  ],
}

const listaDeOps = () =>
  http.get(`${URL_SUPABASE}/rest/v1/porto_ops_conciliadas`, () => HttpResponse.json(ops))

/** O socorrista nao le a view de OPs: a lista dele vem por RPC, sem valor. */
const meusPeriodos = (lista = ops) =>
  http.post(`${URL_SUPABASE}/rest/v1/rpc/meus_periodos_de_op`, () => HttpResponse.json(
    lista.map(o => ({ id: o.id, numero: o.numero, periodo_inicio: o.periodo_inicio,
      periodo_fim: o.periodo_fim, data_pagamento_programada: null,
      quinzena_inicio: null, quinzena_entrega: null }))))

test('socorrista vê só a quantidade e os serviços feitos, sem dinheiro', async () => {
  servidor.use(
    meusPeriodos(),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/comissao_das_ops`, () => HttpResponse.json(detalhe)),
  )
  const MinhaComissaoPage = await abrirPagina(() => import('./MinhaComissaoPage'))

  render(<MinhaComissaoPage/>)

  expect(await screen.findByRole('heading', { name: 'Meus serviços' })).toBeInTheDocument()
  expect(await screen.findByText('OS-1')).toBeInTheDocument()
  expect(screen.getByText('Serviços feitos').nextSibling).toHaveTextContent('1')
  // Kawa, 18/09/2026: nenhum valor em dinheiro na tela do socorrista.
  expect(screen.queryByText(/R\$/)).not.toBeInTheDocument()
  expect(screen.queryByText(/alimentação/i)).not.toBeInTheDocument()
})

test('administrador filtra resumo e abre o detalhamento que forma a comissão', async () => {
  servidor.use(
    listaDeOps(),
    http.get(`${URL_SUPABASE}/rest/v1/motoristas`, () =>
      HttpResponse.json([{ id: 4, nome: 'Ana Motorista', qra: 'ANA', ativo: true }])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/resumo_comissoes_ops`, () => HttpResponse.json([
      { motoristaId: 4, socorrista: 'Ana Motorista', quantidadeServicosPagos: 2,
        producaoPaga: 1000, comissaoBruta: 200, descontos: 250, liquido: -50 },
    ])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/comissao_das_ops`, () => HttpResponse.json(detalhe)),
  )
  const ComissoesPage = await abrirPagina(() => import('./ComissoesPage'))
  const user = userEvent.setup()

  render(<ComissoesPage/>)

  const linha = await screen.findByRole('row', { name: /ana motorista/i })
  expect(within(linha).getByText('-R$ 50,00')).toBeInTheDocument()

  await user.click(within(linha).getByRole('button', { name: /detalhar/i }))
  expect(await screen.findByRole('dialog')).toHaveTextContent('OS-1')
})

// Kawa: "eu nao quero clicar para confirmar pagamento para depois aparecer no
// dashboard". A comissao ja nasce em despesas; a tela so confere.
test('comissão já lançada em despesas, sem botão de pagar', async () => {
  const positivo = { ...detalhe, descontos: 30, liquido: 170,
    pagamento: { id: 12, despesaId: 91, valorPago: 170, dataPagamento: '2026-04-29' } }
  servidor.use(
    listaDeOps(),
    http.get(`${URL_SUPABASE}/rest/v1/motoristas`, () =>
      HttpResponse.json([{ id: 4, nome: 'Ana Motorista', qra: 'ANA', ativo: true }])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/resumo_comissoes_ops`, () => HttpResponse.json([
      { motoristaId: 4, socorrista: 'Ana Motorista', quantidadeServicosPagos: 2,
        producaoPaga: 1000, comissaoBruta: 200, descontos: 30, liquido: 170,
        pagamento: { id: 12, dataPagamento: '2026-04-29' } },
    ])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/comissao_das_ops`, () => HttpResponse.json(positivo)),
  )
  const ComissoesPage = await abrirPagina(() => import('./ComissoesPage'))
  const user = userEvent.setup()

  render(<ComissoesPage/>)

  const linha = await screen.findByRole('row', { name: /ana motorista/i })
  expect(within(linha).getByText('Lançada em 29/04/2026')).toBeInTheDocument()
  await user.click(within(linha).getByRole('button', { name: /detalhar/i }))

  const dialogo = await screen.findByRole('dialog')
  expect(dialogo).toHaveTextContent(/Lançada em despesas/)
  expect(within(dialogo).queryByRole('button', { name: /registrar pagamento/i })).not.toBeInTheDocument()
})

// Todo gasto no nome dele aparece; so o marcado desconta.
test('o detalhe lista todos os gastos e diz quais descontam', async () => {
  servidor.use(
    listaDeOps(),
    http.get(`${URL_SUPABASE}/rest/v1/motoristas`, () =>
      HttpResponse.json([{ id: 4, nome: 'Ana Motorista', qra: 'ANA', ativo: true }])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/resumo_comissoes_ops`, () => HttpResponse.json([
      { motoristaId: 4, socorrista: 'Ana Motorista', quantidadeServicosPagos: 2,
        producaoPaga: 1000, comissaoBruta: 200, descontos: 250, liquido: -50 },
    ])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/comissao_das_ops`, () => HttpResponse.json(detalhe)),
  )
  const ComissoesPage = await abrirPagina(() => import('./ComissoesPage'))
  const user = userEvent.setup()

  render(<ComissoesPage/>)
  const linha = await screen.findByRole('row', { name: /ana motorista/i })
  await user.click(within(linha).getByRole('button', { name: /detalhar/i }))

  const dialogo = await screen.findByRole('dialog')
  const pessoal = within(dialogo).getByText('Compra pessoal no cartão').closest('tr')!
  const equipe = within(dialogo).getByText('Almoço da equipe').closest('tr')!
  expect(within(pessoal).getByText('Sim')).toBeInTheDocument()
  expect(within(equipe).getByText('Não')).toBeInTheDocument()
  // A Porto paga a mesma quinzena em mais de uma OP: o gasto desconta numa so.
  const outraOp = within(dialogo).getByText('Pedágio pessoal').closest('tr')!
  expect(within(outraOp).getByText('Em outra OP do período')).toBeInTheDocument()
})

// Comissao so se paga com a OP, mas quem rodou a quinzena quer saber o que vem:
// a prevista mostra isso sem se misturar com a confirmada.
test('comissão prevista da competência aparece separada da confirmada', async () => {
  let corpo: Record<string, unknown> = {}
  servidor.use(
    listaDeOps(),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/resumo_comissoes_ops`, () => HttpResponse.json([])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/porto_comissao_prevista`, async ({ request }) => {
      corpo = await request.json() as Record<string, unknown>
      return HttpResponse.json([
        { motorista_id: 4, socorrista: 'Ana Motorista', servicos: 9, sem_valor: 4,
          valor_previsto: 1200, comissao_prevista: 240 },
      ])
    }),
  )
  const ComissoesPage = await abrirPagina(() => import('./ComissoesPage'))

  render(<ComissoesPage/>)

  const titulo = await screen.findByRole('heading', { name: 'Comissão prevista' })
  const tabela = titulo.closest('section')!
  expect(within(tabela).getByText('R$ 240,00')).toBeInTheDocument()
  expect(within(tabela).getByText(/não entra em despesas/i)).toBeInTheDocument()
  // Prevista sai do período, não das OPs: o que não tem OP não está em nenhuma delas.
  expect(corpo).toEqual(expect.objectContaining({ p_motorista_id: null }))
})

test('socorrista vê só a OP mais recente, sem escolher período', async () => {
  let pedidas: unknown = null
  servidor.use(
    meusPeriodos([
      ops[0],
      { ...ops[0], id: 9, numero: '06400330', periodo_inicio: '2026-04-30', periodo_fim: '2026-05-28' },
    ]),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/comissao_das_ops`, async ({ request }) => {
      pedidas = (await request.json() as { p_op_ids: number[] }).p_op_ids
      return HttpResponse.json(detalhe)
    }),
  )
  const MinhaComissaoPage = await abrirPagina(() => import('./MinhaComissaoPage'))

  render(<MinhaComissaoPage/>)

  expect(await screen.findByText('OS-1')).toBeInTheDocument()
  // A mais recente (28/05), e nenhuma outra: sem seletor, sem "Selecione".
  expect(pedidas).toEqual([9])
  expect(screen.getByText(/30\/04\/2026 a 28\/05\/2026 · OP 06400330/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Período')).not.toBeInTheDocument()
})
