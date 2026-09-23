import { invalidarCacheFinanceiro } from '../dashboard'
import { ou, supabase } from '../cliente'

/**
 * Tela de ordens de servico: filtro, contagem e somas acontecem no banco
 * (`porto_listar_os`), e a tela pagina. A tela antiga filtrava em campos que a
 * consulta ignorava e cortava em 1000 linhas sem avisar.
 */

/**
 * Situacao financeira da OS.
 *
 * As duas primeiras sao o recorte grosso que a tela ja tinha; as cinco seguintes
 * vem de `porto_os_situacao` e dizem em que pe esta a conciliacao com a OP.
 */
export type SituacaoOs = '' | 'PAGA' | 'AGUARDANDO'
  | 'AGUARDANDO_ANALISE' | 'VALOR_MANUAL' | 'AGUARDANDO_PROXIMA_OP' | 'CONCILIADA' | 'DIVERGENTE'

export type SituacaoDaOs = Exclude<SituacaoOs, '' | 'PAGA' | 'AGUARDANDO'>

export interface FiltroOs {
  inicio: string
  fim: string
  numeroOs?: string
  numeroOp?: string
  motoristaId?: number
  sigla?: string
  especialidade?: string
  situacao?: SituacaoOs
  /** So as OS que ainda estao sem viatura. */
  semViatura?: boolean
  /** Recorta o periodo pela competencia financeira, e nao pela data do servico. */
  porCompetencia?: boolean
}

export interface LinhaOs {
  id: number
  numero: string
  dataAtendimento?: string
  especialidade?: string
  viatura?: string
  valorTotal: number
  motoristaId?: number
  motorista?: string
  socorristaNoArquivo?: string
  ordemPagamentoId?: number
  numeroOp?: string
  /** So existe quando a OS ja foi paga numa OP. */
  comissao?: number
  situacao: SituacaoDaOs
  competenciaInicio?: string
  competenciaFim?: string
  /** Informado a mao antes da OP; continua guardado depois dela, para conferir. */
  valorManual?: number
  /** O da OP quando ela existe; senao, o manual. */
  valorPrevisto?: number
  /** Valor da OP menos o manual, quando os dois existem. */
  divergencia?: number
}

export interface PaginaOs {
  total: number
  /** Quantas OS do filtro estao sem viatura. */
  semViatura: number
  valorTotal: number
  /** Oficial da OP mais o informado a mao do que ainda nao foi pago. */
  valorPrevisto: number
  /** Quantas OS do filtro ainda nao tem valor nenhum. */
  semValor: number
  /** Quantas OS do filtro a OP pagou diferente do valor informado. */
  divergentes: number
  comissaoTotal: number
  itens: LinhaOs[]
}

export const TAMANHO_DA_PAGINA = 100

const numero = (v: unknown) => (v === null || v === undefined ? undefined : Number(v))

/**
 * Valor informado a mao para uma OS que ainda nao entrou em OP. Vale como
 * previsto: nao gera comissao e e substituido pelo valor da OP quando ela chega.
 */
export async function informarValorManual(id: number, valor: number | null): Promise<void> {
  invalidarCacheFinanceiro()
  ou(
    await supabase().rpc('porto_informar_valor_manual', { p_os_id: id, p_valor: valor }),
    'Não foi possível informar o valor.',
  )
}

