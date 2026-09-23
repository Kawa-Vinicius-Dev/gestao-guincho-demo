import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'
import type { Despesa } from '../types/modelos'

const URL_SUPABASE = 'https://projeto-teste.supabase.co'
const ID = '33333333-3333-3333-3333-333333333333'

async function carregar(modulos: string) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', URL_SUPABASE)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', modulos)
  const { esquecerCliente } = await import('./cliente')
  esquecerCliente()
  return import('./comprovantes')
}

function comSessao() {
  sessionStorage.setItem('fluxo-gestao:sessao:v1', JSON.stringify({
    access_token: 'jwt', refresh_token: 'r', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
    user: { id: ID, email: 'ana@teste.local', aud: 'authenticated' },
  }))
}

const DESPESA = { id: 12, descricao: 'Diesel' } as Despesa
const arquivo = (nome: string, tipo: string, bytes = 100) =>
  new File([new Uint8Array(bytes)], nome, { type: tipo })

beforeEach(() => { sessionStorage.clear(); comSessao() })
afterEach(() => vi.unstubAllEnvs())

test('o arquivo vai para o Storage, e so o caminho para a tabela', async () => {
  let caminhoEnviado = ''
  let corpoRpc: Record<string, unknown> = {}
  servidor.use(
    http.post(`${URL_SUPABASE}/storage/v1/object/comprovantes/*`, ({ params }) => {
      caminhoEnviado = String((params as Record<string, string>)['0'] ?? '')
      return HttpResponse.json({ Key: 'ok' })
    }),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/registrar_comprovante`, async ({ request }) => {
      corpoRpc = await request.json() as Record<string, unknown>
      return HttpResponse.json(null)
    }),
  )
  const { anexarComprovante } = await carregar('auth,despesas')

  await anexarComprovante(DESPESA, arquivo('nota fiscal.pdf', 'application/pdf'))

  // O caminho carrega o id da despesa: e dele que a policy do bucket descobre
  // quem pode ler o arquivo.
  expect(caminhoEnviado).toMatch(/^despesas\/12\//)
  expect(corpoRpc.p_despesa_id).toBe(12)
  expect(String(corpoRpc.p_caminho)).toMatch(/^despesas\/12\//)
  // O binario nunca entra no Postgres.
  expect(JSON.stringify(corpoRpc)).not.toContain('base64')
})

// O nome vem do computador de quem envia: barra criaria uma pasta a mais e
// mudaria o id que a policy le do caminho.
test('nome de arquivo hostil nao escapa da pasta da despesa', async () => {
  let caminho = ''
  servidor.use(
    http.post(`${URL_SUPABASE}/storage/v1/object/comprovantes/*`, ({ params }) => {
      caminho = String((params as Record<string, string>)['0'] ?? '')
      return HttpResponse.json({ Key: 'ok' })
    }),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/registrar_comprovante`, () => HttpResponse.json(null)),
  )
  const { anexarComprovante } = await carregar('auth,despesas')

  await anexarComprovante(DESPESA, arquivo('../../2/roubado.pdf', 'application/pdf'))

  expect(caminho).toMatch(/^despesas\/12\//)
  expect(caminho).not.toContain('..')
  expect(caminho).not.toMatch(/\.\./)
  expect(caminho.split('/').length).toBe(3)
})

test('tipo nao aceito para antes de subir', async () => {
  const { anexarComprovante } = await carregar('auth,despesas')

  await expect(anexarComprovante(DESPESA, arquivo('planilha.csv', 'text/csv')))
    .rejects.toThrow('Envie um comprovante em PDF, JPG, PNG ou WEBP.')
})

test('arquivo grande demais para antes de subir', async () => {
  const { anexarComprovante } = await carregar('auth,despesas')

  await expect(anexarComprovante(DESPESA, arquivo('gigante.pdf', 'application/pdf', 11 * 1024 * 1024)))
    .rejects.toThrow('excede o tamanho máximo de 10 MB')
})

// Se a RPC recusar (despesa de outra pessoa), o objeto ja subiu: precisa sair,
// senao sobra arquivo no bucket sem dono e sem registro.
test('recusa da RPC apaga o arquivo que ja tinha subido', async () => {
  let removeu = false
  servidor.use(
    http.post(`${URL_SUPABASE}/storage/v1/object/comprovantes/*`, () => HttpResponse.json({ Key: 'ok' })),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/registrar_comprovante`, () => HttpResponse.json({
      code: 'P0001', message: 'Voce so pode anexar comprovante as despesas que lancou.',
    }, { status: 400 })),
    http.delete(`${URL_SUPABASE}/storage/v1/object/comprovantes`, () => {
      removeu = true
      return HttpResponse.json([])
    }),
  )
  const { anexarComprovante } = await carregar('auth,despesas')

  await expect(anexarComprovante(DESPESA, arquivo('nota.pdf', 'application/pdf')))
    .rejects.toThrow('Voce so pode anexar comprovante as despesas que lancou.')
  expect(removeu).toBe(true)
})

// O bucket e privado: nao ha URL publica, so assinatura de curta duracao.
test('abrir gera link assinado e temporario', async () => {
  let validade: number | null = null
  servidor.use(http.post(`${URL_SUPABASE}/storage/v1/object/sign/comprovantes/*`,
    async ({ request }) => {
      validade = ((await request.json()) as { expiresIn: number }).expiresIn
      return HttpResponse.json({ signedURL: '/storage/v1/object/sign/comprovantes/x?token=abc' })
    }))
  const { abrirComprovante } = await carregar('auth,despesas')

  const url = await abrirComprovante({ ...DESPESA, comprovante: 'despesas/12/nota.pdf' } as Despesa)

  expect(url).toContain('token=')
  expect(validade).toBe(60)
})

test('pedir link de arquivo alheio falha no servidor, nao na tela', async () => {
  servidor.use(http.post(`${URL_SUPABASE}/storage/v1/object/sign/comprovantes/*`, () =>
    HttpResponse.json({ error: 'not_found', message: 'Object not found' }, { status: 404 })))
  const { abrirComprovante } = await carregar('auth,despesas')

  await expect(abrirComprovante({ ...DESPESA, comprovante: 'despesas/99/alheio.pdf' } as Despesa))
    .rejects.toThrow('Não foi possível abrir o comprovante.')
})

// A tabela primeiro: se o objeto sumisse antes e a RPC recusasse, a despesa
// ficaria apontando para um arquivo que nao existe mais.
test('remover limpa a tabela antes do arquivo', async () => {
  const passos: string[] = []
  servidor.use(
    http.post(`${URL_SUPABASE}/rest/v1/rpc/remover_comprovante`, () => {
      passos.push('tabela')
      return HttpResponse.json(null)
    }),
    http.delete(`${URL_SUPABASE}/storage/v1/object/comprovantes`, () => {
      passos.push('arquivo')
      return HttpResponse.json([])
    }),
  )
  const { removerComprovante } = await carregar('auth,despesas')

  await removerComprovante({ ...DESPESA, comprovante: 'despesas/12/nota.pdf' } as Despesa)

  expect(passos).toEqual(['tabela', 'arquivo'])
})

