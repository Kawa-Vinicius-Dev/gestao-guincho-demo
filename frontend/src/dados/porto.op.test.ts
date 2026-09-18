import { http, HttpResponse } from 'msw'
import { afterEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

/**
 * Gravacao da OP no modo Supabase.
 *
 * O formulario manda `valorInformado` e `dataPrevista`, e a gravacao lia
 * `valorTotal` e `dataPagamentoProgramada`: editar uma OP gravava valor 0, apagava
 * a data prevista e, de brinde, zerava o codigo e o calendario que o formulario
 * nem mostra.
 */
const SUPA = 'https://projeto-teste.supabase.co'

async function carregar() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const cliente = await import('./cliente')
  cliente.esquecerCliente()
  return import('./porto')
}

const detalhe = {
  ordemPagamento: { id: 10, numero: '06438807', valor_total: 78696.67, situacao_financeira: 'RECEBIDO' },
  ordensServico: [], justificativas: [], historico: [],
}

afterEach(() => vi.unstubAllEnvs())

test('editar a OP grava o valor e a data do formulário, sem apagar o que ele não mostra', async () => {
  let corpo: Record<string, unknown> = {}
  servidor.use(
    http.patch(`${SUPA}/rest/v1/ordens_pagamento_porto`, async ({ request }) => {
      corpo = await request.json() as Record<string, unknown>
      return HttpResponse.json({ id: 10 })
    }),
    http.post(`${SUPA}/rest/v1/rpc/porto_detalhe_op`, () => HttpResponse.json(detalhe)),
  )
  const { atualizarOrdemPagamentoPorto } = await carregar()

  await atualizarOrdemPagamentoPorto(10, {
    numero: '06438807', dataPrevista: '2026-09-16', valorInformado: 78696.67,
    statusPorto: 'PAGO', observacao: '',
  })

  expect(corpo.valor_total).toBe(78696.67)
  expect(corpo.data_pagamento_programada).toBe('2026-09-16')
  expect(corpo).not.toHaveProperty('nome_codigo')
  expect(corpo).not.toHaveProperty('calendario_pagamento_id')
})

test('a quinzena da Porto vai pela RPC que refaz período, receita e comissão', async () => {
  let chamada: Record<string, unknown> = {}
  servidor.use(
    http.post(`${SUPA}/rest/v1/rpc/porto_definir_quinzena_op`, async ({ request }) => {
      chamada = await request.json() as Record<string, unknown>
      return HttpResponse.json({ id: 10 })
    }),
  )
  const { definirQuinzenaOp } = await carregar()

  await definirQuinzenaOp(10, '2026-09-01', '2026-09-16')

  expect(chamada).toEqual({ p_op_id: 10, p_inicio: '2026-09-01', p_entrega: '2026-09-16' })
})
