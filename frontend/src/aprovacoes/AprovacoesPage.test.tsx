import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

/**
 * Fila de aprovacoes.
 *
 * Duas regras sao verificadas aqui, e as duas sao de negocio, nao de tela: toda
 * linha diz de qual socorrista veio, e aprovar um turno avisa antes que aquilo
 * vira quilometragem da empresa.
 */
const SUPA = 'https://projeto-teste.supabase.co'

const fila = {
  itens: [
    {
      tipo: 'TURNO', id: 2, data: '2026-09-16', socorristaId: 1,
      socorrista: 'JEFERSON MARTINS DA SILVA', qra: 'JM-12', veiculoId: 2, veiculo: 'L168',
      hodometroInicial: 148138, hodometroFinal: 148320, kmRodado: 182, custoPorKm: 1.85,
      fotoAbertura: null, fotoFechamento: 'turnos/2/fechamento-1.jpg', osNoDia: 7,
    },
    {
      tipo: 'DESPESA', id: 51, data: '2026-09-16', socorristaId: 4,
      socorrista: 'NATANAEL JOSE DE FREITAS NETO', qra: 'NT-08',
      descricao: 'Almoço em serviço', valor: 38.5, categoria: 'Alimentação',
      veiculo: 'L204', comprovante: null, descontaDaComissao: true,
    },
  ],
  turnosNaoFechados: [{
    id: 5, data: '2026-09-15', socorristaId: 2, socorrista: 'QEBSON RAMOS DA SILVA',
    veiculo: 'L311', hodometroInicial: 71220, diasEmAberto: 2,
  }],
}

async function abrir() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('../dados/cliente')
  esquecerCliente()
  const { default: Pagina } = await import('./AprovacoesPage')
  render(<MemoryRouter><Pagina/></MemoryRouter>)
}

afterEach(() => vi.unstubAllEnvs())

test('cada item da fila diz de qual socorrista veio', async () => {
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/fila_de_aprovacoes`, () => HttpResponse.json(fila)))
  await abrir()

  expect(await screen.findByRole('heading', { name: /JEFERSON MARTINS DA SILVA/ }))
    .toHaveTextContent('QRA JM-12')
  expect(screen.getByRole('heading', { name: /NATANAEL JOSE DE FREITAS NETO/ }))
    .toHaveTextContent('QRA NT-08')
})

test('o km morto acompanha o km produtivo que o administrador reconhece', async () => {
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/fila_de_aprovacoes`, () => HttpResponse.json(fila)))
  const user = userEvent.setup()
  await abrir()

  // Sem km produtivo, o turno inteiro e km morto: 182 km a R$ 1,85.
  expect(await screen.findByText(/custo R\$ 336,70/)).toBeInTheDocument()

  const campo = screen.getByLabelText('Km produtivo reconhecido')
  await user.clear(campo)
  await user.type(campo, '150')
  expect(screen.getByText(/32 km/)).toBeInTheDocument()
})

test('aprovar o turno avisa que o km entra no sistema', async () => {
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/fila_de_aprovacoes`, () => HttpResponse.json(fila)))
  const user = userEvent.setup()
  await abrir()

  const cartao = (await screen.findAllByRole('article'))[0]
  await user.click(within(cartao).getByRole('button', { name: 'Aprovar' }))

  expect(await screen.findByRole('heading', { name: 'Aprovar o turno?' })).toBeInTheDocument()
  expect(screen.getByText(/quilometragem da empresa/)).toBeInTheDocument()
  // Sem km produtivo informado, quem aprova precisa saber o que esta assinando.
  expect(screen.getByText(/o turno inteiro vira km morto/)).toBeInTheDocument()
})

test('devolver exige o motivo, que e o que o socorrista vai ler', async () => {
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/fila_de_aprovacoes`, () => HttpResponse.json(fila)))
  const user = userEvent.setup()
  await abrir()

  const cartao = (await screen.findAllByRole('article'))[0]
  await user.click(within(cartao).getByRole('button', { name: 'Devolver' }))

  const botao = await screen.findByRole('button', { name: 'Devolver turno' })
  expect(botao).toBeDisabled()
  await user.type(screen.getByPlaceholderText(/a foto não mostra/i), 'A foto não mostra o odômetro.')
  expect(botao).toBeEnabled()
})

test('turno aberto de dia passado aparece como cobranca, nao como aprovacao', async () => {
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/fila_de_aprovacoes`, () => HttpResponse.json(fila)))
  await abrir()

  expect(await screen.findByText(/QEBSON RAMOS DA SILVA/)).toBeInTheDocument()
  expect(screen.getByText(/2 dias em aberto/)).toBeInTheDocument()
})
