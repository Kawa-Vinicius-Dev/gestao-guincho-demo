import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { URL_SUPABASE, servidor } from '../test/servidor'

/**
 * A tela de OPs mandava `numero` e a lista so lia `numeroOp`: buscar pelo numero
 * nao filtrava nada. O filtro de conciliacao tambem era ignorado (24/09/2026).
 */
async function consultaDa(params: Record<string, string>) {
  let url = ''
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/porto_ops_conciliadas`, ({ request }) => {
    url = decodeURIComponent(request.url); return HttpResponse.json([])
  }))
  const { listarOrdensPagamentoPorto } = await import('./porto')
  await listarOrdensPagamentoPorto(new URLSearchParams(params))
  return url
}

test('o número digitado na tela filtra a lista', async () => {
  expect(await consultaDa({ numero: '06438807' })).toContain('numero=ilike.%06438807%')
})

test('conciliação e divergência filtram pela mesma regra do resumo', async () => {
  expect(await consultaDa({ statusConciliacao: 'CONCILIADA' })).toContain('status_conciliacao=eq.CONCILIADA')
  expect(await consultaDa({ comDivergencia: 'true' }))
    .toContain('status_conciliacao=in.(VALOR_ABAIXO,VALOR_ACIMA,RECEBIDA_COM_DIVERGENCIA)')
})
