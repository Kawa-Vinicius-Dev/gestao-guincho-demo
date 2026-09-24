import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { URL_SUPABASE, servidor } from '../test/servidor'

/**
 * Contestacoes (Kawa, 24/09/2026): o que a Porto deve aparece somado no topo, os
 * quadros filtram a lista, e cada caso anda: contestei, pagou, perdida.
 */
const os = (numero: string, extra: Record<string, unknown> = {}) => ({
  id: 1, numero, data_atendimento: '2026-09-05', especialidade: 'REMOCAO', sigla_viatura: 'L168',
  motorista_id: 3, motoristas: { nome: 'DJALMA BEZERRA' }, ordens_pagamento_porto: null, ...extra,
})
const casos = [
  { id: 1, tipo: 'NAO_PAGA', situacao: 'A_CONTESTAR', valor_esperado: '205.00', valor_pago: '0.00', prazo: '2026-09-26',
    contestada_em: null, protocolo: null, observacao: null, resolvida_em: null, valor_recuperado: null, ordens_servico_porto: os('5673329/26') },
  { id: 2, tipo: 'PAGA_A_MENOS', situacao: 'CONTESTADA', valor_esperado: '205.00', valor_pago: '150.00', prazo: '2026-10-20',
    contestada_em: '2026-09-20', protocolo: 'PRT-9', observacao: null, resolvida_em: null, valor_recuperado: null,
    ordens_servico_porto: os('5673400/26', { ordens_pagamento_porto: { numero: '06438807' } }) },
  { id: 3, tipo: 'NAO_PAGA', situacao: 'ACEITA', valor_esperado: '180.00', valor_pago: '180.00', prazo: '2026-10-01',
    contestada_em: '2026-09-10', protocolo: null, observacao: 'Paga na OP 06438808', resolvida_em: '2026-09-22',
    valor_recuperado: '180.00', ordens_servico_porto: os('5670000/26') },
]

afterEach(() => { vi.useRealTimers() })

async function abrir(filtro = '') {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-24T12:00:00'))
  let enviado: unknown = null
  servidor.use(
    http.post(`${URL_SUPABASE}/rest/v1/rpc/porto_detectar_contestacoes`, () => HttpResponse.json(1)),
    http.get(`${URL_SUPABASE}/rest/v1/porto_contestacoes`, () => HttpResponse.json(casos)),
    http.patch(`${URL_SUPABASE}/rest/v1/porto_contestacoes`, async ({ request }) => {
      enviado = await request.json(); return HttpResponse.json([{ id: 1 }])
    }),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/porto_especialidades_vistas`, () => HttpResponse.json([
      { especialidade: 'REMOCAO', servicos: 40, valor_mais_comum: '205.00', valor_tabela: '205.00' },
    ])),
  )
  const { default: Pagina } = await import('./PortoContestacoesPage')
  render(<MemoryRouter initialEntries={[`/porto/contestacoes${filtro}`]}><Pagina /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Contestações' })
  // A data fica fixa ate o fim do teste (afterEach): os dados podem chegar depois
  // do titulo, e o "no mes" do topo precisa do mesmo hoje.
  return () => enviado
}

test('o topo soma o que a Porto deve, e os quadros levam ao filtro', async () => {
  await abrir()

  expect(screen.getByText('1 caso novo encontrado nas OPs.')).toBeInTheDocument()
  // Em aberto: 205 (nao paga) + 55 (paga a menos).
  const deve = screen.getByRole('link', { name: /A Porto deve/ })
  expect(deve).toHaveTextContent('R$ 260,00')
  expect(deve).toHaveAttribute('href', '/porto/contestacoes?filtro=abertos')
  expect(screen.getByRole('link', { name: /Recuperado no mês/ })).toHaveTextContent('R$ 180,00')
  // Aberto por padrao: o caso aceito nao aparece na lista.
  expect(screen.getByRole('link', { name: '5673329/26' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '5670000/26' })).not.toBeInTheDocument()
})

test('filtro de aceitas mostra o que voltou', async () => {
  await abrir('?filtro=ACEITA')

  expect(screen.getByRole('link', { name: '5670000/26' })).toBeInTheDocument()
  expect(screen.getByText('voltou R$ 180,00')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '5673329/26' })).not.toBeInTheDocument()
})

test('marcar como contestada grava o protocolo', async () => {
  const enviado = await abrir()
  const user = userEvent.setup({ delay: null })

  const linha = screen.getByRole('link', { name: '5673329/26' }).closest('tr')!
  await user.click(within(linha).getByRole('button', { name: 'Contestei' }))
  await user.type(screen.getByLabelText('Protocolo na Porto'), 'PRT-77')
  await user.click(screen.getByRole('button', { name: 'Marcar como contestada' }))

  expect(await screen.findByText('OS 5673329/26 marcada como contestada.')).toBeInTheDocument()
  expect(enviado()).toMatchObject({ situacao: 'CONTESTADA', protocolo: 'PRT-77' })
})

test('dar como perdida pergunta antes', async () => {
  const enviado = await abrir()
  const user = userEvent.setup({ delay: null })

  const linha = screen.getByRole('link', { name: '5673329/26' }).closest('tr')!
  await user.click(within(linha).getByRole('button', { name: 'Perdida' }))
  expect(screen.getByRole('heading', { name: 'Dar este caso como perdido?' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Dar como perdido' }))

  expect(await screen.findByText('OS 5673329/26 dada como perdida.')).toBeInTheDocument()
  expect(enviado()).toEqual({ situacao: 'PERDIDA' })
})
