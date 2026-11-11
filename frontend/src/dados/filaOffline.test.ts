import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { servidor, URL_SUPABASE } from '../test/servidor'
import {
  combinarComFila, descartarItem, enfileirar, finalizarOuEnfileirar, iniciarOuEnfileirar, listarFila,
  processarFila, reiniciarFilaParaTeste, tentarDeNovo, emAndamentoNaTela, type ItemDaFila,
} from './filaOffline'

const ANA = 'aaaaaaaa-0000-0000-0000-000000000002'
const OUTRO = 'aaaaaaaa-0000-0000-0000-000000000003'
const LOCAL = { semLocal: 'NEGADA' as const }
const foto = () => new File([new Uint8Array([1, 2, 3])], 'painel.jpg', { type: 'image/jpeg' })

type Chamada = { rota: string; corpo: Record<string, unknown> }
let chamadas: Chamada[]

/** Responde o que o banco responderia quando tudo da certo, anotando a ordem das chamadas. */
function bancoOk(opcoes: { aoIniciar?: () => Response | undefined } = {}) {
  let proximoId = 100
  servidor.use(
    http.post(`${URL_SUPABASE}/rest/v1/rpc/:nome`, async ({ params, request }) => {
      const corpo = (await request.json()) as Record<string, unknown>
      chamadas.push({ rota: String(params.nome), corpo })
      if (params.nome === 'iniciar_servico_do_turno') return opcoes.aoIniciar?.() ?? HttpResponse.json(proximoId++)
      if (params.nome === 'finalizar_servico_do_turno') return HttpResponse.json(15)
      return HttpResponse.json(null)
    }),
    http.post(`${URL_SUPABASE}/storage/v1/object/comprovantes/*`, ({ request }) => {
      chamadas.push({ rota: 'foto', corpo: { url: new URL(request.url).pathname } })
      return HttpResponse.json({ Key: 'x' })
    }),
  )
}

const rotas = () => chamadas.map(c => c.rota)

beforeEach(() => {
  chamadas = []
  indexedDB = new IDBFactory()
  reiniciarFilaParaTeste()
})
afterEach(() => vi.restoreAllMocks())

const base = { usuarioId: ANA, turnoId: 7, local: LOCAL }

test('guarda sem sinal e envia na ordem quando volta, com a hora do toque', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  const toque1 = '2026-11-11T14:05:00.000Z'
  const toque2 = '2026-11-11T14:40:00.000Z'

  const a = await iniciarOuEnfileirar({ ...base, numeroOs: '01/4312215-26', kmInicial: 10000, foto: foto(), ocorridoEm: toque1 })
  expect(a.enfileirado).toBe(true)
  const [inicio] = await listarFila(ANA)
  const b = await finalizarOuEnfileirar({
    ...base, servicoId: null, refInicio: inicio.seq, kmFinal: 10015, foto: foto(), ocorridoEm: toque2,
  })
  expect(b.enfileirado).toBe(true)
  expect(await listarFila(ANA)).toHaveLength(2)
  expect(chamadas).toHaveLength(0) // nada saiu: sem sinal

  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  bancoOk()
  const enviados = await processarFila(ANA)

  expect(enviados).toBe(2) // foto do inicio e finalizar (o INICIAR vira FOTO_INICIO no caminho)
  expect(await listarFila(ANA)).toHaveLength(0)
  expect(rotas()).toEqual([
    'iniciar_servico_do_turno', 'foto', 'registrar_foto_inicio_servico', 'foto', 'finalizar_servico_do_turno',
  ])
  expect(chamadas[0].corpo.p_ocorrido_em).toBe(toque1)
  expect(chamadas[4].corpo).toMatchObject({ p_id: 100, p_km_final: 10015, p_ocorrido_em: toque2 })
})

