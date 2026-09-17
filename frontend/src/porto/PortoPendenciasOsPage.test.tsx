import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'
import { escolher } from '../test/dropdown'

/**
 * Pendencias do periodo, depois de aprender as situacoes da conciliacao.
 *
 * O que estes testes protegem e a razao de ser da tela: ela responde "o que
 * ainda segura o fechamento deste periodo". Enquanto so conhecia falta de valor,
 * de socorrista e de viatura, a tela podia aparecer limpa com duas OS presas —
 * uma que nao veio na OP e outra que a OP pagou diferente.
 */
const SUPA = 'https://projeto-teste.supabase.co'

const base = {
  dataAtendimento: '2026-09-04', seguradora: null, especialidade: 'GUINCHO',
  competenciaInicio: '2026-08-27', competenciaFim: '2026-09-15',
}

const pendencias = [
  {
    ...base, id: 1, numeroOs: '01/1-26', siglaViatura: null, socorrista: null,
    motoristaId: null, valorTotal: 0, numeroOp: null,
    semValor: true, semSocorrista: true, semViatura: true,
    situacao: 'AGUARDANDO_ANALISE', apenasConferir: false,
  },
  {
    ...base, id: 2, numeroOs: '01/2-26', siglaViatura: 'L168',
    socorrista: 'DJALMA BEZERRA DE MELO NETO', motoristaId: 8, valorTotal: 240,
    numeroOp: null, semValor: false, semSocorrista: false, semViatura: false,
    situacao: 'AGUARDANDO_PROXIMA_OP', valorManual: 240, apenasConferir: true,
  },
  {
    ...base, id: 3, numeroOs: '01/3-26', siglaViatura: 'L204',
    socorrista: 'JEFERSON MARTINS DA SILVA', motoristaId: 1, valorTotal: 310,
    numeroOp: '06438807', semValor: false, semSocorrista: false, semViatura: false,
    situacao: 'DIVERGENTE', valorManual: 280, divergencia: 30, apenasConferir: true,
  },
]

async function abrir() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('../dados/cliente')
  esquecerCliente()
  const { default: Pagina } = await import('./PortoPendenciasOsPage')
  render(<MemoryRouter><Pagina/></MemoryRouter>)
}

beforeEach(() => {
  sessionStorage.setItem('filtro:periodo',
    JSON.stringify({ inicio: '2026-08-27', fim: '2026-09-15', op: '' }))
  servidor.use(
    http.post(`${SUPA}/rest/v1/rpc/porto_pendencias_os`, () => HttpResponse.json(pendencias)),
    http.post(`${SUPA}/rest/v1/rpc/porto_competencias`, () => HttpResponse.json([])),
    http.get(`${SUPA}/rest/v1/motoristas`, () => HttpResponse.json([
      { id: 8, nome: 'DJALMA BEZERRA DE MELO NETO', ativo: true, veiculos: null },
    ])),
    http.get(`${SUPA}/rest/v1/ordens_pagamento_porto`, () => HttpResponse.json([])),
  )
})
afterEach(() => vi.unstubAllEnvs())

test('as situações da conciliação viram indicadores da tela', async () => {
  await abrir()

  // O texto tambem e etiqueta de linha e opcao de filtro; o que importa aqui e
  // o indicador, identificado pelo apoio dele.
  expect(await screen.findByText('Não vieram na OP deste período')).toBeInTheDocument()
  // A diferença aparece em dinheiro: é o que o administrador vai conferir.
  expect(screen.getByText('R$ 30,00 entre o informado e a OP')).toBeInTheDocument()
})

test('cada linha diz em que pé está a conciliação', async () => {
  await abrir()

  const linha = (await screen.findByText('01/3-26')).closest('tr')!
  expect(within(linha).getByText('Valor divergente')).toBeInTheDocument()
  expect(within(linha).getByText('R$ 30,00 de diferença')).toBeInTheDocument()
})

test('linha sem nada a preencher não oferece campo de acerto', async () => {
  await abrir()

  // A OS que espera a próxima OP tem valor, socorrista e viatura: não há o que
  // digitar nela, só o que conferir.
  const conferir = (await screen.findByText('01/2-26')).closest('tr')!
  expect(within(conferir).queryByRole('textbox')).not.toBeInTheDocument()
  expect(within(conferir).queryByRole('combobox')).not.toBeInTheDocument()

  // A que está sem valor continua com os campos de sempre.
  const acertar = screen.getByText('01/1-26').closest('tr')!
  expect(within(acertar).getByRole('combobox')).toBeInTheDocument()
})

test('o filtro separa as duas situações novas', async () => {
  const user = userEvent.setup()
  await abrir()

  await screen.findByText('01/3-26')
  await escolher(user, 'Mostrar', 'Valor divergente')
  expect(screen.getByText('01/3-26')).toBeInTheDocument()
  expect(screen.queryByText('01/1-26')).not.toBeInTheDocument()

  await escolher(user, 'Mostrar', 'Aguardando próxima OP')
  expect(screen.getByText('01/2-26')).toBeInTheDocument()
  expect(screen.queryByText('01/3-26')).not.toBeInTheDocument()
})
