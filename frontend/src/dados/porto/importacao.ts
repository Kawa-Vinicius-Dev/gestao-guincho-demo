import type {
  AnaliseOrdemPagamentoPorto, ConfirmacaoPorto, LinhaPreviaPorto,
  PreviaPorto, ReassociacaoOsPorto, ResumoPreviaPorto,
} from '../../types/modelos'
import { ApiError } from '../../api/http'
import { ou, supabase } from '../cliente'
import { invalidarCacheFinanceiro } from '../dashboard'
import type { Previa, TipoRelatorio } from './csv'
import { lerCsvPorto, lerServicosGeraisPorto } from './csv'
import { lerPainelDiarioPorto } from './painelDiario'
import type { Linha } from './linha'

/**
 * Importacao de relatorios da Porto.
 *
 * A divisao de trabalho: o navegador le o arquivo e classifica cada linha
 * contra o que ja existe; o banco aplica tudo numa transacao so
 * (`porto_confirmar_importacao`). Ler texto nao precisa de servidor; gravar OS,
 * OP e receita junto precisa ser tudo ou nada.
 *
 * A classificacao usa tres consultas com `in`, nunca uma por linha: um arquivo
 * da Porto traz centenas de servicos.
 */

/** Relatorio que traz dinheiro precisa de OP e de ciclo antes de confirmar. */
const PAGA: TipoRelatorio[] = ['OS_VINCULADAS', 'SERVICOS_GERAIS']

/**
 * Chave de comparacao da OS: o miolo do numero mais o ano.
 *
 * A Porto escreve a mesma OS de dois jeitos — `5673329/26` no painel diario e
 * `01/3195073-26` no relatorio da OP, onde o prefixo de um ou dois digitos so
 * aparece neste ultimo. Comparar os digitos crus fazia `0131950732` e
 * `319507326` parecerem servicos diferentes, e o mesmo atendimento entrava duas
 * vezes. Precisa continuar igual a `numero_os_normalizado` do banco: e a mesma
 * chave dos dois lados.
 */
const NUMERO_OS = /^(?:\d{1,2}[/-])?(\d{4,})[-/](\d{2})$/

const normalizarNumero = (valor: string) => {
  const limpo = valor.trim()
  const m = limpo.match(NUMERO_OS)
  return m ? `${m[1]}${m[2]}` : limpo.replace(/[^0-9]/g, '')
}

function numeroDaLinha(linha: Linha) {
  return linha.dados.numero_os?.trim() || linha.dados.numero_op?.trim() || ''
}

function valorDaLinha(linha: Linha) {
  const bruto = linha.dados.valor_total
  if (!bruto) return 0
  let limpo = bruto.replace('R$', '').replace(/\s/g, '')
  if (limpo.includes(',') && limpo.includes('.')) limpo = limpo.replace(/\./g, '').replace(',', '.')
  else if (limpo.includes(',')) limpo = limpo.replace(',', '.')
  const numero = Number(limpo)
  return Number.isFinite(numero) ? numero : 0
}

async function hashDoArquivo(conteudo: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(conteudo))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Marca cada linha com o que vai acontecer com ela, consultando o banco.
 *
 * IGNORAR  o registro ja foi absorvido antes, ou o numero se repete no arquivo
 * ATUALIZAR o numero ja existe e sera sobrescrito
 * IMPORTAR  registro novo
 * ERRO      a leitura ja tinha reprovado a linha; nao mexe
 *
 * Quando ha OP escolhida, tambem monta a analise: quanto o arquivo soma, quanto
 * a OP ja valia e quais OSs mudariam de OP (reassociacao).
 */
interface OsExistente {
  numero_normalizado: string
  ordem_pagamento_id: number | null
  valor_total: number
  // O PostgREST devolve o vinculo para-um como objeto, mas sem tipos gerados
  // ele chega tipado como lista; os dois formatos sao aceitos aqui.
  ordens_pagamento_porto: { numero: string } | { numero: string }[] | null
}

