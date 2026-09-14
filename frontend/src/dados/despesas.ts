import { api } from '../api/http'
import type { Despesa } from '../types/modelos'
import { invalidarCacheFinanceiro } from './dashboard'
import { ou, supabase, usuarioAtualId } from './cliente'
import { moduloNoSupabase } from './modo'

/**
 * Despesas.
 *
 * Aprovar e pagar nao sao update de coluna: carregam regra que depende de quem
 * chama e do estado anterior (ninguem aprova o proprio lancamento; so despesa
 * aprovada pode ser paga). Por isso vao por RPC, onde a regra e verificavel, e
 * nao por `.update()`.
 *
 * O comprovante continua no backend antigo nesta fase: envolve o Storage e um
 * fluxo proprio de arquivo, que e a fase seguinte.
 */

/**
 * Os nomes de categoria, viatura, socorrista e de quem lancou vem por join
 * embutido — uma ida ao banco para a lista inteira. Buscar cada nome depois
 * seria uma consulta por linha da tabela.
 */
const COLUNAS = [
  'id', 'descricao', 'valor', 'data_lancamento', 'vencimento', 'data_pagamento',
  'forma_pagamento', 'status', 'aprovada', 'protocolo', 'observacoes',
  'comprovante_arquivo', 'comprovante_nome_original', 'comprovante_tamanho_bytes',
  'categorias(nome)', 'veiculos(identificacao)', 'motoristas(nome)', 'perfis!despesas_criado_por_fkey(nome)',
].join(',')

type Vinculo<T> = T | T[] | null
type LinhaDespesa = {
  id: number
  descricao: string
  valor: number | string
  data_lancamento: string
  vencimento: string | null
  data_pagamento: string | null
  forma_pagamento: string | null
  status: Despesa['status']
  aprovada: boolean
  protocolo: string | null
  observacoes: string | null
  comprovante_arquivo: string | null
  comprovante_nome_original: string | null
  comprovante_tamanho_bytes: number | null
  categorias: Vinculo<{ nome: string }>
  veiculos: Vinculo<{ identificacao: string }>
  motoristas: Vinculo<{ nome: string }>
  perfis: Vinculo<{ nome: string }>
}

function um<T>(vinculo: Vinculo<T>): T | undefined {
  if (!vinculo) return undefined
  return Array.isArray(vinculo) ? vinculo[0] : vinculo
}

function paraModelo(linha: LinhaDespesa): Despesa {
  return {
    id: linha.id,
    descricao: linha.descricao,
    categoria: um(linha.categorias)?.nome ?? '',
    valor: Number(linha.valor),
    data: linha.data_lancamento,
    vencimento: linha.vencimento ?? undefined,
    dataPagamento: linha.data_pagamento ?? undefined,
    formaPagamento: linha.forma_pagamento ?? undefined,
    veiculo: um(linha.veiculos)?.identificacao,
    motorista: um(linha.motoristas)?.nome,
    protocolo: linha.protocolo ?? undefined,
    comprovante: linha.comprovante_arquivo ?? undefined,
    observacoes: linha.observacoes ?? undefined,
    status: linha.status,
    aprovada: linha.aprovada,
    criadoPor: um(linha.perfis)?.nome ?? '',
    comprovanteNomeOriginal: linha.comprovante_nome_original ?? undefined,
    comprovanteTamanhoBytes: linha.comprovante_tamanho_bytes ?? undefined,
  }
}

export interface DadosDespesa {
  descricao: string
  categoriaId: number
  valor: number
  data: string
  vencimento?: string | null
  dataPagamento?: string | null
  formaPagamento?: string | null
  veiculoId?: number | null
  motoristaId?: number | null
  protocolo?: string | null
  observacoes?: string | null
  status?: Despesa['status']
}

/**
 * Quantas despesas a tela traz de uma vez.
 *
 * A lista nao tem paginacao na interface e o backend devolvia a tabela inteira —
 * o que funciona no primeiro ano e vira megabytes por abertura de tela depois.
 * O teto pega as mais recentes, que e o que a tela mostra no topo; quando a
 * paginacao existir na interface, este numero vira o tamanho da pagina.
 */
export const TETO_DA_LISTA = 300

export async function listarDespesas(): Promise<Despesa[]> {
  if (!moduloNoSupabase('despesas')) return api<Despesa[]>('/api/despesas')

  const linhas = ou(
    await supabase().from('despesas').select(COLUNAS)
      .order('data_lancamento', { ascending: false })
      .order('id', { ascending: false })
      .limit(TETO_DA_LISTA),
    'Não foi possível carregar as despesas.',
  ) as unknown as LinhaDespesa[]
  return linhas.map(paraModelo)
}

export async function criarDespesa(dados: DadosDespesa): Promise<Despesa> {
  // Toda escrita que mexe em dinheiro derruba o cache do dashboard: servir por
  // ate um minuto um total que a propria pessoa acabou de alterar e pior do que
  // esperar a consulta.
  invalidarCacheFinanceiro()
  if (!moduloNoSupabase('despesas')) {
    return api<Despesa>('/api/despesas', { method: 'POST', body: JSON.stringify(dados) })
  }

  // Toda despesa nasce pendente e nao aprovada, qualquer que seja a situacao
  // escolhida no formulario. Nao e limitacao tecnica: "paga sem ter sido
  // aprovada" e o estado que o fluxo de aprovacao existe para impedir, e a
  // propria tela ja avisa "Aprove para inclui-la nos totais". Para registrar
  // algo ja pago, o caminho e lancar, outra pessoa aprovar e entao pagar.
  const linha = ou(
    await supabase().from('despesas').insert({
      descricao: dados.descricao,
      categoria_id: dados.categoriaId,
      valor: dados.valor,
      data_lancamento: dados.data,
      vencimento: dados.vencimento || null,
      forma_pagamento: dados.formaPagamento || null,
      veiculo_id: dados.veiculoId || null,
      motorista_id: dados.motoristaId || null,
      protocolo: dados.protocolo || null,
      observacoes: dados.observacoes || null,
      status: 'PENDENTE',
      aprovada: false,
      criado_por: await usuarioAtualId(),
    }).select(COLUNAS).single(),
    'Não foi possível registrar a despesa.',
  ) as unknown as LinhaDespesa
  return paraModelo(linha)
}

export async function aprovarDespesa(id: number): Promise<void> {
  invalidarCacheFinanceiro()
  if (!moduloNoSupabase('despesas')) {
    await api(`/api/despesas/${id}/aprovar`, { method: 'PATCH' })
    return
  }
  ou(
    await supabase().rpc('aprovar_despesa', { p_despesa_id: id }),
    'Não foi possível aprovar a despesa.',
  )
}

export async function pagarDespesa(
  id: number, dataPagamento: string, formaPagamento?: string | null,
): Promise<void> {
  invalidarCacheFinanceiro()
  if (!moduloNoSupabase('despesas')) {
    await api(`/api/despesas/${id}/pagar`, {
      method: 'PATCH', body: JSON.stringify({ dataPagamento, formaPagamento }),
    })
    return
  }
  ou(
    await supabase().rpc('pagar_despesa', {
      p_despesa_id: id,
      p_data_pagamento: dataPagamento,
      p_forma_pagamento: formaPagamento ?? null,
    }),
    'Não foi possível registrar o pagamento.',
  )
}
