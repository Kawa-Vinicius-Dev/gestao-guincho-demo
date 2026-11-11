import { ApiError } from './erros'
import { SEM_REDE, usuarioAtualId } from './cliente'
import {
  criarServicoNoBanco, enviarFotoInicioSemEmbrulho, finalizarServico, servicosDoTurno,
  type Localizacao, type ServicoDoTurno,
} from './turnos'

/**
 * Fila de envio do socorrista (offline).
 *
 * Na rua o sinal falha. Iniciar e finalizar servico (com a foto do painel) viram
 * itens guardados no celular, em IndexedDB, e seguem para o banco, na ordem em
 * que foram feitos, quando a conexao volta. Nada aqui decide regra de negocio:
 * cada item chama as mesmas funcoes de sempre (`turnos.ts`) e o banco continua
 * dizendo sim ou nao. A fila so segura o que ainda nao deu para enviar.
 *
 * Tres tipos de item, na ordem em que acontecem:
 *   INICIAR      cria o servico (RPC) e passa a FOTO_INICIO;
 *   FOTO_INICIO  sobe a foto do inicio (o servico ja existe);
 *   FINALIZAR    sobe a foto do fim e finaliza (aponta para um servico do banco
 *                ou, enquanto o INICIAR ainda esta na fila, para o `seq` dele).
 *
 * O que nao pode acontecer: perder o que o socorrista fez, duplicar um servico,
 * ou mandar o servico de uma pessoa na conta de outra. Por isso:
 *   - a fila e por usuario (`usuarioId`);
 *   - item recusado pelo banco NAO e apagado: fica "bloqueado" com a frase do
 *     banco, e a fila para ali ate a pessoa descartar ou tentar de novo;
 *   - se a resposta se perdeu no caminho (o banco gravou, o celular nao soube),
 *     o reenvio confere o que ja existe antes de concluir.
 */

export interface FotoGuardada { bytes: ArrayBuffer; tipo: string; nome: string }

export interface ItemDaFila {
  seq?: number
  usuarioId: string
  turnoId: number
  tipo: 'INICIAR' | 'FOTO_INICIO' | 'FINALIZAR'
  numeroOs?: string
  kmInicial?: number
  kmFinal?: number
  /** Servico ja criado no banco. */
  servicoId?: number
  /** `seq` do INICIAR que ainda esta na fila (quando o servico nem existe no banco). */
  ref?: number
  foto: FotoGuardada
  local: Localizacao
  /** Hora em que o socorrista tocou no botao (ISO). */
  ocorridoEm: string
  tentativas: number
  /** Frase que o banco deu ao recusar. Item bloqueado para a fila. */
  bloqueio?: string
}

/** Depois de tantas falhas que nao sao de rede nem de regra, a fila para e mostra o erro. */
const LIMITE_DE_TENTATIVAS = 5

// ---------------------------------------------------------------- armazenamento

const BANCO = 'fluxo-gestao-fila'
const LOJA = 'itens'
let abertura: Promise<IDBDatabase> | null = null

function banco(): Promise<IDBDatabase> {
  abertura ??= new Promise((resolver, rejeitar) => {
    if (typeof indexedDB === 'undefined') { rejeitar(new ApiError('Sem sinal, e este celular não consegue guardar o envio. Tente de novo quando houver sinal.', 503)); return }
    const pedido = indexedDB.open(BANCO, 1)
    pedido.onupgradeneeded = () => { pedido.result.createObjectStore(LOJA, { keyPath: 'seq', autoIncrement: true }) }
    pedido.onsuccess = () => resolver(pedido.result)
    pedido.onerror = () => { abertura = null; rejeitar(pedido.error) }
  })
  return abertura
}

async function pedir<T>(modo: IDBTransactionMode, usar: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const bd = await banco()
  return new Promise((resolver, rejeitar) => {
    const transacao = bd.transaction(LOJA, modo)
    const pedido = usar(transacao.objectStore(LOJA))
    transacao.oncomplete = () => resolver(pedido.result)
    transacao.onerror = () => rejeitar(transacao.error)
    transacao.onabort = () => rejeitar(transacao.error)
  })
}

/** So para os testes: esquece a conexao para o proximo teste abrir um banco limpo. */
export function reiniciarFilaParaTeste() { abertura = null; ouvintes.clear(); processando = false }

