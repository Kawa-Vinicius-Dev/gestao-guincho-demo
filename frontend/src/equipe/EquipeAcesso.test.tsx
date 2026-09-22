import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

/**
 * Gestao do acesso do socorrista, no modo Supabase (o de producao): a conta mora
 * em `perfis`, e o cadastro do socorrista so guarda o id dela.
 */
const SUPA = 'https://projeto-teste.supabase.co'

async function abrir() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('../dados/cliente')
  esquecerCliente()
  const { default: Pagina } = await import('./EquipePage')
  render(<MemoryRouter><Pagina/></MemoryRouter>)
}

const PERFIL = '11111111-2222-3333-4444-555555555555'

const socorrista = {
  id: 4, nome: 'ANDERSON JORGE RIBEIRO', telefone: '85900000000', documento: null,
  qra: 'QRA-1', codigos_porto: [], ativo: true, veiculo_id: null, perfil_id: PERFIL, veiculos: null,
}

function servidorBase(conta: Record<string, unknown> = {}) {
  servidor.use(
    http.get(`${SUPA}/rest/v1/motoristas`, () => HttpResponse.json([socorrista])),
    http.get(`${SUPA}/rest/v1/veiculos`, () => HttpResponse.json([])),
    http.get(`${SUPA}/rest/v1/perfis`, () => HttpResponse.json([
      { id: PERFIL, nome: 'ANDERSON JORGE RIBEIRO', email: 'anderson@jms.local',
        perfil: 'SOCORRISTA', ativo: true, senha_provisoria: false, ...conta },
    ])),
    http.post(`${SUPA}/rest/v1/rpc/porto_comissao_prevista`, () => HttpResponse.json([
      { motorista_id: 4, socorrista: 'ANDERSON JORGE RIBEIRO', servicos: 12, sem_valor: 5,
        valor_previsto: 2400, comissao_prevista: 480 },
    ])),
  )
}

beforeEach(() => { sessionStorage.clear() })
afterEach(() => vi.unstubAllEnvs())

test('mostra o e-mail, o estado do acesso e a produção da competência', async () => {
  servidorBase()
  await abrir()

  expect(await screen.findByText('anderson@jms.local')).toBeInTheDocument()
  expect(screen.getByText('Ativo', { selector: 'strong' })).toBeInTheDocument()
  // Servico sem valor conta na producao: ele rodou do mesmo jeito.
  expect(screen.getByText(/12 serviços aguardando OP · R\$\s*2\.400,00 previstos · 5 sem valor/)).toBeInTheDocument()
})

test('bloquear o acesso pede confirmação e não apaga o cadastro', async () => {
  let enviado: Record<string, unknown> | null = null
  servidorBase()
  servidor.use(http.patch(`${SUPA}/rest/v1/perfis`, async ({ request }) => {
    enviado = await request.json() as Record<string, unknown>
    return new HttpResponse(null, { status: 204 })
  }))
  const user = userEvent.setup({ delay: null })
  await abrir()

  await user.click(await screen.findByRole('button', { name: /bloquear acesso/i }))
  const janela = await screen.findByRole('dialog')
  expect(within(janela).getByText(/comissões e o histórico continuam/i)).toBeInTheDocument()
  expect(enviado).toBeNull()
  await user.click(within(janela).getByRole('button', { name: /^bloquear acesso$/i }))

  await vi.waitFor(() => expect(enviado).toEqual({ ativo: false }))
})

test('acesso bloqueado aparece como tal e oferece liberar', async () => {
  servidorBase({ ativo: false })
  await abrir()

  expect(await screen.findByText('Bloqueado')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /liberar acesso/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /bloquear acesso/i })).not.toBeInTheDocument()
})

test('senha provisória fica visível na lista até o socorrista trocar', async () => {
  servidorBase({ senha_provisoria: true })
  await abrir()

  expect(await screen.findByText('Senha provisória')).toBeInTheDocument()
})

// A comissao e por pessoa, com teto de 20%, e vai por RPC propria porque refaz
// o dinheiro das OPs que ainda nao fecharam.
test('o dono define a comissão do socorrista em porcentagem', async () => {
  let enviado: Record<string, unknown> | null = null
  servidorBase()
  servidor.use(
    http.patch(`${SUPA}/rest/v1/motoristas`, () => HttpResponse.json({
      id: 4, nome: 'ANDERSON JORGE RIBEIRO', telefone: null, documento: null, qra: 'QRA-1',
      codigos_porto: [], ativo: true, veiculo_id: null, perfil_id: null,
      percentual_comissao: null, veiculos: null,
    })),
    http.post(`${SUPA}/rest/v1/rpc/definir_percentual_do_socorrista`, async ({ request }) => {
      enviado = await request.json() as Record<string, unknown>
      return HttpResponse.json(null)
    }),
  )
  const user = userEvent.setup({ delay: null })
  await abrir()

  await user.click(await screen.findByRole('button', { name: /^editar$/i }))
  const janela = await screen.findByRole('dialog')
  // 15% na tela vira 0,15 no banco.
  await user.type(within(janela).getByLabelText(/^comissão/i), '15')
  await user.click(within(janela).getByRole('button', { name: /salvar alterações/i }))

  await waitFor(() => expect(enviado).toEqual({ p_motorista_id: 4, p_percentual: 0.15 }))
})
