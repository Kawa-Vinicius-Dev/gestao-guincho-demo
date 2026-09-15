import { ApiError, api } from '../api/http'
import type {
  CalendarioPorto, ConfirmacaoPorto, DashboardPorto, DetalheOpPorto, JustificativaPorto,
  OrdemPagamentoPorto, OrdemServicoPorto, PendenciaPorto, PreviaPorto, ResumoOpsPorto,
} from '../types/modelos'
import * as importacao from './porto/importacao'
import * as relatoriosPorto from './porto/relatorios'
import { ou, supabase } from './cliente'
import { invalidarCacheFinanceiro } from './dashboard'
import { moduloNoSupabase } from './modo'

/**
 * Modulo Porto: ordens de pagamento, ordens de servico, pendencias e calendario.
 *
 * As listagens sao consulta direta — filtro e ordenacao, sem regra. A
 * conciliacao de cada OP vem da view `porto_ops_conciliadas`, que deriva o
 * status comparando o valor da OP com a soma das OSs. Resumo, dashboard e
 * detalhe sao RPC: agregam, e agregacao e trabalho do banco.
 */

const consulta = (params?: URLSearchParams) => (params?.toString() ? `?${params}` : '')

const COLUNAS_OP = [
  'id', 'numero', 'valor_total', 'nome_codigo', 'data_pagamento_programada',
  'valor_recebido', 'data_recebimento', 'situacao_financeira', 'status_porto',
  'observacao', 'calendario_pagamento_id', 'quantidade_ordens_servico',
  'valor_ordens_servico', 'divergencia', 'status_conciliacao', 'periodo_financeiro',
].join(',')

type LinhaOp = Record<string, unknown>

function opParaModelo(l: LinhaOp): OrdemPagamentoPorto {
  return {
    id: l.id as number,
    numero: l.numero as string,
    valorTotal: Number(l.valor_total),
    nomeCodigo: (l.nome_codigo as string) ?? undefined,
    dataPagamentoProgramada: (l.data_pagamento_programada as string) ?? undefined,
    valorRecebido: l.valor_recebido == null ? undefined : Number(l.valor_recebido),
    dataRecebimento: (l.data_recebimento as string) ?? undefined,
    situacao: l.situacao_financeira as OrdemPagamentoPorto['situacao'],
    quantidadeOrdensServico: Number(l.quantidade_ordens_servico ?? 0),
    valorOrdensServico: Number(l.valor_ordens_servico ?? 0),
    divergencia: Number(l.divergencia ?? 0),
    statusConciliacao: l.status_conciliacao as OrdemPagamentoPorto['statusConciliacao'],
    statusPorto: (l.status_porto as string) ?? undefined,
    observacao: (l.observacao as string) ?? undefined,
    calendarioPagamentoId: (l.calendario_pagamento_id as number) ?? undefined,
    periodoFinanceiro: (l.periodo_financeiro as string) ?? undefined,
  }
}

const COLUNAS_OS = [
  'id', 'numero', 'valor_total', 'especialidade', 'sigla_viatura', 'socorrista',
  'qra', 'data_atendimento', 'valor_km_excedente', 'km_morto_estimado',
  'status_operacional', 'status_financeiro', 'data_devolucao',
  'data_finalizacao_devolucao', 'prestador', 'seguradora', 'cliente', 'placa',
  'data_hora_atendimento', 'data_prevista_original', 'data_efetiva_pagamento',
  'ciclos_atraso', 'motorista_id', 'ordem_pagamento_id',
  'motoristas(nome)', 'ordens_pagamento_porto(numero)',
].join(',')

type Vinculo<T> = T | T[] | null
const um = <T,>(v: Vinculo<T>) => (!v ? undefined : Array.isArray(v) ? v[0] : v)

