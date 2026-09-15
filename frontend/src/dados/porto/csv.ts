import type { AcaoLinha, Linha } from './linha'
import { data as lerData, decimal, texto } from './linha'

/**
 * Leitor dos relatorios CSV da Porto. Porte fiel do PortoCsvParser.
 *
 * Roda no navegador de proposito: e processamento de texto, sem segredo e sem
 * acesso privilegiado. Mandar para uma Edge Function gastaria invocacao para
 * fazer o que a maquina de quem importa ja faz.
 */

export type TipoRelatorio =
  | 'PREVISAO_RECEBER' | 'SERVICOS_GERAIS' | 'SERVICOS_AGUARDANDO_LANCAMENTO'
  | 'OS_VINCULADAS' | 'SERVICOS_DEVOLVIDOS' | 'PAINEL_DIARIO'

export interface Previa {
  tipo: TipoRelatorio
  cabecalhos: string[]
  linhas: Linha[]
  erros: string[]
}

/** Cabecalhos que a Porto escreve de formas diferentes entre relatorios. */
const ALIASES: Record<string, string> = {
  'numero da ordem de pagamento': 'numero_op', 'valor total do servico': 'valor_total',
  'nome codigo': 'nome_codigo', 'data de pagamento': 'data_pagamento',
  'numero da ordem de servico': 'numero_os', 'valor total': 'valor_total',
  especialidade: 'especialidade', 'sigla da viatura': 'sigla_viatura',
  socorrista: 'socorrista', qra: 'qra', 'data de atendimento': 'data_atendimento',
  'data da devolucao': 'data_devolucao', 'valor km excedente': 'valor_km_excedente',
  'data da finalizacao': 'data_finalizacao', 'km morto estimado': 'km_morto_estimado',
}

const HTML = /<[^>]*>/g

function limpar(valor: string) {
  return valor.replace(HTML, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
}

function normalizar(valor: string) {
  return limpar(valor)
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** O separador e o que mais aparece no cabecalho fora de aspas. */
function separador(cabecalho: string) {
  let melhor = ';'
  let maior = -1
  for (const c of [';', '\t', ',']) {
    let n = 0
    let aspas = false
    for (const x of cabecalho) {
      if (x === '"') aspas = !aspas
      else if (x === c && !aspas) n++
    }
    if (n > maior) { maior = n; melhor = c }
  }
  return melhor
}

/** Leitor de CSV com aspas: campo entre aspas pode conter separador e quebra. */
function registros(csv: string, sep: string): string[][] {
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]
    if (c === '"') {
      if (aspas && csv[i + 1] === '"') { campo += '"'; i++ }
      else aspas = !aspas
    } else if (c === sep && !aspas) {
      linha.push(campo); campo = ''
    } else if ((c === '\n' || c === '\r') && !aspas) {
      if (c === '\r' && csv[i + 1] === '\n') i++
      linha.push(campo); campo = ''
      linhas.push(linha); linha = []
    } else campo += c
  }
  if (campo.length > 0 || linha.length > 0) { linha.push(campo); linhas.push(linha) }
  return linhas
}

/**
 * Impressao digital do registro, para reimportar o mesmo arquivo nao duplicar.
 * Precisa bater com a do backend: mesmo tipo, mesmas chaves ordenadas.
 */
async function hash(tipo: TipoRelatorio, dados: Record<string, string>) {
  const base = tipo + Object.keys(dados).sort()
    .map(k => `|${k}=${dados[k]}`).join('')
  const bytes = new TextEncoder().encode(base)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function detectar(chaves: Set<string>): TipoRelatorio {
  const tem = (...c: string[]) => c.every(x => chaves.has(x))
  if (tem('numero_op', 'valor_total', 'nome_codigo', 'data_pagamento')) return 'PREVISAO_RECEBER'
  if (tem('numero_os', 'especialidade', 'data_atendimento', 'data_devolucao', 'valor_total')) return 'SERVICOS_DEVOLVIDOS'
  if (tem('numero_os', 'valor_total', 'especialidade', 'sigla_viatura', 'socorrista', 'data_atendimento')) return 'OS_VINCULADAS'
  throw new Error('Não foi possível detectar um relatório Porto pelos cabeçalhos.')
}

function validar(tipo: TipoRelatorio, l: Linha) {
  const numero = tipo === 'PREVISAO_RECEBER' ? texto(l, 'numero_op') : texto(l, 'numero_os')
  if (!numero) throw new Error('número da ordem vazio')

  const valor = decimal(l, 'valor_total')
  if (valor == null) throw new Error('valor total vazio')
  if (valor < 0) throw new Error('valor total não pode ser negativo')

  const dataObrigatoria = (chave: string, rotulo: string) => {
    if (texto(l, chave) == null) throw new Error(`${rotulo} vazia`)
    try { lerData(l, chave) } catch { throw new Error(`${rotulo} inválida`) }
  }

  if (tipo === 'PREVISAO_RECEBER') dataObrigatoria('data_pagamento', 'data de pagamento programada')
  else if (tipo === 'OS_VINCULADAS' || tipo === 'SERVICOS_GERAIS') {
    if (texto(l, 'especialidade') == null) throw new Error('especialidade vazia')
    dataObrigatoria('data_atendimento', 'data de atendimento')
  } else {
    dataObrigatoria('data_devolucao', 'data da devolução')
    if (texto(l, 'data_atendimento') != null) {
      try { lerData(l, 'data_atendimento') } catch { throw new Error('data de atendimento inválida') }
    }
  }
}

export async function lerCsvPorto(conteudo: string): Promise<Previa> {
  const texto0 = conteudo.replace(/^﻿/, '')
  const sep = separador(texto0.split(/\r?\n/)[0] ?? '')
  const registrosLidos = registros(texto0, sep)
  if (registrosLidos.length < 2) throw new Error('O CSV não contém registros para importar.')

  const originais = registrosLidos[0]
  const chaves = originais.map(h => {
    const n = normalizar(h)
    return ALIASES[n] ?? n.replace(/ /g, '_')
  })
  const tipo = detectar(new Set(chaves))

  const linhas: Linha[] = []
  const erros: string[] = []
  for (let indice = 1; indice < registrosLidos.length; indice++) {
    const valores = registrosLidos[indice]
    if (valores.every(v => v.trim() === '')) continue

    const dados: Record<string, string> = {}
    chaves.forEach((chave, coluna) => { dados[chave] = limpar(valores[coluna] ?? '') })

    const hashRegistro = await hash(tipo, dados)
    const linha: Linha = { dados, hashRegistro, acao: 'IMPORTAR' }
    try {
      validar(tipo, linha)
      linhas.push(linha)
    } catch (erro) {
      const mensagem = `Linha ${indice + 1}: ${(erro as Error).message}`
      erros.push(mensagem)
      linhas.push({ ...linha, acao: 'ERRO' as AcaoLinha, mensagem })
    }
  }
  return { tipo, cabecalhos: originais, linhas, erros }
}

/**
 * A colagem da lista de servicos tem os mesmos cabecalhos da OS vinculada, mas
 * nao traz OP: o tipo muda para SERVICOS_GERAIS depois da leitura.
 */
export async function lerServicosGeraisPorto(conteudo: string): Promise<Previa> {
  const previa = await lerCsvPorto(conteudo)
  if (previa.tipo !== 'OS_VINCULADAS') {
    throw new Error('O conteúdo colado não possui os cabeçalhos da lista de serviços Porto.')
  }
  return { ...previa, tipo: 'SERVICOS_GERAIS' }
}
