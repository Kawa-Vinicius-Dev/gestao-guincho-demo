import { ApiError } from '../api/http'
import { erroDoBanco, ou, supabase } from './cliente'
import { moduloNoSupabase } from './modo'

/**
 * Turno do socorrista.
 *
 * O socorrista aponta o odometro na abertura e no fechamento; o km rodado e
 * conta do banco. Nada aqui vira km oficial sozinho — o turno fica aguardando o
 * administrador, e e a aprovacao dele que cria a linha de quilometragem.
 *
 * Nao existe caminho pelo backend do Render: o modulo nasceu depois da mudanca
 * para Supabase direto, entao sem o modo ligado a tela avisa em vez de tentar
 * uma rota que nunca existiu.
 *
 * Fotos: bucket privado `comprovantes`, caminho `turnos/<id>/<arquivo>` — as
 * policies leem o id dali. A foto e comprimida antes de subir porque ela sai de
 * uma camera de celular no meio da rua: 4 MB de JPEG original em 4G ruim e a
 * diferenca entre o turno fechar e o socorrista desistir.
 */

const BUCKET = 'comprovantes'
const LARGURA_MAXIMA = 1600
const QUALIDADE = 0.7
const VALIDADE_LINK_SEGUNDOS = 60

export type SituacaoTurno = 'ABERTO' | 'AGUARDANDO_APROVACAO' | 'APROVADO' | 'DEVOLVIDO'

export interface TurnoAberto {
  id: number
  data: string
  abertoEm: string
  veiculoId: number
  veiculo: string
  hodometroInicial: number
  temFotoAbertura: boolean
  /** Turno aberto depois do checklist existir e ainda sem as fotos dele. */
  faltaChecklist?: boolean
  deDiaAnterior: boolean
  observacoes?: string | null
}

export interface TurnoDevolvido {
  id: number
  data: string
  veiculo: string
  hodometroInicial: number
  hodometroFinal: number | null
  motivo: string
}

export interface TurnoResumo {
  id: number
  data: string
  veiculo: string
  situacao: SituacaoTurno
  kmRodado: number | null
}

export interface ViaturaDoTurno {
  id: number
  identificacao: string
  ultimoHodometro: number | null
}

export interface MeuTurnoDoDia {
  socorrista: { id: number; nome: string; qra?: string | null } | null
  hoje: string
  turnoAberto: TurnoAberto | null
  turnosDevolvidos: TurnoDevolvido[]
  ultimosTurnos: TurnoResumo[]
  viaturas: ViaturaDoTurno[]
  veiculoSugerido: number | null
}

function exigirSupabase() {
  if (!moduloNoSupabase('turnos')) {
    throw new ApiError('Área do socorrista indisponível nesta configuração.', 503)
  }
}

export async function meuTurnoDoDia(): Promise<MeuTurnoDoDia> {
  exigirSupabase()
  const dados = ou(
    await supabase().rpc('meu_turno_do_dia'),
    'Não foi possível carregar o seu turno.',
  )
  const turno = (dados as MeuTurnoDoDia).turnoAberto
  if (turno) {
    // A RPC da tela e anterior ao checklist; a linha do turno diz se ele falta.
    const { data: linha } = await supabase().from('turnos')
      .select('exige_checklist,checklist').eq('id', turno.id).maybeSingle()
    turno.faltaChecklist = Boolean(linha?.exige_checklist && !linha?.checklist)
  }
  return dados as MeuTurnoDoDia
}

/**
 * Comprime a foto do painel antes de subir.
 *
 * Reduz o lado maior para 1600px e recodifica em JPEG. O odometro continua
 * legivel nesse tamanho — o que se perde e o que a camera grava de sobra. Se o
 * navegador nao souber decodificar a imagem, sobe o arquivo original: foto
 * pesada e melhor do que turno que nao fecha.
 */