function osParaModelo(l: Record<string, unknown>): OrdemServicoPorto {
  return {
    id: l.id as number,
    ordemPagamentoId: (l.ordem_pagamento_id as number) ?? undefined,
    ordemPagamento: um(l.ordens_pagamento_porto as Vinculo<{ numero: string }>)?.numero,
    numero: l.numero as string,
    valorTotal: Number(l.valor_total),
    especialidade: (l.especialidade as string) ?? undefined,
    viatura: (l.sigla_viatura as string) ?? undefined,
    socorrista: (l.socorrista as string) ?? undefined,
    qra: (l.qra as string) ?? undefined,
    dataAtendimento: (l.data_atendimento as string) ?? undefined,
    valorKmExcedente: l.valor_km_excedente == null ? undefined : Number(l.valor_km_excedente),
    kmMortoEstimado: l.km_morto_estimado == null ? undefined : Number(l.km_morto_estimado),
    statusOperacional: l.status_operacional as OrdemServicoPorto['statusOperacional'],
    statusFinanceiro: l.status_financeiro as OrdemServicoPorto['statusFinanceiro'],
    dataDevolucao: (l.data_devolucao as string) ?? undefined,
    dataFinalizacaoDevolucao: (l.data_finalizacao_devolucao as string) ?? undefined,
    prestador: (l.prestador as string) ?? undefined,
    seguradora: (l.seguradora as string) ?? undefined,
    cliente: (l.cliente as string) ?? undefined,
    placa: (l.placa as string) ?? undefined,
    dataHoraAtendimento: (l.data_hora_atendimento as string) ?? undefined,
    dataPrevistaOriginal: (l.data_prevista_original as string) ?? undefined,
    dataEfetivaPagamento: (l.data_efetiva_pagamento as string) ?? undefined,
    ciclosAtraso: Number(l.ciclos_atraso ?? 0),
    motoristaId: (l.motorista_id as number) ?? undefined,
    motorista: um(l.motoristas as Vinculo<{ nome: string }>)?.nome,
  }
}

// ---------------------------------------------------------------- ordens de pagamento

export async function listarOrdensPagamentoPorto(
  params?: URLSearchParams,
): Promise<OrdemPagamentoPorto[]> {
  if (!moduloNoSupabase('porto')) {
    return api<OrdemPagamentoPorto[]>(`/api/porto/ordens-pagamento${consulta(params)}`)
  }
  let q = supabase().from('porto_ops_conciliadas').select(COLUNAS_OP)
  const inicio = params?.get('dataInicio')
  const fim = params?.get('dataFim')
  if (inicio) q = q.gte('data_pagamento_programada', inicio)
  if (fim) q = q.lte('data_pagamento_programada', fim)
  const numero = params?.get('numeroOp')
  if (numero) q = q.ilike('numero', `%${numero}%`)

  const linhas = ou(
    await q.order('data_pagamento_programada', { ascending: false, nullsFirst: false })
      .order('numero').limit(500),
    'Não foi possível carregar as ordens de pagamento.',
  ) as unknown as LinhaOp[]
  return linhas.map(opParaModelo)
}

export async function resumirOrdensPagamentoPorto(
  params?: URLSearchParams,
): Promise<ResumoOpsPorto> {
  if (!moduloNoSupabase('porto')) {
    return api<ResumoOpsPorto>(`/api/porto/ordens-pagamento/resumo${consulta(params)}`)
  }
  return ou(
    await supabase().rpc('porto_resumo_ops', {
      p_inicio: params?.get('dataInicio') ?? null, p_fim: params?.get('dataFim') ?? null,
    }),
    'Não foi possível carregar o resumo das ordens.',
  ) as ResumoOpsPorto
}

export async function obterDashboardPorto(params?: URLSearchParams): Promise<DashboardPorto> {
  if (!moduloNoSupabase('porto')) {
    return api<DashboardPorto>(`/api/porto/dashboard${consulta(params)}`)
  }
  return ou(
    await supabase().rpc('porto_dashboard', {
      p_inicio: params?.get('dataInicio') ?? null, p_fim: params?.get('dataFim') ?? null,
    }),
    'Não foi possível carregar o painel da Porto.',
  ) as DashboardPorto
}

export async function detalharOrdemPagamentoPorto(id: number): Promise<DetalheOpPorto> {
  if (!moduloNoSupabase('porto')) return api<DetalheOpPorto>(`/api/porto/ordens-pagamento/${id}`)

  const bruto = ou(
    await supabase().rpc('porto_detalhe_op', { p_id: id }),
    'Não foi possível carregar a ordem de pagamento.',
  ) as { ordemPagamento: LinhaOp; ordensServico: Record<string, unknown>[]
         justificativas: JustificativaPorto[]; historico: DetalheOpPorto['historico'] }
  return {
    ordemPagamento: opParaModelo(bruto.ordemPagamento),
    ordensServico: bruto.ordensServico.map(osParaModelo),
    justificativas: bruto.justificativas,
    historico: bruto.historico,
  }
}