async function lerBytes(arquivo: Blob): Promise<ArrayBuffer> {
  if (typeof arquivo.arrayBuffer === 'function') return arquivo.arrayBuffer()
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader()
    leitor.onload = () => resolver(leitor.result as ArrayBuffer)
    leitor.onerror = () => rejeitar(leitor.error)
    leitor.readAsArrayBuffer(arquivo)
  })
}

export async function guardarFoto(arquivo: File): Promise<FotoGuardada> {
  return { bytes: await lerBytes(arquivo), tipo: arquivo.type || 'image/jpeg', nome: arquivo.name || 'foto.jpg' }
}

const paraArquivo = (f: FotoGuardada) => new File([f.bytes], f.nome, { type: f.tipo })

const ouvintes = new Set<() => void>()
const notificar = () => ouvintes.forEach(f => f())
/** Avisa quando a fila muda (item novo, enviado, bloqueado). Devolve o cancelamento. */
export function aoMudar(f: () => void): () => void {
  ouvintes.add(f)
  return () => { ouvintes.delete(f) }
}

export async function listarFila(usuarioId: string): Promise<ItemDaFila[]> {
  const todos = await pedir('readonly', l => l.getAll() as IDBRequest<ItemDaFila[]>)
  return todos.filter(i => i.usuarioId === usuarioId).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

const gravar = (item: ItemDaFila) => pedir('readwrite', l => l.put(item))
const remover = (seq: number) => pedir('readwrite', l => l.delete(seq))

export async function enfileirar(dados: Omit<ItemDaFila, 'seq' | 'tentativas' | 'foto'> & { foto: File }): Promise<number> {
  const { foto, ...resto } = dados
  const item: ItemDaFila = { ...resto, foto: await guardarFoto(foto), tentativas: 0 }
  const seq = Number(await pedir('readwrite', l => l.add(item)))
  notificar()
  return seq
}

/** Descarta o item (e o FINALIZAR que dependia dele). So por decisao da pessoa. */
export async function descartarItem(usuarioId: string, seq: number): Promise<void> {
  const itens = await listarFila(usuarioId)
  for (const i of itens) if (i.seq === seq || (i.tipo === 'FINALIZAR' && i.ref === seq)) await remover(i.seq as number)
  notificar()
}

/** Tira o bloqueio e deixa a fila tentar de novo. */
export async function tentarDeNovo(usuarioId: string, seq: number): Promise<void> {
  const item = (await listarFila(usuarioId)).find(i => i.seq === seq)
  if (item) await gravar({ ...item, bloqueio: undefined, tentativas: 0 })
  notificar()
}

// ------------------------------------------------------------------ classificacao

const semInternet = () => typeof navigator !== 'undefined' && navigator.onLine === false

/** A chamada nem chegou ao servidor. */
export const ehSemRede = (e: unknown) => e instanceof ApiError && e.status === 503 && e.message === SEM_REDE

/** Nao e culpa do item: sem sinal, servidor fora, sessao vencida, limite de tentativas. */
const esperarOutroMomento = (e: unknown) =>
  e instanceof ApiError && (e.status === 503 || e.status === 401 || e.status === 429)

/** O banco recusou por regra (400/403/404/409/413/415): repetir nao muda nada. */
const recusaDefinitiva = (e: unknown) =>
  e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429

// ---------------------------------------------------------------- processamento

let processando = false

/** Confere no banco se o servico que a fila ia criar ja existe (a resposta se perdeu). */
async function servicoJaCriado(item: ItemDaFila): Promise<number | null> {
  const lista = await servicosDoTurno([item.turnoId])
  const s = lista.find(x => x.numeroOs.trim() === (item.numeroOs ?? '').trim() && x.kmInicial === item.kmInicial)
  return s?.id ?? null
}

/** Confere se o servico ja foi finalizado com este km (a resposta se perdeu). */
async function jaFinalizadoIgual(item: ItemDaFila): Promise<boolean> {
  const lista = await servicosDoTurno([item.turnoId])
  const s = lista.find(x => x.id === item.servicoId)
  return !!s && !!s.finalizadoEm && s.kmFinal === item.kmFinal
}

async function passarParaFotoDoInicio(item: ItemDaFila, servicoId: number, todos: ItemDaFila[]) {
  await gravar({ ...item, tipo: 'FOTO_INICIO', servicoId, tentativas: 0 })
  for (const f of todos) {
    if (f.tipo === 'FINALIZAR' && f.ref === item.seq) await gravar({ ...f, servicoId, ref: undefined })
  }
}

/** 'feito': saiu da fila; 'continua': virou outro passo; 'parou': para a fila aqui. */
async function executar(item: ItemDaFila, todos: ItemDaFila[]): Promise<'feito' | 'continua' | 'parou'> {
  try {
    if (item.tipo === 'INICIAR') {
      let id: number
      try {
        id = await criarServicoNoBanco({
          numeroOs: item.numeroOs ?? '', kmInicial: item.kmInicial ?? 0, local: item.local, ocorridoEm: item.ocorridoEm,
        })
      } catch (e) {
        // 409: a OS ja esta no turno. Se foi esta mesma (resposta perdida), segue; senao e duplicada de verdade.
        const existente = e instanceof ApiError && e.status === 409 ? await servicoJaCriado(item) : null
        if (existente == null) throw e
        id = existente
      }
      await passarParaFotoDoInicio(item, id, todos)
      return 'continua'
    }
    if (item.tipo === 'FOTO_INICIO') {
      await enviarFotoInicioSemEmbrulho(item.turnoId, item.servicoId as number, paraArquivo(item.foto))
      await remover(item.seq as number)
      return 'feito'
    }
    if (item.servicoId == null) throw new ApiError('O serviço de origem ainda não foi enviado.', 409)
    try {
      await finalizarServico({
        turnoId: item.turnoId, servicoId: item.servicoId, kmFinal: item.kmFinal ?? 0,
        foto: paraArquivo(item.foto), local: item.local, ocorridoEm: item.ocorridoEm,
      })
    } catch (e) {
      if (esperarOutroMomento(e) || !(await jaFinalizadoIgual(item))) throw e
    }
    await remover(item.seq as number)
    return 'feito'
  } catch (e) {
    if (esperarOutroMomento(e)) return 'parou'
    const tentativas = item.tentativas + 1
    const bloquear = recusaDefinitiva(e) || tentativas >= LIMITE_DE_TENTATIVAS
    await gravar({ ...item, tentativas, bloqueio: bloquear ? (e as Error).message : undefined })
    return 'parou'
  }
}

/**
 * Envia a fila do usuario, na ordem. Para no primeiro item que nao deu (sem sinal
 * ou recusado) e devolve quantos sairam. Uma execucao por vez, tambem entre abas.
 */
export async function processarFila(usuarioId: string): Promise<number> {
  const rodar = async () => {
    if (processando) return 0
    processando = true
    let enviados = 0
    try {
      for (;;) {
        const todos = await listarFila(usuarioId)
        const item = todos[0]
        if (!item || item.bloqueio) break
        const resultado = await executar(item, todos)
        if (resultado === 'feito') enviados++
        if (resultado === 'parou') break
      }
    } finally {
      processando = false
      notificar()
    }
    return enviados
  }
  const travas = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!travas) return rodar()
  return (await travas.request('fluxo-gestao-fila', { ifAvailable: true }, async lock => (lock ? rodar() : 0))) as number
}