test('sem sinal na hora de enviar: a fila continua inteira e nada e bloqueado', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  await iniciarOuEnfileirar({ ...base, numeroOs: '01/4312215-26', kmInicial: 10000, foto: foto(), ocorridoEm: new Date().toISOString() })
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/iniciar_servico_do_turno`, () => HttpResponse.error()))

  expect(await processarFila(ANA)).toBe(0)

  const [item] = await listarFila(ANA)
  expect(item.tipo).toBe('INICIAR')
  expect(item.bloqueio).toBeUndefined()
  expect(item.tentativas).toBe(0)
})

test('o banco recusa: o item fica bloqueado com a frase dele e a fila para ali', async () => {
  await enfileirar({ ...base, tipo: 'INICIAR', numeroOs: '01/4312215-26', kmInicial: 10000, foto: foto(), ocorridoEm: new Date().toISOString() })
  await enfileirar({ ...base, tipo: 'INICIAR', numeroOs: '02/4312215-26', kmInicial: 10020, foto: foto(), ocorridoEm: new Date().toISOString() })
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/iniciar_servico_do_turno`, () =>
    HttpResponse.json({ code: 'P0001', message: 'A quilometragem (10000) é menor que a do início do turno (10050). Confira o painel.' }, { status: 400 })))

  await processarFila(ANA)

  const [primeiro, segundo] = await listarFila(ANA)
  expect(primeiro.bloqueio).toContain('menor que a do início do turno')
  expect(segundo.bloqueio).toBeUndefined() // o segundo nem foi tentado: a ordem importa
})

test('descartar tira o item e o finalizar que dependia dele; tentar de novo libera', async () => {
  const seq = await enfileirar({ ...base, tipo: 'INICIAR', numeroOs: '01/4312215-26', kmInicial: 10000, foto: foto(), ocorridoEm: new Date().toISOString() })
  await enfileirar({ ...base, tipo: 'FINALIZAR', ref: seq, kmFinal: 10015, foto: foto(), ocorridoEm: new Date().toISOString() })
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/iniciar_servico_do_turno`, () =>
    HttpResponse.json({ code: 'P0001', message: 'Informe o número da OS.' }, { status: 400 })))
  await processarFila(ANA)
  expect((await listarFila(ANA))[0].bloqueio).toBeTruthy()

  await tentarDeNovo(ANA, seq)
  expect((await listarFila(ANA))[0].bloqueio).toBeUndefined()

  await descartarItem(ANA, seq)
  expect(await listarFila(ANA)).toHaveLength(0)
})

test('resposta perdida: a OS ja esta no turno com o mesmo km, entao segue sem duplicar', async () => {
  await enfileirar({ ...base, tipo: 'INICIAR', numeroOs: '01/4312215-26', kmInicial: 10000, foto: foto(), ocorridoEm: new Date().toISOString() })
  bancoOk({
    aoIniciar: () => HttpResponse.json({ code: '23505', message: 'A OS 01/4312215-26 já está registrada neste turno.' }, { status: 409 }),
  })
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/servicos_do_turno`, () => HttpResponse.json([{
    id: 55, turno_id: 7, numero_os: '01/4312215-26', km: null, km_inicial: 10000, km_final: null,
    iniciado_em: '2026-11-11T14:05:00Z', finalizado_em: null, foto_inicio: null,
  }])))

  await processarFila(ANA)

  expect(await listarFila(ANA)).toHaveLength(0)
  expect(chamadas.find(c => c.rota === 'registrar_foto_inicio_servico')?.corpo.p_id).toBe(55)
})

test('OS repetida de verdade (km diferente) nao e adotada: bloqueia', async () => {
  await enfileirar({ ...base, tipo: 'INICIAR', numeroOs: '01/4312215-26', kmInicial: 10000, foto: foto(), ocorridoEm: new Date().toISOString() })
  bancoOk({ aoIniciar: () => HttpResponse.json({ code: '23505', message: 'repetida' }, { status: 409 }) })
  servidor.use(http.get(`${URL_SUPABASE}/rest/v1/servicos_do_turno`, () => HttpResponse.json([{
    id: 55, turno_id: 7, numero_os: '01/4312215-26', km: null, km_inicial: 9000, km_final: null,
    iniciado_em: null, finalizado_em: null, foto_inicio: null,
  }])))

  await processarFila(ANA)

  expect((await listarFila(ANA))[0].bloqueio).toBeTruthy()
})

