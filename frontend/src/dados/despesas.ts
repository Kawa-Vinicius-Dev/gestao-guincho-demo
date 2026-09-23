import { ApiError, api } from '../api/http'
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
  'forma_pagamento', 'status', 'aprovada', 'protocolo', 'observacoes', 'desconta_comissao',
  'categoria_id', 'veiculo_id', 'motorista_id', 'despesa_recorrente_id', 'juros_de_despesa_id',
  'comprovante_arquivo', 'comprovante_nome_original', 'comprovante_tamanho_bytes',
  'categorias(nome)', 'veiculos(identificacao)', 'motoristas(nome)', 'perfis!despesas_criado_por_fkey(nome)',
].join(',')

type Vinculo<T> = T | T[] | null
type LinhaDespesa = {
  despesa_recorrente_id?: number | null
  juros_de_despesa_id?: number | null
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
  desconta_comissao?: boolean
  categoria_id?: number | null
  veiculo_id?: number | null
  motorista_id?: number | null
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
    categoriaId: linha.categoria_id ?? undefined,
    veiculoId: linha.veiculo_id ?? undefined,
    motoristaId: linha.motorista_id ?? undefined,
    valor: Number(linha.valor),
    data: linha.data_lancamento,
    vencimento: linha.vencimento ?? undefined,
    dataPagamento: linha.data_pagamento ?? undefined,
    formaPagamento: linha.forma_pagamento ?? undefined,
    veiculo: um(linha.veiculos)?.identificacao,
    motorista: um(linha.motoristas)?.nome,
    protocolo: linha.protocolo ?? undefined,
    despesaRecorrenteId: linha.despesa_recorrente_id ?? undefined,
    jurosDeDespesaId: linha.juros_de_despesa_id ?? undefined,
    descontaComissao: Boolean(linha.desconta_comissao),
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
  /**
   * Quem lanca pela tela nao marca alimentacao: o cartao da equipe e vinculado a
   * viatura, entao a refeicao comprada nele e custo daquela viatura, como o
   * diesel. ALIMENTACAO_FUNCIONARIO fica para `registrar_alimentacao` — o
   * socorrista lancando a refeicao que ele mesmo pagou, do bolso dele, que e a
   * unica que desconta da comissao.
   */
  natureza?: 'GERAL' | 'ALIMENTACAO_FUNCIONARIO'
  /** Gasto pessoal do socorrista que sai da comissao dele. So vale com socorrista. */
  descontaComissao?: boolean
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

/** Com periodo, traz as despesas dele: um ano de comissoes passa do teto da lista. */
export async function listarDespesas(periodo?: { inicio: string; fim: string }): Promise<Despesa[]> {
  if (!moduloNoSupabase('despesas')) return api<Despesa[]>('/api/despesas')

  let consulta = supabase().from('despesas').select(COLUNAS)
  if (periodo) consulta = consulta.gte('data_lancamento', periodo.inicio).lte('data_lancamento', periodo.fim)
  const linhas = ou(
    await consulta
      .order('data_lancamento', { ascending: false })
      .order('id', { ascending: false })
      .limit(TETO_DA_LISTA),
    'Não foi possível carregar as despesas.',
  ) as unknown as LinhaDespesa[]
  return linhas.map(paraModelo)
}

/**
 * Lanca a despesa.
 *
 * `jaAprovada` diz que quem esta lancando responde pelo caixa, e por isso a
 * despesa nao precisa de um segundo par de olhos: ela nasce aprovada, e paga se
 * o formulario disse que ja foi paga. Antes, o administrador preenchia o
 * formulario, escolhia "Paga" e ainda clicava em Aprovar e em Registrar
 * pagamento para o valor chegar na Visao geral — tres acoes para registrar um
 * almoco que ele mesmo pagou, com o campo "Situacao" do formulario nao valendo
 * nada.
 *
 * A bandeira nao decide sozinha: ela escolhe o caminho, e o caminho aprovado e
 * uma RPC que confere quem esta chamando. Cliente que mentir na bandeira nao
 * ganha nada — a policy de insercao direta continua exigindo `not aprovada`, e
 * so a RPC, que roda `exigir_administrador()`, escreve uma despesa ja aprovada.
 */
export async function criarDespesa(dados: DadosDespesa, jaAprovada = false): Promise<Despesa> {
  // Toda escrita que mexe em dinheiro derruba o cache do dashboard: servir por
  // ate um minuto um total que a propria pessoa acabou de alterar e pior do que
  // esperar a consulta.
  invalidarCacheFinanceiro()
  if (!moduloNoSupabase('despesas')) {
    return api<Despesa>('/api/despesas', { method: 'POST', body: JSON.stringify(dados) })
  }

  if (jaAprovada) {
    const aprovada = await lancarJaAprovada(dados)
    if (aprovada) return aprovada
    // A funcao nao existe neste banco: cai no caminho de sempre logo abaixo, e
    // a tela avisa que a despesa ficou pendente. Ver `lancarJaAprovada`.
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
      natureza: dados.natureza ?? 'GERAL',
      desconta_comissao: Boolean(dados.descontaComissao && dados.motoristaId),
      status: 'PENDENTE',
      aprovada: false,
      criado_por: await usuarioAtualId(),
    }).select(COLUNAS).single(),
    'Não foi possível registrar a despesa.',
  ) as unknown as LinhaDespesa
  return paraModelo(linha)
}

