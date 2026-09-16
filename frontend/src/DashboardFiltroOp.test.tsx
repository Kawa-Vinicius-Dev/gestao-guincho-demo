import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from './test/servidor'

const SUPA = 'https://projeto-teste.supabase.co'

beforeEach(() => { sessionStorage.clear(); localStorage.clear() })
afterEach(() => vi.unstubAllEnvs())

async function abrirVisao() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('./dados/cliente')
  esquecerCliente()
  servidor.use(
    http.get(`${SUPA}/rest/v1/porto_ops_conciliadas`, () => HttpResponse.json([{
      id: 1, numero: '06389821', valor_total: 74770, situacao_financeira: 'RECEBIDO',
      periodo_inicio: '2026-03-30', periodo_fim: '2026-04-29', data_pagamento_programada: '2026-06-07',
    }])),
    http.post(`${SUPA}/rest/v1/rpc/dashboard_resumo`, () => HttpResponse.json({ financeiro: null, porto: null })),
  )
  return (await import('./DashboardPage')).default
}

// O mesmo atalho do painel Porto: a OP ja sabe o proprio periodo.
test('escolher a OP preenche as datas com o período dela', async () => {
  const Visao = await abrirVisao()
  const user = userEvent.setup()
  render(<MemoryRouter><Visao/></MemoryRouter>)

  const op = await screen.findByLabelText('Ordem de pagamento')
  await screen.findByRole('option', { name: /OP 06389821/ })
  await user.selectOptions(op, '1')

  expect(screen.getByLabelText('Data inicial')).toHaveValue('2026-03-30')
  expect(screen.getByLabelText('Data final')).toHaveValue('2026-04-29')
})

test('mexer numa data volta para período personalizado', async () => {
  const Visao = await abrirVisao()
  const user = userEvent.setup()
  render(<MemoryRouter><Visao/></MemoryRouter>)

  const op = await screen.findByLabelText('Ordem de pagamento')
  await screen.findByRole('option', { name: /OP 06389821/ })
  await user.selectOptions(op, '1')
  const fim = screen.getByLabelText('Data final')
  await user.clear(fim); await user.type(fim, '2026-04-30')

  expect(op).toHaveValue('')
})
