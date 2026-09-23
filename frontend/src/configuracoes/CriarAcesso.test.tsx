import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'
import { confirmarNaJanela } from '../test/confirmar'

/**
 * Criar uma conta de acesso, no modo Supabase (o de producao).
 *
 * Criar conta exige a service_role, entao nao sai do navegador: passa pela Edge
 * Function `admin-usuarios`, que confere o perfil de quem chamou antes de agir.
 */
const SUPA = 'https://projeto-teste.supabase.co'

async function abrir() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('../dados/cliente')
  esquecerCliente()
  const { default: Pagina } = await import('./ConfiguracoesPage')
  // Contas ficam na aba Acessos.
  window.history.replaceState({}, '', '/configuracoes?aba=acessos')
  render(<MemoryRouter><Pagina/></MemoryRouter>)
}

function servidorBase() {
  servidor.use(
    http.get(`${SUPA}/rest/v1/categorias`, () => HttpResponse.json([])),
    http.get(`${SUPA}/rest/v1/contratantes`, () => HttpResponse.json([])),
    http.get(`${SUPA}/rest/v1/perfis`, () => HttpResponse.json([])),
  )
}

beforeEach(() => { sessionStorage.clear() })
afterEach(() => vi.unstubAllEnvs())

test('o dono cria um administrador e vê a senha provisória uma única vez', async () => {
  let enviado: Record<string, unknown> | null = null
  servidorBase()
  servidor.use(http.post(`${SUPA}/functions/v1/admin-usuarios`, async ({ request }) => {
    enviado = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      usuarioId: 'a1b2', nome: 'Jeferson', email: 'jeferson@autosocorro.com.br',
      senhaProvisoria: 'kjhs-2mp4-7xqt',
    }, { status: 201 })
  }))
  const user = userEvent.setup({ delay: null })
  await abrir()

  await user.type(await screen.findByLabelText(/^nome$/i), 'Jeferson')
  await user.type(screen.getByLabelText(/e-mail de acesso/i), 'jeferson@autosocorro.com.br')
  await user.selectOptions(screen.getByLabelText(/^perfil$/i), 'ADMINISTRADOR')
  await user.click(screen.getByRole('button', { name: /criar acesso/i }))

  // O dono nao escolhe senha: ele so recebe a provisoria para repassar.
  expect(enviado).toEqual({
    acao: 'criar', nome: 'Jeferson', email: 'jeferson@autosocorro.com.br', perfil: 'ADMINISTRADOR',
  })
  expect(await screen.findByText('kjhs-2mp4-7xqt')).toBeInTheDocument()
  expect(screen.getByText('jeferson@autosocorro.com.br')).toBeInTheDocument()
  expect(screen.getByText(/uma única vez/i)).toBeInTheDocument()
})

test('e-mail repetido não cria conta nenhuma: o erro da Edge Function aparece na tela', async () => {
  servidorBase()
  servidor.use(http.post(`${SUPA}/functions/v1/admin-usuarios`, () => HttpResponse.json(
    { detalhe: 'A user with this email address has already been registered' }, { status: 400 })))
  const user = userEvent.setup({ delay: null })
  await abrir()

  await user.type(await screen.findByLabelText(/^nome$/i), 'Jeferson')
  await user.type(screen.getByLabelText(/e-mail de acesso/i), 'jeferson@autosocorro.com.br')
  await user.click(screen.getByRole('button', { name: /criar acesso/i }))

  expect(await screen.findByText(/already been registered/i)).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /senha provisória/i })).not.toBeInTheDocument()
})

test('encerrar o acesso pede confirmação e não apaga o histórico da pessoa', async () => {
  let enviado: Record<string, unknown> | null = null
  servidorBase()
  servidor.use(
    http.get(`${SUPA}/rest/v1/perfis`, () => HttpResponse.json([
      { id: 'a1b2', nome: 'Jeferson', email: 'jeferson@autosocorro.com.br',
        perfil: 'FUNCIONARIO', ativo: true, senha_provisoria: false },
    ])),
    http.post(`${SUPA}/functions/v1/admin-usuarios`, async ({ request }) => {
      enviado = await request.json() as Record<string, unknown>
      return HttpResponse.json({ usuarioId: 'a1b2', encerrado: true })
    }),
  )
  const user = userEvent.setup({ delay: null })
  await abrir()

  await user.click(await screen.findByRole('button', { name: /encerrar acesso/i }))
  await confirmarNaJanela()

  expect(enviado).toEqual({ acao: 'encerrar', perfilId: 'a1b2' })
  expect(await screen.findByText(/o acesso de jeferson foi encerrado/i)).toBeInTheDocument()
})