async function hashesJaImportados(tipo: TipoRelatorio, hashes: string[]) {
  if (!hashes.length) return new Set<string>()
  const linhas = ou(
    await supabase().from('registros_importados_porto').select('hash_registro')
      .eq('tipo_relatorio', tipo).in('hash_registro', hashes),
    'Não foi possível verificar os registros já importados.',
  ) as { hash_registro: string }[]
  return new Set(linhas.map(l => l.hash_registro))
}

/** Numeros que ja existem no banco, e — para OS — a OP a que pertencem hoje. */
async function registrosExistentes(tipo: TipoRelatorio, numeros: string[]) {
  const conhecidos = new Set<string>()
  const porNumero = new Map<string, OsExistente>()
  if (!numeros.length) return { conhecidos, porNumero }

  if (tipo === 'PREVISAO_RECEBER') {
    const ops = ou(
      await supabase().from('ordens_pagamento_porto').select('numero').in('numero', numeros),
      'Não foi possível verificar as ordens de pagamento existentes.',
    ) as { numero: string }[]
    for (const op of ops) conhecidos.add(normalizarNumero(op.numero))
    return { conhecidos, porNumero }
  }

  const oss = ou(
    await supabase().from('ordens_servico_porto')
      .select('numero_normalizado,ordem_pagamento_id,valor_total,ordens_pagamento_porto(numero)')
      .in('numero_normalizado', numeros.map(normalizarNumero)),
    'Não foi possível verificar as ordens de serviço existentes.',
  ) as OsExistente[]
  for (const os of oss) {
    conhecidos.add(os.numero_normalizado)
    porNumero.set(os.numero_normalizado, os)
  }
  return { conhecidos, porNumero }
}

async function ordemDePagamento(numeroOp?: string) {
  if (!numeroOp?.trim()) return null
  return ou(
    await supabase().from('ordens_pagamento_porto').select('id,numero,valor_total')
      .ilike('numero', numeroOp.trim()).maybeSingle(),
    'Não foi possível consultar a ordem de pagamento.',
  ) as { id: number; numero: string; valor_total: number } | null
}

async function classificar(
  tipo: TipoRelatorio, linhas: Linha[], numeroOp?: string,
): Promise<{ linhas: LinhaPreviaPorto[]; analise?: AnaliseOrdemPagamentoPorto }> {
  const validas = linhas.filter(l => l.acao !== 'ERRO')
  const hashes = validas.map(l => l.hashRegistro)
  const numeros = validas.map(numeroDaLinha).filter(Boolean)

  const [absorvidos, { conhecidos, porNumero }, op] = await Promise.all([
    hashesJaImportados(tipo, hashes),
    registrosExistentes(tipo, numeros),
    ordemDePagamento(numeroOp),
  ])

  const reassociacoes: ReassociacaoOsPorto[] = []
  const vistos = new Set<string>()
  let somaArquivo = 0

  const classificadas: LinhaPreviaPorto[] = linhas.map(linha => {
    if (linha.acao === 'ERRO') return linha as LinhaPreviaPorto
    const numero = numeroDaLinha(linha)
    const chave = normalizarNumero(numero)

    if (!numero || vistos.has(chave)) {
      return { ...linha, acao: 'IGNORAR', mensagem: 'Número repetido neste arquivo.' }
    }
    vistos.add(chave)
    somaArquivo += valorDaLinha(linha)

    if (absorvidos.has(linha.hashRegistro)) {
      return { ...linha, acao: 'IGNORAR', mensagem: 'Registro já importado anteriormente.' }
    }
    if (!conhecidos.has(chave)) return { ...linha, acao: 'IMPORTAR' }

    // A OS ja existe. Se pertence a outra OP, mudar de OP e uma decisao do
    // administrador, nao um efeito colateral da importacao.
    const anterior = porNumero.get(chave)
    const vinculo = anterior?.ordens_pagamento_porto
    const opAnterior = (Array.isArray(vinculo) ? vinculo[0] : vinculo)?.numero
    if (op && opAnterior && opAnterior.toUpperCase() !== op.numero.toUpperCase()) {
      reassociacoes.push({
        numeroOs: numero, opAtual: opAnterior, novaOp: op.numero, valor: valorDaLinha(linha),
      })
      return {
        ...linha, acao: 'DIVERGENCIA',
        mensagem: `Hoje pertence à OP ${opAnterior} e passaria para a OP ${op.numero}.`,
      }
    }
    return { ...linha, acao: 'ATUALIZAR' }
  })

  const analise: AnaliseOrdemPagamentoPorto | undefined = numeroOp
    ? {
        numero: numeroOp.trim(),
        existente: Boolean(op),
        valorAtual: op?.valor_total,
        somaArquivo,
        diferenca: op ? Number((op.valor_total - somaArquivo).toFixed(2)) : undefined,
        quantidadeReassociacoes: reassociacoes.length,
        valorReassociacoes: reassociacoes.reduce((total, r) => total + r.valor, 0),
        reassociacoes,
      }
    : undefined

  return { linhas: classificadas, analise }
}