export async function criarOrdemPagamentoPorto(
  dados: Record<string, unknown>,
): Promise<OrdemPagamentoPorto> {
  invalidarCacheFinanceiro()
  if (!moduloNoSupabase('porto')) {
    return api<OrdemPagamentoPorto>('/api/porto/ordens-pagamento', {
      method: 'POST', body: JSON.stringify(dados),
    })
  }
  const nova = ou(
    await supabase().from('ordens_pagamento_porto').insert({
      numero: dados.numero,
      valor_total: dados.valorTotal ?? 0,
      nome_codigo: dados.nomeCodigo ?? null,
      data_pagamento_programada: dados.dataPagamentoProgramada ?? null,
      status_porto: dados.statusPorto ?? null,
      observacao: dados.observacao ?? null,
      calendario_pagamento_id: dados.calendarioPagamentoId ?? null,
    }).select('id').single(),
    'Não foi possível cadastrar a ordem de pagamento.',
  ) as { id: number }
  return (await detalharOrdemPagamentoPorto(nova.id)).ordemPagamento
}

export async function atualizarOrdemPagamentoPorto(
  id: number, dados: Record<string, unknown>,
): Promise<OrdemPagamentoPorto> {
  invalidarCacheFinanceiro()
  if (!moduloNoSupabase('porto')) {
    return api<OrdemPagamentoPorto>(`/api/porto/ordens-pagamento/${id}`, {
      method: 'PUT', body: JSON.stringify(dados),
    })
  }
  ou(
    await supabase().from('ordens_pagamento_porto').update({
      numero: dados.numero,
      valor_total: dados.valorTotal ?? 0,
      nome_codigo: dados.nomeCodigo ?? null,
      data_pagamento_programada: dados.dataPagamentoProgramada ?? null,
      status_porto: dados.statusPorto ?? null,
      observacao: dados.observacao ?? null,
      calendario_pagamento_id: dados.calendarioPagamentoId ?? null,
    }).eq('id', id).select('id').single(),
    'Não foi possível salvar a ordem de pagamento.',
  )
  return (await detalharOrdemPagamentoPorto(id)).ordemPagamento
}

export async function receberOrdemPagamentoPorto(
  id: number, valorRecebido: number, dataRecebimento: string, calendarioPagamentoId?: number,
): Promise<OrdemPagamentoPorto> {
  invalidarCacheFinanceiro()
  if (!moduloNoSupabase('porto')) {
    return api<OrdemPagamentoPorto>(`/api/porto/ordens-pagamento/${id}/receber`, {
      method: 'PATCH',
      body: JSON.stringify({ valorRecebido, dataRecebimento, calendarioPagamentoId: calendarioPagamentoId ?? null }),
    })
  }
  // RPC: grava o recebimento e marca as OSs da OP no mesmo commit.
  const detalhe = ou(
    await supabase().rpc('porto_receber_op', {
      p_id: id, p_valor_recebido: valorRecebido,
      p_data_recebimento: dataRecebimento, p_calendario_id: calendarioPagamentoId ?? null,
    }),
    'Não foi possível registrar o recebimento.',
  ) as { ordemPagamento: LinhaOp }
  return opParaModelo(detalhe.ordemPagamento)
}

export async function justificarOrdemPagamentoPorto(
  id: number, motivo: string, observacao: string,
): Promise<JustificativaPorto> {
  if (!moduloNoSupabase('porto')) {
    return api<JustificativaPorto>(`/api/porto/ordens-pagamento/${id}/justificativas`, {
      method: 'POST', body: JSON.stringify({ motivo, observacao }),
    })
  }
  const { usuarioAtualId } = await import('./cliente')
  const j = ou(
    await supabase().from('justificativas_porto').insert({
      ordem_pagamento_id: id, motivo, observacao, criado_por: await usuarioAtualId(),
    }).select('id,motivo,observacao,valor_diferenca,criado_em').single(),
    'Não foi possível registrar a justificativa.',
  ) as Record<string, unknown>
  return {
    id: j.id as number, motivo: j.motivo as string, observacao: j.observacao as string,
    valorDiferenca: j.valor_diferenca == null ? undefined : Number(j.valor_diferenca),
    usuario: '', criadoEm: j.criado_em as string,
  }
}