export async function comprimirFoto(arquivo: File, largura = LARGURA_MAXIMA, qualidade = QUALIDADE): Promise<File> {
  try {
    const bitmap = await createImageBitmap(arquivo)
    const escala = Math.min(1, largura / Math.max(bitmap.width, bitmap.height))
    const larguraFinal = Math.round(bitmap.width * escala)
    const altura = Math.round(bitmap.height * escala)
    const tela = document.createElement('canvas')
    tela.width = larguraFinal
    tela.height = altura
    const contexto = tela.getContext('2d')
    if (!contexto) return arquivo
    contexto.drawImage(bitmap, 0, 0, larguraFinal, altura)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>(resolve =>
      tela.toBlob(resolve, 'image/jpeg', qualidade))
    if (!blob || blob.size >= arquivo.size) return arquivo
    return new File([blob], 'odometro.jpg', { type: 'image/jpeg' })
  } catch {
    return arquivo
  }
}

async function subirFoto(turnoId: number, momento: 'abertura' | 'fechamento', arquivo: File) {
  const comprimida = await comprimirFoto(arquivo)
  const caminho = `turnos/${turnoId}/${momento}-${Date.now()}.jpg`
  const { error } = await supabase().storage.from(BUCKET)
    .upload(caminho, comprimida, { contentType: comprimida.type, upsert: false })
  if (error) throw erroDoBanco({ message: error.message }, 'Não foi possível enviar a foto.')
  return caminho
}

export async function abrirTurno(dados: {
  veiculoId: number
  hodometro: number
  observacoes?: string
  foto: File
}): Promise<number> {
  exigirSupabase()
  const id = ou(
    await supabase().rpc('abrir_turno', {
      p_veiculo_id: dados.veiculoId,
      p_hodometro: dados.hodometro,
      p_observacoes: dados.observacoes ?? null,
    }),
    'Não foi possível abrir o turno.',
  ) as number

  // A foto e obrigatoria, mas so pode subir depois que o turno existe: o caminho
  // no Storage carrega o id dele. Se o envio falhar, o turno ja esta aberto — a
  // falha nao e engolida: a tela avisa e oferece reenviar a foto da saida.
  await enviarFotoAbertura(id, dados.foto)
  return id
}

/** Envia (ou reenvia) a foto do painel na saida de um turno ja aberto. */
export async function enviarFotoAbertura(turnoId: number, foto: File): Promise<void> {
  exigirSupabase()
  try {
    const caminho = await subirFoto(turnoId, 'abertura', foto)
    ou(
      await supabase().rpc('registrar_foto_abertura', { p_turno_id: turnoId, p_caminho: caminho }),
      'Não foi possível registrar a foto.',
    )
  } catch {
    throw new ApiError(
      'O turno foi aberto, mas a foto do painel não subiu. Envie a foto de novo para continuar.', 400,
    )
  }
}

export async function fecharTurno(dados: {
  turnoId: number
  hodometro: number
  foto: File
  observacoes?: string
}): Promise<void> {
  exigirSupabase()
  // A foto sobe primeiro: o fechamento so e gravado com o caminho dela, e o
  // banco recusa fechar sem foto. Assim nao existe turno fechado sem prova.
  const caminho = await subirFoto(dados.turnoId, 'fechamento', dados.foto)
  ou(
    await supabase().rpc('fechar_turno', {
      p_turno_id: dados.turnoId,
      p_hodometro: dados.hodometro,
      p_foto: caminho,
      p_observacoes: dados.observacoes ?? null,
    }),
    'Não foi possível fechar o turno.',
  )
}

// ---------------------------------------------------------------------------
// Fila do administrador
// ---------------------------------------------------------------------------

export interface ItemDaFila {
  tipo: 'TURNO' | 'DESPESA'
  id: number
  data: string
  socorristaId: number
  socorrista: string
  qra?: string | null
  /* turno */
  veiculoId?: number
  veiculo?: string | null
  hodometroInicial?: number
  hodometroFinal?: number
  kmRodado?: number
  custoPorKm?: number
  fotoAbertura?: string | null
  fotoFechamento?: string | null
  abertoEm?: string
  fechadoEm?: string
  osNoDia?: number
  /* despesa */
  descricao?: string
  valor?: number
  categoria?: string
  comprovante?: string | null
  descontaDaComissao?: boolean
  observacoes?: string | null
}

