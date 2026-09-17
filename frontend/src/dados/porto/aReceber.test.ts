import { http, HttpResponse } from 'msw'
import { afterEach, expect, test, vi } from 'vitest'
import { servidor } from '../../test/servidor'

const SUPA = 'https://projeto-teste.supabase.co'

async function carregar() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('../cliente')
  esquecerCliente()
  return import('../porto')
}

afterEach(() => vi.unstubAllEnvs())

// Kawa: a receber e so o que veio pelo painel diario e ainda nao foi pago numa OP.
test('contas a receber pedem só OS sem OP e não canceladas, no período', async () => {
  let consulta = new URLSearchParams()
  servidor.use(http.get(`${SUPA}/rest/v1/ordens_servico_porto`, ({ request }) => {
    consulta = new URL(request.url).searchParams
    return HttpResponse.json([])
  }))
  const { listarOrdensServicoPorto } = await carregar()

  await listarOrdensServicoPorto(new URLSearchParams({ dataInicio: '2026-09-01', dataFim: '2026-09-15', aReceber: 'true' }))

  expect(consulta.get('ordem_pagamento_id')).toBe('is.null')
  expect(consulta.get('status_operacional')).toBe('neq.CANCELADO')
  expect(consulta.getAll('data_atendimento')).toEqual(['gte.2026-09-01', 'lte.2026-09-15'])
})