// Conta criada errada: o caso de uso real do "Excluir". Quem nunca lancou nada
// nao tem historico para proteger, entao o banco deixa apagar.
test('excluir apaga a conta criada por engano', async () => {
  let enviado: Record<string, unknown> | null = null
  servidorBase()
  servidor.use(
    http.get(`${SUPA}/rest/v1/perfis`, () => HttpResponse.json([
      { id: 'a1b2', nome: 'Criado errado', email: 'errado@jms.local',
        perfil: 'FUNCIONARIO', ativo: true, senha_provisoria: false },
    ])),
    http.post(`${SUPA}/functions/v1/admin-usuarios`, async ({ request }) => {
      enviado = await request.json() as Record<string, unknown>
      return HttpResponse.json({ usuarioId: 'a1b2', excluido: true })
    }),
  )
  const user = userEvent.setup({ delay: null })
  await abrir()

  await user.click(await screen.findByRole('button', { name: /^excluir$/i }))
  await confirmarNaJanela()

  expect(enviado).toEqual({ acao: 'excluir', perfilId: 'a1b2' })
  expect(await screen.findByText(/foi excluído/i)).toBeInTheDocument()
})

// Quem ja trabalhou nao se apaga: o banco recusa e a tela precisa dizer o que
// fazer em vez de mostrar o erro cru de chave estrangeira.
test('excluir quem já lançou algo explica e aponta o encerramento', async () => {
  servidorBase()
  servidor.use(
    http.get(`${SUPA}/rest/v1/perfis`, () => HttpResponse.json([
      { id: 'a1b2', nome: 'Anderson', email: 'anderson@jms.local',
        perfil: 'FUNCIONARIO', ativo: true, senha_provisoria: false },
    ])),
    http.post(`${SUPA}/functions/v1/admin-usuarios`, () => HttpResponse.json(
      { detalhe: 'Esta conta já lançou coisas no sistema e não pode ser apagada sem levar junto o registro de quem fez o quê. Use "Encerrar acesso": a pessoa deixa de entrar e o histórico fica.' },
      { status: 400 })),
  )
  const user = userEvent.setup({ delay: null })
  await abrir()

  await user.click(await screen.findByRole('button', { name: /^excluir$/i }))
  await confirmarNaJanela()

  expect(await screen.findByText(/use "encerrar acesso"/i)).toBeInTheDocument()
})

// Encerrar sem volta era pegadinha: um clique errado tirava alguem do sistema
// para sempre, e nem redefinir senha trazia de volta.
test('conta encerrada aparece como tal e pode ser reativada', async () => {
  let enviado: Record<string, unknown> | null = null
  servidorBase()
  servidor.use(
    http.get(`${SUPA}/rest/v1/perfis`, () => HttpResponse.json([
      { id: 'a1b2', nome: 'Anderson', email: 'anderson@jms.local',
        perfil: 'FUNCIONARIO', ativo: false, senha_provisoria: false },
    ])),
    http.post(`${SUPA}/functions/v1/admin-usuarios`, async ({ request }) => {
      enviado = await request.json() as Record<string, unknown>
      return HttpResponse.json({ usuarioId: 'a1b2', reativado: true })
    }),
  )
  const user = userEvent.setup({ delay: null })
  await abrir()

  expect(await screen.findByText(/encerrado/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /encerrar acesso/i })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /reativar acesso/i }))
  await confirmarNaJanela()

  expect(enviado).toEqual({ acao: 'reativar', perfilId: 'a1b2' })
  expect(await screen.findByText(/foi reativado/i)).toBeInTheDocument()
})
