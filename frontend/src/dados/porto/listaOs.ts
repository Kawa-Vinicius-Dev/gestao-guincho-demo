import { invalidarCacheFinanceiro } from '../dashboard'
import { ou, supabase } from '../cliente'

/**
 * Tela de ordens de servico: filtro, contagem e somas acontecem no banco
 * (`porto_listar_os`), e a tela pagina. A tela antiga filtrava em campos que a
 * consulta ignorava e cortava em 1000 linhas sem avisar.
 */

export type SituacaoOs = '' | 'PAGA' | 'AGUARDANDO'

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
}

export interface PaginaOs {
  total: number
  /** Quantas OS do filtro estao sem viatura. */
  semViatura: number
  valorTotal: number
  comissaoTotal: number
  itens: LinhaOs[]
}

export const TAMANHO_DA_PAGINA = 100

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
    }),
    'Não foi possível carregar as ordens de serviço.',
  ) as PaginaOs
  return {
    total: Number(bruto.total),
    semViatura: Number(bruto.semViatura ?? 0),
    valorTotal: Number(bruto.valorTotal),
    comissaoTotal: Number(bruto.comissaoTotal),
    itens: bruto.itens.map(i => ({
      ...i,
      valorTotal: Number(i.valorTotal),
      comissao: i.comissao === null || i.comissao === undefined ? undefined : Number(i.comissao),
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
      p_so_sem_viatura: soSemViatura,
    }),
    'Não foi possível definir a viatura das ordens de serviço.',
  ) as number
}