// ---------------------------------------------------------------- ordens de servico

export async function listarOrdensServicoPorto(
  params?: URLSearchParams,
): Promise<OrdemServicoPorto[]> {
  if (!moduloNoSupabase('porto')) {
    return api<OrdemServicoPorto[]>(`/api/porto/ordens-servico${consulta(params)}`)
  }
  let q = supabase().from('ordens_servico_porto').select(COLUNAS_OS)
  const inicio = params?.get('dataInicio')
  const fim = params?.get('dataFim')
  // O backend alterna entre a data do atendimento e a do pagamento conforme o
  // filtro; a tela manda qual usar.
  const campo = params?.get('porDataPagamento') === 'true'
    ? 'data_efetiva_pagamento' : 'data_atendimento'
  if (inicio) q = q.gte(campo, inicio)
  if (fim) q = q.lte(campo, fim)
  if (params?.get('semSocorrista') === 'true') q = q.is('motorista_id', null)
  if (params?.get('semQra') === 'true') q = q.is('qra', null)
  const numero = params?.get('numeroOs')
  if (numero) q = q.ilike('numero', `%${numero}%`)

  const linhas = ou(
    await q.order(campo, { ascending: false, nullsFirst: false }).order('numero').limit(1000),
    'Não foi possível carregar as ordens de serviço.',
  ) as unknown as Record<string, unknown>[]
  return linhas.map(osParaModelo)
}

export async function associarMotoristaPorto(
  ordemServicoId: number, motoristaId: number,
): Promise<OrdemServicoPorto> {
  invalidarCacheFinanceiro()
  if (!moduloNoSupabase('porto')) {
    return api<OrdemServicoPorto>(`/api/porto/ordens-servico/${ordemServicoId}/motorista`, {
      method: 'PATCH', body: JSON.stringify({ motoristaId }),
    })
  }
  // Vinculo feito a mao nao pode ser desfeito por importacao: a coluna registra
  // que foi manual, como o backend fazia.
  const linha = ou(
    await supabase().from('ordens_servico_porto')
      .update({ motorista_id: motoristaId, motorista_vinculo_manual: true })
      .eq('id', ordemServicoId).select(COLUNAS_OS).single(),
    'Não foi possível associar o socorrista.',
  ) as unknown as Record<string, unknown>
  return osParaModelo(linha)
}

/**
 * Valor de um servico que a Porto ainda nao precificou.
 *
 * O painel diario nao traz valor. Ate a OP chegar, quem opera sabe quanto o
 * servico vale e registra aqui — conta como producao pendente, nunca como
 * receita: o dinheiro so entra no caixa quando a Porto paga.
 */
export async function informarValorOrdemServicoPorto(
  ordemServicoId: number, valorTotal: number,
): Promise<OrdemServicoPorto> {
  invalidarCacheFinanceiro()
  if (!moduloNoSupabase('porto')) {
    return api<OrdemServicoPorto>(`/api/porto/ordens-servico/${ordemServicoId}/valor`, {
      method: 'PATCH', body: JSON.stringify({ valorTotal }),
    })
  }
  // A guarda de "servico ja pago" mora no banco: o filtro recusa a linha em vez
  // de confiar na tela para nao oferecer o campo.
  const linha = ou(
    await supabase().from('ordens_servico_porto')
      .update({ valor_total: valorTotal })
      .eq('id', ordemServicoId).neq('status_financeiro', 'RECEBIDO')
      .select(COLUNAS_OS).maybeSingle(),
    'Não foi possível informar o valor.',
  ) as unknown as Record<string, unknown> | null
  if (!linha) {
    throw new ApiError(
      'Este serviço já foi pago pela Porto: o valor vem da ordem de pagamento.', 400)
  }
  return osParaModelo(linha)
}

