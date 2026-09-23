import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

/** Kawa, 22/09/2026: "em certas OPs ele usa 17%". Digita-se 17, o banco recebe 0,17. */
const SUPA = 'https://projeto-teste.supabase.co'

beforeEach(() => { sessionStorage.clear() })
afterEach(() => vi.unstubAllEnvs())

test('editar a OP para 17% manda 0,17 e avisa que vale para todos da OP', async () => {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  let enviado: Record<string, unknown> | null = null
  servidor.use(
    http.get(`${SUPA}/rest/v1/ordens_pagamento_porto`, () =>
      HttpResponse.json([{ id: 9, numero: '06438807', percentual_comissao: null }])),
    http.post(`${SUPA}/rest/v1/rpc/definir_percentual_da_op`, async ({ request }) => {
      enviado = await request.json() as Record<string, unknown>
      return HttpResponse.json({ id: 9 })
    }),
  )
  const { esquecerCliente } = await import('../dados/cliente')
  esquecerCliente()
  const { PercentualDasOps } = await import('./PercentualDasOps')
  const mudou = vi.fn()
  render(<PercentualDasOps ids={[9]} padrao={0.2} aoMudar={mudou}/>)

  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Editar a comissão da OP 06438807' }))
  const janela = await screen.findByRole('dialog')
  expect(within(janela).getByText('todos os socorristas desta OP')).toBeTruthy()
  await user.type(within(janela).getByLabelText(/comissão desta op/i), '17')
  await user.click(within(janela).getByRole('button', { name: /salvar e refazer/i }))

  await vi.waitFor(() => expect(enviado).toEqual({ p_op_id: 9, p_percentual: 0.17 }))
  await vi.waitFor(() => expect(mudou).toHaveBeenCalled())
})
