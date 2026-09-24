import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import { URL_SUPABASE, servidor } from '../test/servidor'

/** Atendimentos (Kawa, 24/09/2026): a prova do local junto com a OS, quando ela chega. */
const atendimento = (id: number, extra: Record<string, unknown>) => ({
  id, numeroOs: '5673329/26', numeroNormalizado: '567332926', chegadaEm: '2026-09-20T13:05:00Z', placa: 'ABC1D23',
  motoristaId: 4, motorista: 'DJALMA BEZERRA', viatura: 'L168', fotos: { antes: ['atendimentos/1/a.jpg'], depois: [] },
  assinatura: 'atendimentos/1/s.png', nomeAssinante: 'Maria', observacao: null, arquivosApagados: false,
  osId: 9, dataAtendimento: '2026-09-20', especialidade: 'REMOCAO', numeroOp: null, ...extra,
})

test('mostra a prova com a OS e aponta o que ainda não bateu com nenhuma OS', async () => {
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/atendimentos_registrados`, () => HttpResponse.json([
    atendimento(1, {}),
    atendimento(2, { numeroOs: '5670000/26', numeroNormalizado: '567000026', osId: null, especialidade: null, assinatura: null }),
  ])))
  const { default: Pagina } = await import('./AtendimentosPage')
  render(<MemoryRouter><Pagina /></MemoryRouter>)

  expect(await screen.findByRole('link', { name: '5673329/26' })).toBeInTheDocument()
  const semOs = screen.getByText('5670000/26').closest('tr')!
  expect(within(semOs).getByText('OS ainda não chegou')).toBeInTheDocument()
  const comOs = screen.getByRole('link', { name: '5673329/26' }).closest('tr')!
  expect(within(comOs).getByText('assinado')).toBeInTheDocument()
  expect(within(comOs).getByRole('button', { name: 'Ver prova' })).toBeInTheDocument()
})