export interface PeriodoPadraoPorto { dataInicio: string; dataFim: string }

/**
 * O periodo que a tela de OS abre por padrao: o mes corrente quando ha servico
 * nele, senao o mes do servico mais recente — para nao abrir vazia.
 */
export async function periodoPadraoOrdensServicoPorto(): Promise<PeriodoPadraoPorto> {
  if (!moduloNoSupabase('porto')) {
    return api<PeriodoPadraoPorto>('/api/porto/ordens-servico/periodo-padrao')
  }
  const hoje = new Date()
  const mes = (d: Date) => ({
    dataInicio: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
    dataFim: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${
      String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, '0')}`,
  })
  const atual = mes(hoje)

  const noMes = ou(
    await supabase().from('ordens_servico_porto').select('id')
      .gte('data_atendimento', atual.dataInicio).lte('data_atendimento', atual.dataFim).limit(1),
    'Não foi possível descobrir o período padrão.',
  ) as { id: number }[]
  if (noMes.length) return atual

  const recente = ou(
    await supabase().from('ordens_servico_porto').select('data_atendimento')
      .not('data_atendimento', 'is', null)
      .order('data_atendimento', { ascending: false }).limit(1),
    'Não foi possível descobrir o período padrão.',
  ) as { data_atendimento: string }[]
  if (!recente.length) return atual
  return mes(new Date(`${recente[0].data_atendimento}T12:00:00`))
}

// ---------------------------------------------------------------- pendencias

export async function listarPendenciasPorto(): Promise<PendenciaPorto[]> {
  if (!moduloNoSupabase('porto')) return api<PendenciaPorto[]>('/api/porto/pendencias')

  const linhas = ou(
    await supabase().from('pendencias_porto')
      .select('id,tipo,status,valor,data_devolucao,motivo,observacao,responsavel,prazo,referencia_porto,ordem_servico_id,ordens_servico_porto(numero)')
      .eq('status', 'ABERTA').order('data_devolucao', { ascending: false }),
    'Não foi possível carregar as pendências.',
  ) as unknown as Record<string, unknown>[]
  return linhas.map(l => ({
    id: l.id as number,
    tipo: l.tipo as PendenciaPorto['tipo'],
    referenciaId: l.ordem_servico_id as number,
    referencia: um(l.ordens_servico_porto as Vinculo<{ numero: string }>)?.numero ?? '',
    valor: Number(l.valor ?? 0),
    data: (l.data_devolucao as string) ?? undefined,
    situacao: l.status as string,
    motivo: (l.motivo as string) ?? undefined,
    observacao: (l.observacao as string) ?? undefined,
    responsavel: (l.responsavel as string) ?? undefined,
    prazo: (l.prazo as string) ?? undefined,
    referenciaPorto: (l.referencia_porto as string) ?? undefined,
  }))
}

export async function criarPendenciaPorto(dados: Record<string, unknown>): Promise<PendenciaPorto> {
  if (!moduloNoSupabase('porto')) {
    return api<PendenciaPorto>('/api/porto/pendencias', { method: 'POST', body: JSON.stringify(dados) })
  }
  ou(
    await supabase().from('pendencias_porto').insert({
      ordem_servico_id: dados.referenciaId ?? dados.ordemServicoId,
      tipo: dados.tipo ?? 'SERVICO_PENDENTE',
      valor: dados.valor ?? 0,
      data_devolucao: dados.data ?? dados.dataDevolucao,
      motivo: dados.motivo ?? null,
      observacao: dados.observacao ?? null,
      responsavel: dados.responsavel ?? null,
      prazo: dados.prazo ?? null,
      referencia_porto: dados.referenciaPorto ?? null,
    }).select('id').single(),
    'Não foi possível registrar a pendência.',
  )
  return (await listarPendenciasPorto())[0]
}

export async function resolverPendenciaPorto(id: number): Promise<PendenciaPorto> {
  if (!moduloNoSupabase('porto')) {
    return api<PendenciaPorto>(`/api/porto/pendencias/${id}/resolver`, { method: 'PATCH' })
  }
  const { usuarioAtualId } = await import('./cliente')
  ou(
    await supabase().from('pendencias_porto')
      .update({ status: 'RESOLVIDA', resolvido_em: new Date().toISOString(), resolvido_por: await usuarioAtualId() })
      .eq('id', id).select('id').single(),
    'Não foi possível resolver a pendência.',
  )
  return { id, tipo: 'SERVICO_PENDENTE', referenciaId: 0, referencia: '', valor: 0, situacao: 'RESOLVIDA' }
}

// ---------------------------------------------------------------- calendario

const COLUNAS_CAL = 'id,data_pagamento,competencia_inicio,competencia_fim,descricao,ativo,estimado,criado_em,atualizado_em'

const calParaModelo = (l: Record<string, unknown>): CalendarioPorto => ({
  id: l.id as number,
  dataPagamento: l.data_pagamento as string,
  competenciaInicio: l.competencia_inicio as string,
  competenciaFim: l.competencia_fim as string,
  descricao: l.descricao as string,
  ativo: l.ativo as boolean,
  estimado: l.estimado as boolean,
  criadoEm: l.criado_em as string,
  atualizadoEm: l.atualizado_em as string,
})

export async function listarCalendarioPorto(): Promise<CalendarioPorto[]> {
  if (!moduloNoSupabase('porto')) return api<CalendarioPorto[]>('/api/porto/calendario')

  const linhas = ou(
    await supabase().from('calendario_pagamentos_porto').select(COLUNAS_CAL)
      .order('data_pagamento', { ascending: false }),
    'Não foi possível carregar o calendário.',
  ) as Record<string, unknown>[]
  return linhas.map(calParaModelo)
}

type DadosCalendario = {
  dataPagamento: string; competenciaInicio: string; competenciaFim: string
  descricao: string; ativo: boolean
}

const paraBancoCal = (d: DadosCalendario) => ({
  data_pagamento: d.dataPagamento,
  competencia_inicio: d.competenciaInicio || null,
  competencia_fim: d.competenciaFim || null,
  descricao: d.descricao,
  ativo: d.ativo,
})

export async function criarDataCalendarioPorto(dados: DadosCalendario): Promise<CalendarioPorto> {
  if (!moduloNoSupabase('porto')) {
    return api<CalendarioPorto>('/api/porto/calendario', { method: 'POST', body: JSON.stringify(dados) })
  }
  return calParaModelo(ou(
    await supabase().from('calendario_pagamentos_porto').insert(paraBancoCal(dados))
      .select(COLUNAS_CAL).single(),
    'Não foi possível cadastrar a data.',
  ) as Record<string, unknown>)
}

export async function atualizarDataCalendarioPorto(
  id: number, dados: DadosCalendario,
): Promise<CalendarioPorto> {
  if (!moduloNoSupabase('porto')) {
    return api<CalendarioPorto>(`/api/porto/calendario/${id}`, { method: 'PUT', body: JSON.stringify(dados) })
  }
  return calParaModelo(ou(
    await supabase().from('calendario_pagamentos_porto').update(paraBancoCal(dados))
      .eq('id', id).select(COLUNAS_CAL).single(),
    'Não foi possível salvar a data.',
  ) as Record<string, unknown>)
}

export async function desativarDataCalendarioPorto(id: number): Promise<CalendarioPorto> {
  if (!moduloNoSupabase('porto')) {
    return api<CalendarioPorto>(`/api/porto/calendario/${id}/desativar`, { method: 'PATCH' })
  }
  return calParaModelo(ou(
    await supabase().from('calendario_pagamentos_porto').update({ ativo: false })
      .eq('id', id).select(COLUNAS_CAL).single(),
    'Não foi possível desativar a data.',
  ) as Record<string, unknown>)
}

/* ------------------------------------------------------------------ *
 * Importacao de relatorios
 *
 * No modo Supabase o arquivo e lido no navegador e aplicado por RPC; no modo
 * antigo o arquivo sobe para o backend, que faz as duas coisas. Por isso estas
 * funcoes recebem a previa inteira e nao so o id: no caminho novo as linhas
 * vivem no navegador, e o backend antigo so precisa do id.
 * ------------------------------------------------------------------ */

export async function criarPreviaPorto(arquivo: File): Promise<PreviaPorto> {
  if (!moduloNoSupabase('porto')) {
    const body = new FormData()
    body.append('arquivo', arquivo)
    return api<PreviaPorto>('/api/porto/importacoes/previa', { method: 'POST', body })
  }
  return importacao.criarPreviaPorto(arquivo)
}

export async function criarPreviaConteudoPorto(conteudo: string): Promise<PreviaPorto> {
  if (!moduloNoSupabase('porto')) {
    return api<PreviaPorto>('/api/porto/importacoes/previa-conteudo',
      { method: 'POST', body: JSON.stringify({ conteudo }) })
  }
  return importacao.criarPreviaConteudoPorto(conteudo)
}

export async function avaliarImportacaoPorto(
  previa: PreviaPorto,
  dados: { numeroOrdemPagamento: string; calendarioPagamentoId: number },
  signal?: AbortSignal,
): Promise<PreviaPorto> {
  if (!moduloNoSupabase('porto')) {
    return api<PreviaPorto>(`/api/porto/importacoes/${previa.id}/avaliar`,
      { method: 'POST', body: JSON.stringify(dados), signal })
  }
  return importacao.avaliarImportacaoPorto(previa, dados.numeroOrdemPagamento)
}

export async function confirmarImportacaoPorto(
  previa: PreviaPorto, dados: importacao.ConfirmacaoImportacao = {},
): Promise<ConfirmacaoPorto> {
  if (!moduloNoSupabase('porto')) {
    return api<ConfirmacaoPorto>(`/api/porto/importacoes/${previa.id}/confirmar`, {
      method: 'POST',
      body: JSON.stringify({
        numeroOrdemPagamento: dados.numeroOrdemPagamento,
        calendarioPagamentoId: dados.calendarioPagamentoId ?? null,
        confirmarDivergencias: dados.confirmarDivergencias ?? false,
        confirmarReassociacoes: dados.confirmarReassociacoes ?? false,
        motivoDivergencia: dados.motivoDivergencia,
        justificativaDivergencia: dados.justificativaDivergencia,
      }),
    })
  }
  return importacao.confirmarImportacaoPorto(previa, dados)
}

export async function cancelarImportacaoPorto(id: number): Promise<void> {
  if (!moduloNoSupabase('porto')) {
    await api(`/api/porto/importacoes/${id}/cancelar`, { method: 'POST' })
    return
  }
  await importacao.cancelarImportacaoPorto(id)
}

/**
 * Composicao de uma OP existente: o mesmo fluxo da importacao, mas com a OP ja
 * escolhida — o administrador esta dizendo "estes servicos compoem esta OP".
 */
export async function criarPreviaComposicaoPorto(
  op: { id: number; numero: string }, arquivo: File,
): Promise<PreviaPorto> {
  if (!moduloNoSupabase('porto')) {
    const body = new FormData()
    body.append('arquivo', arquivo)
    return api<PreviaPorto>(`/api/porto/ordens-pagamento/${op.id}/composicao/previa`,
      { method: 'POST', body })
  }
  const previa = await importacao.criarPreviaPorto(arquivo)
  return importacao.avaliarImportacaoPorto(previa, op.numero)
}

/* ------------------------------------------------------------------ *
 * Exportacoes
 *
 * O backend entregava XLSX e PDF. No Supabase sai CSV, montado no navegador a
 * partir dos mesmos dados que a tela ja mostra — ver dados/porto/relatorios.ts.
 * ------------------------------------------------------------------ */

export async function baixarRelatorioPorto(
  formato: 'excel' | 'pdf', params?: URLSearchParams,
): Promise<void> {
  if (!moduloNoSupabase('porto')) return relatoriosPorto.peloRender(formato, params)
  return relatoriosPorto.baixarRelatorioPorto(params)
}

export async function baixarRelatorioOpPorto(id: number, formato: 'excel' | 'pdf'): Promise<void> {
  if (!moduloNoSupabase('porto')) return relatoriosPorto.opPeloRender(id, formato)
  return relatoriosPorto.baixarRelatorioOpPorto(id)
}

export async function baixarOrdensServicoPorto(params?: URLSearchParams): Promise<void> {
  if (!moduloNoSupabase('porto')) return relatoriosPorto.ossPeloRender(params)
  return relatoriosPorto.baixarOrdensServicoPorto(params)
}