test('finalizar com a resposta perdida: servico ja finalizado com o mesmo km conta como enviado', async () => {
  await enfileirar({ ...base, tipo: 'FINALIZAR', servicoId: 55, kmFinal: 10015, foto: foto(), ocorridoEm: new Date().toISOString() })
  servidor.use(
    http.post(`${URL_SUPABASE}/storage/v1/object/comprovantes/*`, () => HttpResponse.json({ Key: 'x' })),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/finalizar_servico_do_turno`, () =>
      HttpResponse.json({ code: 'P0001', message: 'Este serviço já foi finalizado.' }, { status: 400 })),
    http.get(`${URL_SUPABASE}/rest/v1/servicos_do_turno`, () => HttpResponse.json([{
      id: 55, turno_id: 7, numero_os: '01/4312215-26', km: 15, km_inicial: 10000, km_final: 10015,
      iniciado_em: null, finalizado_em: '2026-11-11T14:40:00Z', foto_inicio: 'x',
    }])),
  )

  await processarFila(ANA)

  expect(await listarFila(ANA)).toHaveLength(0)
})

test('a fila e de cada pessoa: o envio de uma nao toca no item da outra', async () => {
  await enfileirar({ ...base, usuarioId: OUTRO, tipo: 'INICIAR', numeroOs: '09/4312215-26', kmInicial: 5, foto: foto(), ocorridoEm: new Date().toISOString() })
  bancoOk()

  expect(await processarFila(ANA)).toBe(0)

  expect(chamadas).toHaveLength(0)
  expect(await listarFila(OUTRO)).toHaveLength(1)
  expect(await listarFila(ANA)).toHaveLength(0)
})

test('com algo na fila, o proximo servico entra na fila tambem (a ordem importa)', async () => {
  await enfileirar({ ...base, tipo: 'FOTO_INICIO', servicoId: 55, foto: foto(), ocorridoEm: new Date().toISOString() })
  bancoOk()

  const r = await iniciarOuEnfileirar({ ...base, numeroOs: '02/4312215-26', kmInicial: 10100, foto: foto(), ocorridoEm: new Date().toISOString() })

  expect(r.enfileirado).toBe(true)
  expect(chamadas).toHaveLength(0)
  expect(await listarFila(ANA)).toHaveLength(2)
})

test('com sinal e fila vazia, envia direto e nao guarda nada', async () => {
  bancoOk()

  const r = await iniciarOuEnfileirar({ ...base, numeroOs: '01/4312215-26', kmInicial: 10000, foto: foto(), ocorridoEm: new Date().toISOString() })

  expect(r.enfileirado).toBe(false)
  expect(await listarFila(ANA)).toHaveLength(0)
  expect(rotas()).toEqual(['iniciar_servico_do_turno', 'foto', 'registrar_foto_inicio_servico'])
  // Sem fila, a chamada e a de sempre: nao manda a hora (nao depende da migration nova).
  expect(chamadas[0].corpo).not.toHaveProperty('p_ocorrido_em')
})

test('o inicio foi, a foto nao (sem sinal): guarda so a foto, sem criar o servico de novo', async () => {
  bancoOk()
  servidor.use(http.post(`${URL_SUPABASE}/storage/v1/object/comprovantes/*`, () => HttpResponse.error()))

  const r = await iniciarOuEnfileirar({ ...base, numeroOs: '01/4312215-26', kmInicial: 10000, foto: foto(), ocorridoEm: new Date().toISOString() })

  expect(r.enfileirado).toBe(true)
  const itens = await listarFila(ANA)
  expect(itens.map(i => i.tipo)).toEqual(['FOTO_INICIO'])
  expect(itens[0].servicoId).toBe(100)
})

test('combinarComFila mostra o servico na fila como em andamento e o finalizado na fila com o km', () => {
  const item = (o: Partial<ItemDaFila>): ItemDaFila => ({
    usuarioId: ANA, turnoId: 7, tipo: 'INICIAR', foto: { bytes: new ArrayBuffer(0), tipo: 'image/jpeg', nome: 'a.jpg' },
    local: LOCAL, ocorridoEm: '2026-11-11T14:05:00Z', tentativas: 0, ...o,
  })
  const doBanco = [{
    id: 55, turnoId: 7, numeroOs: '01/1-26', km: 15, kmInicial: 10000, kmFinal: 10015,
    iniciadoEm: '2026-11-11T13:00:00Z', finalizadoEm: '2026-11-11T13:30:00Z', fotoInicio: 'x',
  }]

  const nova = combinarComFila(doBanco, [item({ seq: 1, numeroOs: '02/1-26', kmInicial: 10020 })])
  expect(nova).toHaveLength(2)
  expect(nova[1]).toMatchObject({ numeroOs: '02/1-26', pendente: true, kmFinal: null })
  expect(emAndamentoNaTela(nova[1])).toBe(true)
  expect(emAndamentoNaTela(nova[0])).toBe(false)

  const fechada = combinarComFila(doBanco, [
    item({ seq: 1, numeroOs: '02/1-26', kmInicial: 10020 }),
    item({ seq: 2, tipo: 'FINALIZAR', ref: 1, kmFinal: 10050 }),
  ])
  expect(fechada[1]).toMatchObject({ kmFinal: 10050, km: 30, pendente: true })
  expect(emAndamentoNaTela(fechada[1])).toBe(false)
})