// ------------------------------------------------------------- uso pela tela

/**
 * Tem algo esperando? Se o aparelho nao guarda dados (alguns modos privados),
 * responde que nao: o envio normal, com sinal, nao pode depender da fila.
 */
const temFila = async (usuarioId: string) => (await listarFila(usuarioId).catch(() => [])).length > 0

interface Base { usuarioId: string; turnoId: number; foto: File; local: Localizacao; ocorridoEm: string }

/**
 * Inicia o servico; sem sinal, guarda no celular. Com algo ja na fila, entra na
 * fila tambem (a ordem importa: o banco so aceita um servico aberto por vez).
 */
export async function iniciarOuEnfileirar(d: Base & { numeroOs: string; kmInicial: number }): Promise<{ enfileirado: boolean }> {
  const guardar = async (extra: Partial<Omit<ItemDaFila, 'foto'>> & Pick<ItemDaFila, 'tipo'>) => {
    await enfileirar({ usuarioId: d.usuarioId, turnoId: d.turnoId, foto: d.foto, local: d.local, ocorridoEm: d.ocorridoEm, ...extra })
    return { enfileirado: true }
  }
  const inicio = { tipo: 'INICIAR' as const, numeroOs: d.numeroOs.trim(), kmInicial: d.kmInicial }
  if (semInternet() || (await temFila(d.usuarioId))) return guardar(inicio)
  let id: number
  try {
    id = await criarServicoNoBanco({ numeroOs: d.numeroOs, kmInicial: d.kmInicial, local: d.local })
  } catch (e) {
    if (ehSemRede(e)) return guardar(inicio)
    throw e
  }
  try {
    await enviarFotoInicioSemEmbrulho(d.turnoId, id, d.foto)
  } catch (e) {
    if (ehSemRede(e)) return guardar({ tipo: 'FOTO_INICIO', servicoId: id })
    throw new ApiError('O serviço foi iniciado, mas a foto não foi enviada. Envie a foto de novo.', 400)
  }
  return { enfileirado: false }
}