function resumir(tipo: TipoRelatorio, linhas: LinhaPreviaPorto[]): ResumoPreviaPorto {
  const conta = (acao: string) => linhas.filter(l => l.acao === acao).length
  const numeros = new Set(linhas.map(l => l.dados.numero_op).filter(Boolean))
  return {
    linhasAnalisadas: linhas.length,
    opsUnicas: tipo === 'PREVISAO_RECEBER' ? numeros.size : 0,
    registrosNovos: conta('IMPORTAR'),
    registrosExistentes: conta('ATUALIZAR') + conta('DIVERGENCIA'),
    registrosAtualizados: conta('ATUALIZAR'),
    duplicidades: conta('IGNORAR'),
    erros: conta('ERRO'),
    valorTotal: linhas
      .filter(l => l.acao !== 'ERRO' && l.acao !== 'IGNORAR')
      .reduce((total, l) => total + valorDaLinha(l as Linha), 0),
  }
}

async function montarPrevia(
  nomeArquivo: string, conteudo: string, lida: Previa,
): Promise<PreviaPorto> {
  const registro = ou(
    await supabase().rpc('porto_registrar_importacao', {
      p_nome_arquivo: nomeArquivo,
      p_hash: await hashDoArquivo(conteudo),
      p_tipo: lida.tipo,
      p_total_registros: lida.linhas.length,
    }),
    'Não foi possível registrar a importação.',
  ) as { id: number; status: string }

  const { linhas } = await classificar(lida.tipo, lida.linhas)
  return {
    id: registro.id,
    nomeArquivo,
    tipo: lida.tipo,
    status: registro.status,
    totalLinhas: linhas.length,
    linhas,
    erros: lida.erros,
    requerOrdemPagamento: PAGA.includes(lida.tipo),
    resumo: resumir(lida.tipo, linhas),
  }
}

export async function criarPreviaPorto(arquivo: File): Promise<PreviaPorto> {
  const conteudo = await arquivo.text()
  return montarPrevia(arquivo.name, conteudo, await lerCsvPorto(conteudo))
}

/**
 * Colagem da Porto, seja ela qual for.
 *
 * Duas coisas diferentes chegam por aqui: a lista de servicos, que tem os
 * cabecalhos da OS vinculada mas nao traz OP, e o painel do dia, que nao e CSV
 * e nao tem cabecalho nenhum. Quem cola nao deveria precisar saber qual e —
 * entao tentamos os leitores em ordem, do mais estruturado ao mais solto, e o
 * primeiro que reconhecer o conteudo manda.
 */
export async function criarPreviaConteudoPorto(conteudo: string): Promise<PreviaPorto> {
  let lida: Previa
  try {
    lida = await lerCsvPorto(conteudo)
  } catch (erro) {
    lida = await lerServicosGeraisPorto(conteudo)
      .catch(() => lerPainelDiarioPorto(conteudo))
      .catch(() => { throw erro })
  }
  return montarPrevia('Conteúdo colado', conteudo, lida)
}

