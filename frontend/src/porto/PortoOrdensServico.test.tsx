import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

const SUPA = 'https://projeto-teste.supabase.co'

async function abrir() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('../dados/cliente')
  esquecerCliente()
  const { default: Pagina } = await import('./PortoOrdensServicoPage')
  render(<MemoryRouter><Pagina/></MemoryRouter>)
}

beforeEach(() => {
  sessionStorage.clear()
  sessionStorage.setItem('filtro:periodo', JSON.stringify({ inicio: '2026-06-23', fim: '2026-07-14' }))
})
afterEach(() => vi.unstubAllEnvs())

const OS = {
  id: 7, numero: '01/4312215-26', dataAtendimento: '2026-06-30', especialidade: 'GUINCHO', viatura: 'AUXILIAR',
  valorTotal: 181, motoristaId: 10, motorista: 'AUXILIAR', ordemPagamentoId: 13, numeroOp: '06416626', comissao: 36.2,
}

function servidorBase(aoListar: (corpo: Record<string, unknown>) => void = () => {}) {
  servidor.use(
    http.post(`${SUPA}/rest/v1/rpc/porto_listar_os`, async ({ request }) => {
      aoListar(await request.json() as Record<string, unknown>)
      return HttpResponse.json({ total: 1, valorTotal: 181, comissaoTotal: 36.2, itens: [OS] })
    }),
    http.get(`${SUPA}/rest/v1/motoristas`, () => HttpResponse.json([
      { id: 9, nome: 'ANDERSON JORGE RIBEIRO', ativo: true }, { id: 10, nome: 'AUXILIAR', ativo: true },
    ])),
    http.get(`${SUPA}/rest/v1/veiculos`, () => HttpResponse.json([
      { id: 3, identificacao: 'L25', sigla_porto: 'L25', placa: null, custo_por_km: 0, ativo: true },
    ])),
    http.get(`${SUPA}/rest/v1/porto_ops_conciliadas`, () => HttpResponse.json([])),
  )
}

// A tela antiga mostrava filtros que a consulta ignorava: aqui o filtro vai para o banco.
test('filtros da tela vão para a consulta no banco, com o período global', async () => {
  const pedidos: Record<string, unknown>[] = []
  servidorBase(corpo => pedidos.push(corpo))
  const user = userEvent.setup()
  await abrir()

  expect(await screen.findByText('01/4312215-26')).toBeInTheDocument()
  expect(pedidos[0]).toMatchObject({ p_inicio: '2026-06-23', p_fim: '2026-07-14', p_situacao: null })

  await user.selectOptions(screen.getByLabelText(/^situação$/i), 'PAGA')

  await vi.waitFor(() => expect(pedidos.at(-1)).toMatchObject({ p_situacao: 'PAGA', p_deslocamento: 0 }))
  expect(screen.getByText('R$ 36,20', { selector: 'strong, span, div, p' })).toBeInTheDocument()
})

test('corrigir a OS do Auxiliar troca socorrista e viatura', async () => {
  let correcao: Record<string, unknown> = {}
  servidorBase()
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/porto_corrigir_os`, async ({ request }) => {
    correcao = await request.json() as Record<string, unknown>
    return new HttpResponse(null, { status: 204 })
  }))
  const user = userEvent.setup()
  await abrir()

  await user.click(await screen.findByRole('button', { name: /corrigir os 01\/4312215-26/i }))
  const janela = screen.getByRole('dialog')
  await user.selectOptions(within(janela).getByLabelText(/socorrista/i), '9')
  await user.selectOptions(within(janela).getByLabelText(/viatura/i), 'L25')
  await user.click(within(janela).getByRole('button', { name: /salvar correção/i }))

  await vi.waitFor(() => expect(correcao).toEqual({ p_os_id: 7, p_motorista_id: 9, p_sigla: 'L25' }))
  expect(await screen.findByText(/comissão foi recalculada/i)).toBeInTheDocument()
})

test('socorrista desativado não é oferecido para corrigir a OS', async () => {
  servidorBase()
  servidor.use(http.get(`${SUPA}/rest/v1/motoristas`, () => HttpResponse.json([
    { id: 9, nome: 'ANDERSON JORGE RIBEIRO', ativo: true }, { id: 5, nome: 'QUEM SAIU', ativo: false },
  ])))
  const user = userEvent.setup()
  await abrir()

  await user.click(await screen.findByRole('button', { name: /corrigir os 01\/4312215-26/i }))
  const campo = within(screen.getByRole('dialog')).getByLabelText(/socorrista/i)
  expect(within(campo).getByRole('option', { name: /anderson/i })).toBeInTheDocument()
  expect(within(campo).queryByRole('option', { name: /quem saiu/i })).not.toBeInTheDocument()
})