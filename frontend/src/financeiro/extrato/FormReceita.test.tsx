import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../../test/servidor'

/**
 * A receita simples do extrato, que substituiu a tela de Creditos: descricao,
 * valor e data bastam, e ela sai recebida naquele dia.
 */
const SUPA = 'https://projeto-teste.supabase.co'

beforeEach(() => { sessionStorage.clear() })
afterEach(() => vi.unstubAllEnvs())

test('registrar receita grava descrição, valor e data, já recebida', async () => {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  let enviado: Record<string, unknown> | null = null
  servidor.use(http.post(`${SUPA}/rest/v1/receitas`, async ({ request }) => {
    enviado = await request.json() as Record<string, unknown>
    return HttpResponse.json({ id: 1, ...enviado, manual: true })
  }))
  const { esquecerCliente } = await import('../../dados/cliente')
  esquecerCliente()
  const { FormReceita } = await import('./FormReceita')
  const salvou = vi.fn()
  render(<FormReceita categorias={[]} aoSalvar={salvou} aoFechar={() => {}}/>)

  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Descrição'), 'Créditos da OP 1234')
  await user.type(screen.getByLabelText('Valor'), '46833')
  const data = screen.getByLabelText('Data')
  await user.clear(data); await user.type(data, '2026-09-15')
  await user.click(screen.getByRole('button', { name: 'Registrar receita' }))

  await vi.waitFor(() => expect(salvou).toHaveBeenCalled())
  expect(enviado).toMatchObject({
    descricao: 'Créditos da OP 1234', valor: 468.33, data_competencia: '2026-09-15',
    data_recebimento: '2026-09-15', status: 'RECEBIDA', recorrente: false,
  })
})