/** Finaliza o servico; sem sinal (ou com o inicio ainda na fila), guarda no celular. */
export async function finalizarOuEnfileirar(
  d: Base & { kmFinal: number; servicoId: number | null; refInicio?: number },
): Promise<{ enfileirado: boolean; rodado?: number }> {
  const guardar = async () => {
    await enfileirar({
      usuarioId: d.usuarioId, turnoId: d.turnoId, foto: d.foto, local: d.local, ocorridoEm: d.ocorridoEm,
      tipo: 'FINALIZAR', kmFinal: d.kmFinal,
      ...(d.servicoId != null ? { servicoId: d.servicoId } : { ref: d.refInicio }),
    })
    return { enfileirado: true }
  }
  if (d.servicoId == null || semInternet() || (await temFila(d.usuarioId))) return guardar()
  try {
    const rodado = await finalizarServico({
      turnoId: d.turnoId, servicoId: d.servicoId, kmFinal: d.kmFinal, foto: d.foto, local: d.local,
    })
    return { enfileirado: false, rodado }
  } catch (e) {
    if (ehSemRede(e)) return guardar()
    throw e
  }
}

/**
 * Quem esta com a sessao aberta, para dono da fila. Sem sinal por mais de uma hora
 * a sessao nao renova e `usuarioAtualId` falha, mas a fila continua sendo da mesma
 * pessoa: por isso o ultimo id conhecido fica guardado enquanto a aba existir.
 */
const CHAVE_USUARIO = 'fluxo-gestao:fila:usuario:v1'
export async function usuarioDaFila(): Promise<string | null> {
  try {
    const id = await usuarioAtualId()
    try { sessionStorage.setItem(CHAVE_USUARIO, id) } catch { /* sem armazenamento, segue */ }
    return id
  } catch {
    try { return sessionStorage.getItem(CHAVE_USUARIO) } catch { return null }
  }
}

// ------------------------------------------------------------ o que a tela mostra

export interface ServicoNaTela {
  chave: string
  id: number | null
  /** `seq` do INICIAR na fila, quando o servico nem chegou ao banco. */
  seq?: number
  numeroOs: string
  kmInicial: number | null
  kmFinal: number | null
  km: number | null
  iniciadoEm: string | null
  finalizadoEm: string | null
  fotoInicio: string | null
  /** Ainda ha algo deste servico para enviar. */
  pendente: boolean
}

/** Junta o que o banco ja sabe com o que ainda esta na fila, na ordem em que aconteceu. */
export function combinarComFila(servicos: ServicoDoTurno[], itens: ItemDaFila[]): ServicoNaTela[] {
  const lista: ServicoNaTela[] = servicos.map(s => ({
    chave: `s-${s.id}`, id: s.id, numeroOs: s.numeroOs, kmInicial: s.kmInicial ?? null, kmFinal: s.kmFinal ?? null,
    km: s.km ?? null, iniciadoEm: s.iniciadoEm ?? null, finalizadoEm: s.finalizadoEm ?? null,
    fotoInicio: s.fotoInicio ?? null, pendente: false,
  }))
  for (const item of itens) {
    if (item.tipo === 'INICIAR') {
      lista.push({
        chave: `f-${item.seq}`, id: null, seq: item.seq, numeroOs: item.numeroOs ?? '', kmInicial: item.kmInicial ?? null,
        kmFinal: null, km: null, iniciadoEm: item.ocorridoEm, finalizadoEm: null, fotoInicio: 'na-fila', pendente: true,
      })
      continue
    }
    const alvo = item.servicoId != null ? lista.find(s => s.id === item.servicoId) : lista.find(s => s.seq === item.ref)
    if (!alvo) continue
    alvo.pendente = true
    if (item.tipo === 'FOTO_INICIO') alvo.fotoInicio ??= 'na-fila'
    else {
      alvo.kmFinal = item.kmFinal ?? null
      alvo.km = (item.kmFinal ?? 0) - (alvo.kmInicial ?? 0)
      alvo.finalizadoEm = item.ocorridoEm
    }
  }
  return lista
}

export const emAndamentoNaTela = (s: ServicoNaTela) => s.kmInicial != null && s.kmFinal == null
