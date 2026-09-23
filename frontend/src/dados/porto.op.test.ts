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
  let renomeio: Record<string, unknown> = {}
  servidor.use(
    http.post(`${SUPA}/rest/v1/rpc/porto_renomear_op`, async ({ request }) => {
      renomeio = await request.json() as Record<string, unknown>
      return HttpResponse.json(null)
    }),
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
  // O numero vai pela funcao que tambem acerta as comissoes no Extrato.
  expect(corpo).not.toHaveProperty('numero')
  expect(renomeio).toEqual({ p_id: 10, p_numero: '06438807' })
})

test('trocar o número da OP vai pela função do banco, sem espaços', async () => {
  let chamada: Record<string, unknown> = {}
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/porto_renomear_op`, async ({ request }) => {
    chamada = await request.json() as Record<string, unknown>
    return HttpResponse.json(null)
  }))
  const { renomearOp } = await carregar()

  await renomearOp(10, ' 06438899 ')

  expect(chamada).toEqual({ p_id: 10, p_numero: '06438899' })
})

test('número repetido chega em português', async () => {
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/porto_renomear_op`, () => HttpResponse.json(
    { code: 'P0001', message: 'Já existe uma OP com o número 06438808.' }, { status: 400 })))
  const { renomearOp } = await carregar()

  await expect(renomearOp(10, '06438808')).rejects.toThrow('Já existe uma OP com o número 06438808.')
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
