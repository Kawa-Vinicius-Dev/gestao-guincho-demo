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
  alimentacaoAprovada: 250, alimentacaoPendente: 35, liquido: -50, aguardandoOp: false,
  servicos: [{ id: 1, numeroOs: 'OS-1', especialidade: 'GUINCHO', dataAtendimento: '2026-04-14',
    numeroOp: '06389821', valorServico: 1000, comissaoServico: 200 }],
  alimentacoes: [{ id: 9, motoristaId: 4, data: '2026-04-10', valor: 250,
    situacao: 'PAGO', aprovada: true }],
}

const listaDeOps = () =>
  http.get(`${URL_SUPABASE}/rest/v1/porto_ops_conciliadas`, () => HttpResponse.json(ops))

test('socorrista vê composição auditável, saldo negativo e registra alimentação própria', async () => {
  let corpo: Record<string, unknown> = {}
  servidor.use(
    listaDeOps(),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/comissao_da_op`, () => HttpResponse.json(detalhe)),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/registrar_alimentacao`, async ({ request }) => {
      corpo = await request.json() as Record<string, unknown>
      return HttpResponse.json({ id: 10, motorista_id: 4, data_lancamento: '2026-04-20',
        valor: 35, status: 'PENDENTE', aprovada: false })
    }),
  )
  const MinhaComissaoPage = await abrirPagina(() => import('./MinhaComissaoPage'))
  const user = userEvent.setup()

  render(<MinhaComissaoPage/>)

  expect(await screen.findByText('-R$ 50,00')).toBeInTheDocument()
  expect(screen.getByText('OS-1')).toBeInTheDocument()

  // O campo usa a mascara de dinheiro como os demais: os digitos entram pela
  // direita, entao R$ 35,00 se digita "3500".
  await user.type(screen.getByLabelText(/valor da alimentação/i), '3500')
  await user.type(screen.getByLabelText(/data da alimentação/i), '2026-04-20')
  await user.click(screen.getByRole('button', { name: /registrar alimentação/i }))

  expect(corpo).toEqual(expect.objectContaining({ p_valor: 35, p_data: '2026-04-20' }))
  // De quem e a alimentacao sai da sessao, nunca do formulario.
  expect(JSON.stringify(corpo)).not.toContain('motorista')
})

test('administrador filtra resumo e abre o detalhamento que forma a comissão', async () => {
  servidor.use(
    listaDeOps(),
    http.get(`${URL_SUPABASE}/rest/v1/motoristas`, () =>
      HttpResponse.json([{ id: 4, nome: 'Ana Motorista', qra: 'ANA', ativo: true }])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/resumo_comissoes_op`, () => HttpResponse.json([
      { motoristaId: 4, socorrista: 'Ana Motorista', quantidadeServicosPagos: 2,
        producaoPaga: 1000, comissaoBruta: 200, alimentacaoAprovada: 250, liquido: -50 },
    ])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/comissao_da_op`, () => HttpResponse.json(detalhe)),
  )
  const ComissoesPage = await abrirPagina(() => import('./ComissoesPage'))
  const user = userEvent.setup()

  render(<ComissoesPage/>)

  const linha = await screen.findByRole('row', { name: /ana motorista/i })
  expect(within(linha).getByText('-R$ 50,00')).toBeInTheDocument()

  await user.click(within(linha).getByRole('button', { name: /detalhar/i }))
  expect(await screen.findByRole('dialog')).toHaveTextContent('OS-1')
})

test('administrador registra o pagamento do líquido positivo uma única vez', async () => {
  const positivo = { ...detalhe, alimentacaoAprovada: 30, liquido: 170 }
  const pagamento = { id: 12, motorista_id: 4, ordem_pagamento_id: 7, despesa_id: 91,
    valor_pago: 170, data_pagamento: '2026-04-29', forma_pagamento: 'PIX',
    criado_em: '2026-04-29T12:00:00Z' }
  let chamadas = 0

  servidor.use(
    listaDeOps(),
    http.get(`${URL_SUPABASE}/rest/v1/motoristas`, () =>
      HttpResponse.json([{ id: 4, nome: 'Ana Motorista', qra: 'ANA', ativo: true }])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/resumo_comissoes_op`, () => HttpResponse.json([
      { motoristaId: 4, socorrista: 'Ana Motorista', quantidadeServicosPagos: 2,
        producaoPaga: 1000, comissaoBruta: 200, alimentacaoAprovada: 30, liquido: 170,
        pagamento: chamadas ? { id: 12, dataPagamento: '2026-04-29' } : undefined },
    ])),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/comissao_da_op`, () =>
      HttpResponse.json(chamadas
        ? { ...positivo, pagamento: { id: 12, despesaId: 91, valorPago: 170, dataPagamento: '2026-04-29' } }
        : positivo)),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/pagar_comissao_op`, async ({ request }) => {
      chamadas++
      expect(await request.json()).toEqual(expect.objectContaining({
        p_motorista_id: 4, p_op_id: 7, p_data_pagamento: '2026-04-29', p_forma_pagamento: 'PIX',
      }))
      return HttpResponse.json(pagamento)
    }),
  )
  const ComissoesPage = await abrirPagina(() => import('./ComissoesPage'))
  const user = userEvent.setup()

  render(<ComissoesPage/>)

  const linha = await screen.findByRole('row', { name: /ana motorista/i })
  await user.click(within(linha).getByRole('button', { name: /detalhar/i }))

  const dialogo = await screen.findByRole('dialog')
  await user.type(within(dialogo).getByLabelText(/data do pagamento/i), '2026-04-29')
  await user.click(within(dialogo).getByRole('button', { name: /registrar pagamento/i }))

  expect(await screen.findByText('Pagamento registrado no financeiro oficial.')).toBeInTheDocument()
  // Pagar duas vezes o mesmo socorrista na mesma OP e o erro que o banco recusa;
  // a tela nao deve nem oferecer o botao de novo.
  expect(chamadas).toBe(1)
  expect(within(screen.getByRole('dialog'))
    .queryByRole('button', { name: /registrar pagamento/i })).not.toBeInTheDocument()
})