/**
 * Marca ou desmarca o gasto como pessoal do socorrista, que sai da comissao dele.
 *
 * Existe para a despesa ja lancada: a marca so aparecia no formulario de uma
 * despesa nova, e o gasto lancado antes ficava sem como descontar. O banco
 * recalcula a comissao sozinho quando a marca muda.
 */
export async function marcarDescontoComissao(id: number, desconta: boolean): Promise<void> {
  invalidarCacheFinanceiro()
  if (!moduloNoSupabase('despesas')) {
    throw new ApiError('Marcar desconto só existe na versão que fala direto com o Supabase.', 501)
  }
  const alteradas = ou(
    await supabase().from('despesas').update({ desconta_comissao: desconta }).eq('id', id).select('id'),
    'Não foi possível alterar o desconto da comissão.',
  ) as { id: number }[]
  if (!alteradas.length) {
    throw new ApiError('Você não tem permissão para alterar esta despesa.', 403)
  }
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

/**
 * Exclusao de despesa.
 *
 * Existe porque errar o lancamento e comum — categoria trocada, valor com um
 * zero a mais, despesa repetida pela segunda leva de fixas do mes — e ate agora
 * o unico jeito de desfazer era mexer no banco pela mao.
 *
 * Dois cuidados que a chamada crua nao tem:
 *
 * O PostgREST nao reclama quando o DELETE nao casa com nenhuma linha: a policy
 * filtra em silencio e a resposta volta vazia e feliz. Sem o `select`, quem nao
 * e administrador veria "despesa excluida" e a linha continuaria na tela na
 * proxima leitura. Com ele, zero linha e erro.
 *
 * E o comprovante: o arquivo vive no Storage, fora do Postgres, entao apagar a
 * linha deixaria o objeto orfao no bucket, pago e invisivel. Vai depois da
 * linha, e nao antes, porque o caminho contrario — arquivo apagado, exclusao
 * recusada — deixaria uma despesa apontando para um arquivo que nao existe.
 */
/**
 * Corrige uma despesa ja lancada. So o administrador: a policy de update exige.
 * A comissao automatica nao passa por aqui — ela se recalcula a partir da OP.
 * Despesa paga acompanha a data: o dashboard conta pela data do pagamento.
 */
export async function atualizarDespesa(despesa: Despesa, dados: DadosDespesa): Promise<void> {
  invalidarCacheFinanceiro()
  const atualizadas = ou(
    await supabase().from('despesas').update({
      descricao: dados.descricao,
      categoria_id: dados.categoriaId,
      valor: dados.valor,
      data_lancamento: dados.data,
      ...(despesa.status === 'PAGO' ? { data_pagamento: dados.data } : {}),
      forma_pagamento: dados.formaPagamento ?? null,
      veiculo_id: dados.veiculoId ?? null,
      motorista_id: dados.motoristaId ?? null,
      protocolo: dados.protocolo ?? null,
      observacoes: dados.observacoes ?? null,
      desconta_comissao: Boolean(dados.motoristaId && dados.descontaComissao),
    }).eq('id', despesa.id).select('id'),
    'Não foi possível salvar a despesa.',
  ) as { id: number }[]
  if (!atualizadas.length) {
    throw new ApiError('Você não tem permissão para editar despesas.', 403)
  }
}

export async function excluirDespesa(despesa: Despesa): Promise<void> {
  invalidarCacheFinanceiro()
  if (!moduloNoSupabase('despesas')) {
    throw new ApiError('A exclusão de despesas só existe na versão que fala direto com o Supabase.', 501)
  }

  const apagadas = ou(
    await supabase().from('despesas').delete().eq('id', despesa.id).select('id'),
    'Não foi possível excluir a despesa.',
  ) as { id: number }[]
  if (!apagadas.length) {
    throw new ApiError('Você não tem permissão para excluir despesas.', 403)
  }

  if (despesa.comprovante) {
    await supabase().storage.from('comprovantes').remove([despesa.comprovante]).catch(() => {})
  }
}

/**
 * Erro do PostgREST para "esta funcao nao existe no banco".
 *
 * Acontece quando o site sobe com uma migracao ainda nao aplicada — que e
 * exatamente o intervalo entre publicar o frontend e rodar o SQL. Antes, esse
 * intervalo derrubava o lancamento inteiro e jogava a assinatura da funcao em
 * ingles na cara de quem so queria registrar um almoco.
 */
const FUNCAO_AUSENTE = 'PGRST202'

/** Lanca a despesa ja aprovada, ou devolve null se o banco ainda nao tem a RPC. */
async function lancarJaAprovada(dados: DadosDespesa): Promise<Despesa | null> {
  const resposta = await supabase().rpc('registrar_despesa_aprovada', {
    p_descricao: dados.descricao,
    p_categoria_id: dados.categoriaId,
    p_valor: dados.valor,
    p_data: dados.data,
    p_vencimento: dados.vencimento || null,
    p_forma_pagamento: dados.formaPagamento || null,
    p_veiculo_id: dados.veiculoId || null,
    p_motorista_id: dados.motoristaId || null,
    p_protocolo: dados.protocolo || null,
    p_observacoes: dados.observacoes || null,
    p_natureza: dados.natureza ?? 'GERAL',
    p_paga: dados.status === 'PAGO',
    p_data_pagamento: dados.dataPagamento || null,
    p_desconta_comissao: Boolean(dados.descontaComissao && dados.motoristaId),
  })
  // So a ausencia da funcao volta para o caminho antigo. Recusa de permissao,
  // valor invalido e qualquer outro erro sobem como erro: sao respostas de
  // verdade, e engoli-las esconderia o motivo.
  if (resposta.error?.code === FUNCAO_AUSENTE) return null
  const linha = ou(resposta, 'Não foi possível registrar a despesa.') as { id: number }

  // A RPC devolve a linha crua da tabela, sem os nomes de categoria, viatura e
  // socorrista que a tela mostra. Em vez de montar meia despesa aqui, le a
  // linha pronta pelo mesmo caminho da listagem.
  const completa = ou(
    await supabase().from('despesas').select(COLUNAS).eq('id', linha.id).single(),
    'Não foi possível registrar a despesa.',
  ) as unknown as LinhaDespesa
  return paraModelo(completa)
}

/**
 * Quantas despesas iguais (mesma descricao, valor e data) ja estao lancadas, sem
 * contar as rejeitadas. O seguro de 10/09/2026 entrou duas vezes com menos de 1
 * segundo entre uma e outra; antes de gravar, a tela pergunta. Nao bloqueia: dois
 * caminhoes podem ter o mesmo seguro no mesmo dia.
 */
export async function despesasIguais(descricao: string, valor: number, data: string): Promise<number> {
  if (!moduloNoSupabase('despesas')) return 0
  const { count } = await supabase().from('despesas').select('id', { count: 'exact', head: true })
    .eq('descricao', descricao).eq('valor', valor).eq('data_lancamento', data).neq('status', 'REJEITADO')
  return count ?? 0
}

/**
 * Quanto foi pago de verdade numa despesa fixa ja lancada. Pago acima do valor
 * da fixa (200 pagos como 210), a fixa fica com 200 e os 10 entram como despesa
 * na categoria Juros; igual ou abaixo, nao ha juros. Devolve o juros que ficou.
 * So para despesa fixa: o banco recusa as outras.
 */
export async function valorPagoDaFixa(id: number, valorPago: number): Promise<number> {
  invalidarCacheFinanceiro()
  const juros = ou(
    await supabase().rpc('despesa_fixa_valor_pago', { p_despesa_id: id, p_valor: valorPago }),
    'Não foi possível registrar o juros.',
  )
  return Number(juros ?? 0)
}