export async function listarOs(filtro: FiltroOs, pagina = 0, tamanho = TAMANHO_DA_PAGINA): Promise<PaginaOs> {
  const bruto = ou(
    await supabase().rpc('porto_listar_os', {
      p_inicio: filtro.inicio,
      p_fim: filtro.fim,
      p_numero_os: filtro.numeroOs || null,
      p_numero_op: filtro.numeroOp || null,
      p_motorista_id: filtro.motoristaId || null,
      p_sigla: filtro.sigla || null,
      p_especialidade: filtro.especialidade || null,
      p_situacao: filtro.situacao || null,
      p_limite: tamanho,
      p_deslocamento: pagina * tamanho,
      p_sem_viatura: Boolean(filtro.semViatura),
      p_por_competencia: Boolean(filtro.porCompetencia),
    }),
    'Não foi possível carregar as ordens de serviço.',
  ) as PaginaOs
  return {
    total: Number(bruto.total),
    semViatura: Number(bruto.semViatura ?? 0),
    valorTotal: Number(bruto.valorTotal),
    valorPrevisto: Number(bruto.valorPrevisto ?? bruto.valorTotal),
    semValor: Number(bruto.semValor ?? 0),
    divergentes: Number(bruto.divergentes ?? 0),
    comissaoTotal: Number(bruto.comissaoTotal),
    itens: bruto.itens.map(i => ({
      ...i,
      valorTotal: Number(i.valorTotal),
      comissao: numero(i.comissao),
      valorManual: numero(i.valorManual),
      valorPrevisto: numero(i.valorPrevisto),
      divergencia: numero(i.divergencia),
    })),
  }
}

/** Todas as OS do filtro, para exportar: pagina de 1000 em 1000 ate acabar. */
export async function listarTodasAsOs(filtro: FiltroOs): Promise<PaginaOs> {
  const primeira = await listarOs(filtro, 0, 1000)
  const itens = [...primeira.itens]
  for (let pagina = 1; itens.length < primeira.total; pagina++) {
    const proxima = await listarOs(filtro, pagina, 1000)
    if (!proxima.itens.length) break
    itens.push(...proxima.itens)
  }
  return { ...primeira, itens }
}

/** Troca socorrista e/ou viatura; a comissao e recalculada no banco. */
export async function corrigirOs(id: number, correcao: { motoristaId?: number; sigla?: string }): Promise<void> {
  invalidarCacheFinanceiro()
  ou(
    await supabase().rpc('porto_corrigir_os', {
      p_os_id: id,
      p_motorista_id: correcao.motoristaId || null,
      p_sigla: correcao.sigla || null,
    }),
    'Não foi possível corrigir a ordem de serviço.',
  )
}

/**
 * Aplica a viatura as OS do filtro de uma vez. Por padrao so as que estao sem
 * viatura: a sigla que veio do painel diario nao e trocada sem pedir.
 */
export async function definirViaturaEmLote(filtro: FiltroOs, sigla: string, soSemViatura = true): Promise<number> {
  invalidarCacheFinanceiro()
  return ou(
    await supabase().rpc('porto_definir_viatura_em_lote', {
      p_nova_sigla: sigla,
      p_inicio: filtro.inicio,
      p_fim: filtro.fim,
      p_numero_os: filtro.numeroOs || null,
      p_numero_op: filtro.numeroOp || null,
      p_motorista_id: filtro.motoristaId || null,
      p_sigla: filtro.sigla || null,
      p_especialidade: filtro.especialidade || null,
      p_situacao: filtro.situacao || null,
      p_sem_viatura: Boolean(filtro.semViatura),
      p_por_competencia: Boolean(filtro.porCompetencia),
      p_so_sem_viatura: soSemViatura,
    }),
    'Não foi possível definir a viatura das ordens de serviço.',
  ) as number
}

/** O que o detalhe da OS precisa e a lista nao traz: a marca de sem comissao. */
export interface MarcasDaOs { semComissao: boolean; cancelada: boolean; socorristaNoArquivo?: string }

export async function lerMarcasDaOs(id: number): Promise<MarcasDaOs | null> {
  const linha = ou(
    await supabase().from('ordens_servico_porto')
      .select('sem_comissao,status_operacional,socorrista').eq('id', id).maybeSingle(),
    'Não foi possível abrir a OS.',
  ) as { sem_comissao: boolean; status_operacional: string; socorrista: string | null } | null
  if (!linha) return null
  return {
    semComissao: linha.sem_comissao,
    cancelada: linha.status_operacional === 'CANCELADO',
    socorristaNoArquivo: linha.socorrista ?? undefined,
  }
}