/** Reavalia a previa agora que o administrador escolheu a OP e o ciclo. */
export async function avaliarImportacaoPorto(
  previa: PreviaPorto, numeroOrdemPagamento: string,
): Promise<PreviaPorto> {
  const { linhas, analise } = await classificar(
    previa.tipo as TipoRelatorio, previa.linhas as Linha[], numeroOrdemPagamento)
  return {
    ...previa, linhas, analiseOrdemPagamento: analise,
    totalLinhas: linhas.length, resumo: resumir(previa.tipo as TipoRelatorio, linhas),
  }
}

export interface ConfirmacaoImportacao {
  numeroOrdemPagamento?: string
  calendarioPagamentoId?: number
  confirmarDivergencias?: boolean
  /** Mover uma OS de uma OP para outra e decisao do administrador, nao efeito
   *  colateral da importacao: sem este aval a confirmacao para. */
  confirmarReassociacoes?: boolean
  motivoDivergencia?: string
  justificativaDivergencia?: string
}

export async function confirmarImportacaoPorto(
  previa: PreviaPorto, dados: ConfirmacaoImportacao = {},
): Promise<ConfirmacaoPorto> {
  const reassociacoes = previa.analiseOrdemPagamento?.quantidadeReassociacoes ?? 0
  if (reassociacoes && !dados.confirmarReassociacoes) {
    throw new ApiError(
      `${reassociacoes} ordem(ns) de serviço mudariam de OP. Confirme a reassociação antes de importar.`,
      422)
  }

  // Linha reprovada na leitura ou ja absorvida nao vai para o banco.
  const aplicaveis = previa.linhas
    .filter(l => l.acao !== 'ERRO' && l.acao !== 'IGNORAR')
    .map(l => ({ ...l.dados, hash_registro: l.hashRegistro }))

  const resposta = ou(
    await supabase().rpc('porto_confirmar_importacao', {
      p_importacao_id: previa.id,
      p_linhas: aplicaveis,
      p_numero_op: dados.numeroOrdemPagamento ?? null,
      p_calendario_id: dados.calendarioPagamentoId ?? null,
      p_motivo_divergencia: dados.motivoDivergencia ?? null,
      p_justificativa: dados.justificativaDivergencia ?? null,
      p_confirmar_divergencias: dados.confirmarDivergencias ?? false,
    }),
    'Não foi possível confirmar a importação.',
  ) as {
    tipo: string; importados: number; ignorados: number; novos: number
    atualizados: number; receitasCriadas: number; valorTotal: number
    periodo?: string; dataPagamento?: string
    osSemSocorrista: { id: number; numero: string }[]
  }

  // A importacao cria receita: o dashboard em cache ficou velho.
  invalidarCacheFinanceiro()

  return {
    importacaoId: previa.id,
    tipo: resposta.tipo as ConfirmacaoPorto['tipo'],
    importados: resposta.importados,
    ignorados: resposta.ignorados,
    novos: resposta.novos,
    atualizados: resposta.atualizados,
    receitasCriadas: resposta.receitasCriadas,
    // O banco grava conta e receita no mesmo passo, entao nao ha um "atualizadas"
    // separado para reportar; o total criado ja cobre o que mudou.
    receitasAtualizadas: 0,
    valorTotalRecebido: Number(resposta.valorTotal ?? 0),
    quinzena: resposta.periodo,
    dataPagamento: resposta.dataPagamento,
    erros: [],
    osSemSocorrista: (resposta.osSemSocorrista ?? []).map(os => os.numero),
  }
}

export async function cancelarImportacaoPorto(id: number): Promise<void> {
  ou(
    await supabase().rpc('porto_cancelar_importacao', { p_id: id }),
    'Não foi possível cancelar a importação.',
  )
}