export interface TurnoNaoFechado {
  id: number
  data: string
  socorristaId: number
  socorrista: string
  veiculo: string
  hodometroInicial: number
  diasEmAberto: number
}

export interface FilaDeAprovacoes {
  itens: ItemDaFila[]
  turnosNaoFechados: TurnoNaoFechado[]
}

export async function filaDeAprovacoes(inicio?: string, fim?: string): Promise<FilaDeAprovacoes> {
  exigirSupabase()
  const dados = ou(
    await supabase().rpc('fila_de_aprovacoes', {
      p_inicio: inicio ?? null,
      p_fim: fim ?? null,
    }),
    'Não foi possível carregar a fila de aprovações.',
  )
  return dados as FilaDeAprovacoes
}

export async function aprovarTurno(
  turnoId: number, kmProdutivo: number, observacoes?: string,
): Promise<void> {
  exigirSupabase()
  ou(
    await supabase().rpc('aprovar_turno', {
      p_turno_id: turnoId,
      p_km_remunerado: kmProdutivo,
      p_observacoes: observacoes ?? null,
    }),
    'Não foi possível aprovar o turno.',
  )
}

export async function devolverTurno(turnoId: number, motivo: string): Promise<void> {
  exigirSupabase()
  ou(
    await supabase().rpc('devolver_turno', { p_turno_id: turnoId, p_motivo: motivo }),
    'Não foi possível devolver o turno.',
  )
}

/**
 * Baixa a foto para o computador de quem esta aprovando.
 *
 * Kawa, 23/09/2026: a foto so serve para conferir, e e apagada depois da
 * aprovacao; mas, se houver divergencia de valor, quem aprova precisa guardar
 * a foto para cobrar o socorrista pela digitacao errada. O link assinado com
 * `download` faz o navegador salvar o arquivo, em vez de abrir.
 */
export async function baixarFoto(caminho: string, nomeDoArquivo: string): Promise<void> {
  const { data, error } = await supabase().storage.from(BUCKET)
    .createSignedUrl(caminho, VALIDADE_LINK_SEGUNDOS, { download: nomeDoArquivo })
  if (error || !data?.signedUrl) {
    throw erroDoBanco({ message: error?.message }, 'Não foi possível baixar a foto.')
  }
  const link = document.createElement('a')
  link.href = data.signedUrl
  link.download = nomeDoArquivo
  document.body.appendChild(link); link.click(); link.remove()
}

/**
 * Apaga as fotos do turno depois da aprovacao: elas so existem para conferir o
 * odometro, e guarda-las ocupa espaco sem servir para mais nada. Falha aqui nao
 * desfaz a aprovacao — no pior caso a foto fica, e nada se perde.
 */
export async function apagarFotosDoTurno(caminhos: (string | null | undefined)[]): Promise<void> {
  const validos = caminhos.filter((c): c is string => Boolean(c))
  if (!validos.length) return
  await supabase().storage.from(BUCKET).remove(validos).catch(() => {})
}

