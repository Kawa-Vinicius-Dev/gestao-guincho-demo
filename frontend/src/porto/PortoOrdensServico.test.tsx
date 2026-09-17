import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

const SUPA = 'https://projeto-teste.supabase.co'

async function abrir(rota = '/porto/ordens-servico') {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('../dados/cliente')
  esquecerCliente()
  const { default: Pagina } = await import('./PortoOrdensServicoPage')
  render(<MemoryRouter initialEntries={[rota]}><Pagina/></MemoryRouter>)
}

beforeEach(() => {
  sessionStorage.clear()
  sessionStorage.setItem('filtro:periodo', JSON.stringify({ inicio: '2026-06-23', fim: '2026-07-14' }))
})
afterEach(() => vi.unstubAllEnvs())

const OS = {
  id: 7, numero: '01/4312215-26', dataAtendimento: '2026-06-30', especialidade: 'GUINCHO', viatura: 'AUXILIAR',
  valorTotal: 181, motoristaId: 10, motorista: 'AUXILIAR', ordemPagamentoId: 13, numeroOp: '06416626', comissao: 36.2,
  situacao: 'CONCILIADA', competenciaInicio: '2026-06-16', competenciaFim: '2026-06-30', valorPrevisto: 181,
}

function servidorBase(aoListar: (corpo: Record<string, unknown>) => void = () => {}) {
  servidor.use(
    http.post(`${SUPA}/rest/v1/rpc/porto_listar_os`, async ({ request }) => {
      aoListar(await request.json() as Record<string, unknown>)
      return HttpResponse.json({ total: 1, valorTotal: 181, valorPrevisto: 181, semValor: 0, divergentes: 0,
        semViatura: 0, comissaoTotal: 36.2, itens: [OS] })
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
// A OP nunca traz a viatura: quem conhece a operacao filtra e aplica em lote, com confirmacao.
test('define a viatura das OS filtradas em lote, só depois de confirmar', async () => {
  let lote: Record<string, unknown> | null = null
  servidorBase()
  servidor.use(
    http.post(`${SUPA}/rest/v1/rpc/porto_listar_os`, () =>
      HttpResponse.json({ total: 12, semViatura: 12, valorTotal: 2400, valorPrevisto: 2400, semValor: 0, divergentes: 0,
        comissaoTotal: 480, itens: [{ ...OS, viatura: null }] })),
    http.post(`${SUPA}/rest/v1/rpc/porto_definir_viatura_em_lote`, async ({ request }) => {
      lote = await request.json() as Record<string, unknown>
      return HttpResponse.json(12)
    }),
  )
  const user = userEvent.setup()
  await abrir()

  await user.click(await screen.findByLabelText(/só sem viatura/i))
  await user.click(await screen.findByRole('button', { name: /definir viatura das os filtradas/i }))
  const janela = screen.getByRole('dialog')
  await user.selectOptions(within(janela).getByLabelText(/^viatura$/i), 'L25')
  await user.click(within(janela).getByRole('button', { name: /continuar/i }))

  expect(await screen.findByText(/definir a viatura L25\?/i)).toBeInTheDocument()
  expect(lote).toBeNull()
  await user.click(screen.getByRole('button', { name: /^definir viatura$/i }))

  await vi.waitFor(() => expect(lote).toMatchObject({ p_nova_sigla: 'L25', p_sem_viatura: true, p_so_sem_viatura: true }))
  expect(await screen.findByText(/viatura L25 definida em 12 ordens de serviço/i)).toBeInTheDocument()
})
test('abre filtrada pela OS do link, procurando fora do período', async () => {
  let corpo: Record<string, unknown> = {}
  servidorBase(c => { corpo = c })
  await abrir('/porto/ordens-servico?os=01%2F2937402-26')

  expect(await screen.findByDisplayValue('01/2937402-26')).toBeInTheDocument()
  // Busca por numero vale para todo o historico: a OS do aviso pode ser de outra quinzena.
  expect(corpo.p_numero_os).toBe('01/2937402-26')
  expect(corpo.p_inicio).toBe('2026-03-30')
  expect(screen.getByText(/procura em todo o histórico/i)).toBeInTheDocument()
})

test('filtra por competência em vez da data do serviço', async () => {
  const pedidos: Record<string, unknown>[] = []
  servidorBase(corpo => pedidos.push(corpo))
  const user = userEvent.setup()
  await abrir()

  await screen.findByText('01/4312215-26')
  expect(pedidos[0]).toMatchObject({ p_por_competencia: false })
  await user.click(screen.getByLabelText(/filtrar por competência/i))

  await vi.waitFor(() => expect(pedidos.at(-1)).toMatchObject({ p_por_competencia: true }))
})

test('informa o valor da Porto numa OS sem OP, depois de confirmar', async () => {
  let informado: Record<string, unknown> | null = null
  servidorBase()
  servidor.use(
    http.post(`${SUPA}/rest/v1/rpc/porto_listar_os`, () => HttpResponse.json({
      total: 1, semViatura: 0, valorTotal: 0, valorPrevisto: 0, semValor: 1, divergentes: 0, comissaoTotal: 0,
      itens: [{ ...OS, ordemPagamentoId: null, numeroOp: null, comissao: null, valorTotal: 0, valorPrevisto: null,
        situacao: 'AGUARDANDO_ANALISE' }],
    })),
    http.post(`${SUPA}/rest/v1/rpc/porto_informar_valor_manual`, async ({ request }) => {
      informado = await request.json() as Record<string, unknown>
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const user = userEvent.setup()
  await abrir()

  await user.click(await screen.findByRole('button', { name: /informar valor da os 01\/4312215-26/i }))
  const janela = screen.getByRole('dialog')
  await user.type(within(janela).getByLabelText(/valor do serviço/i), '18100')
  await user.click(within(janela).getByRole('button', { name: /continuar/i }))

  // Valor informado nao gera comissao: a confirmacao diz isso antes de gravar.
  expect(await screen.findByText(/informar r\$\s*181,00 na os/i)).toBeInTheDocument()
  expect(screen.getByText(/não gera comissão/i)).toBeInTheDocument()
  expect(informado).toBeNull()
  await user.click(screen.getByRole('button', { name: /^informar valor$/i }))

  await vi.waitFor(() => expect(informado).toEqual({ p_os_id: 7, p_valor: 181 }))
})

test('OS paga pela OP mostra o valor informado e a diferença', async () => {
  servidorBase()
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/porto_listar_os`, () => HttpResponse.json({
    total: 1, semViatura: 0, valorTotal: 181, valorPrevisto: 181, semValor: 0, divergentes: 1, comissaoTotal: 36.2,
    itens: [{ ...OS, situacao: 'DIVERGENTE', valorManual: 150, divergencia: 31 }],
  })))
  await abrir()

  expect(await screen.findByText(/valor divergente/i)).toBeInTheDocument()
  expect(screen.getByText(/informado r\$\s*150,00 · \+r\$\s*31,00/i)).toBeInTheDocument()
  // Quem ja esta numa OP nao tem valor para informar a mao.
  expect(screen.queryByRole('button', { name: /informar valor da os/i })).not.toBeInTheDocument()
})

test('card do painel abre a lista já na situação e na competência', async () => {
  const pedidos: Record<string, unknown>[] = []
  servidorBase(corpo => pedidos.push(corpo))
  await abrir('/porto/ordens-servico?situacao=AGUARDANDO_PROXIMA_OP&competencia=1')

  await screen.findByText('01/4312215-26')
  expect(pedidos[0]).toMatchObject({ p_situacao: 'AGUARDANDO_PROXIMA_OP', p_por_competencia: true })
})