/** Link temporario para ver a foto: o bucket e privado, nao ha URL publica. */
export async function linkDaFoto(caminho: string): Promise<string> {
  const { data, error } = await supabase().storage.from(BUCKET)
    .createSignedUrl(caminho, VALIDADE_LINK_SEGUNDOS)
  if (error || !data?.signedUrl) {
    throw erroDoBanco({ message: error?.message }, 'Não foi possível abrir a foto.')
  }
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// Checklist da viatura
// ---------------------------------------------------------------------------

/**
 * As 8 fotos que todo checklist tem, na ordem em que o socorrista anda em volta
 * da viatura. O painel nao esta aqui: ele ja e a foto do odometro da saida.
 */
export const FOTOS_DO_CHECKLIST = [
  { chave: 'frente', rotulo: 'Frente' },
  { chave: 'traseira', rotulo: 'Traseira' },
  { chave: 'esquerda', rotulo: 'Lado esquerdo' },
  { chave: 'direita', rotulo: 'Lado direito' },
  { chave: 'pneu_de', rotulo: 'Pneu dianteiro esquerdo' },
  { chave: 'pneu_dd', rotulo: 'Pneu dianteiro direito' },
  { chave: 'pneu_te', rotulo: 'Pneu traseiro esquerdo' },
  { chave: 'pneu_td', rotulo: 'Pneu traseiro direito' },
] as const

export type ChaveDoChecklist = typeof FOTOS_DO_CHECKLIST[number]['chave']

export interface DanoDoChecklist { foto: File; descricao: string }

export interface Checklist {
  fotos: Partial<Record<ChaveDoChecklist, string>>
  danos: { caminho: string; descricao: string }[]
}

/**
 * Menor que a do odometro: aqui e so para ver se a viatura esta inteira, nao
 * para ler numero. 1280px em JPEG 0.6 fica perto de 150 KB por foto.
 */
const LARGURA_CHECKLIST = 1280
const QUALIDADE_CHECKLIST = 0.6

/**
 * Sobe as fotos e grava o checklist. As fotos vao para o Storage; o banco guarda
 * so o caminho de cada uma, e elas somem na aprovacao ou em 7 dias.
 */
export async function enviarChecklist(
  turnoId: number, fotos: Record<ChaveDoChecklist, File>, danos: DanoDoChecklist[],
): Promise<void> {
  const subir = async (nome: string, arquivo: File) => {
    const comprimida = await comprimirFoto(arquivo, LARGURA_CHECKLIST, QUALIDADE_CHECKLIST)
    const caminho = `turnos/${turnoId}/checklist-${nome}-${Date.now()}.jpg`
    const { error } = await supabase().storage.from(BUCKET)
      .upload(caminho, comprimida, { contentType: comprimida.type, upsert: false })
    if (error) throw erroDoBanco({ message: error.message }, 'Não foi possível enviar as fotos.')
    return caminho
  }
  try {
    const caminhos: Record<string, string> = {}
    for (const { chave } of FOTOS_DO_CHECKLIST) caminhos[chave] = await subir(chave, fotos[chave])
    const danosEnviados = []
    for (const [i, dano] of danos.entries()) {
      danosEnviados.push({ caminho: await subir(`dano-${i + 1}`, dano.foto), descricao: dano.descricao.trim() })
    }
    ou(
      await supabase().rpc('registrar_checklist', {
        p_turno_id: turnoId, p_fotos: caminhos, p_danos: danosEnviados,
      }),
      'Não foi possível registrar o checklist.',
    )
  } catch {
    throw new ApiError('As fotos do checklist não subiram. Tente enviar de novo.', 400)
  }
}

/** O checklist de cada turno, para o administrador ver em Aprovações. */
export async function checklistsDosTurnos(ids: number[]): Promise<Map<number, Checklist>> {
  if (!ids.length) return new Map()
  const linhas = ou(
    await supabase().from('turnos').select('id,checklist,checklist_apagado_em').in('id', ids),
    'Não foi possível carregar o checklist.',
  ) as { id: number; checklist: Checklist | null; checklist_apagado_em: string | null }[]
  return new Map(linhas.filter(l => l.checklist && !l.checklist_apagado_em).map(l => [l.id, l.checklist as Checklist]))
}

/**
 * Apaga do Storage as fotos de checklist que ja cumpriram o papel: turno
 * aprovado, ou com mais de 7 dias. Roda quando o administrador abre Aprovações e
 * depois de cada aprovação; falhar aqui nao atrapalha a tela.
 */
export async function limparChecklistsAntigos(): Promise<void> {
  try {
    const lista = ou(
      await supabase().rpc('checklists_para_apagar'),
      'Não foi possível conferir as fotos antigas.',
    ) as { id: number; caminhos: string[] }[]
    if (!lista?.length) return
    const { error } = await supabase().storage.from(BUCKET).remove(lista.flatMap(t => t.caminhos))
    if (error) return
    await supabase().rpc('marcar_checklists_apagados', { p_ids: lista.map(t => t.id) })
  } catch {
    // Tenta de novo na proxima vez que a tela abrir.
  }
}
