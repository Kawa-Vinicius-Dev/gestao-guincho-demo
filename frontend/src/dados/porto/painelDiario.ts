import type { Linha } from './linha'
import type { Previa } from './csv'

/**
 * Leitor do painel do dia da Porto — o que se copia da tela e cola aqui.
 *
 * Diferente dos relatorios, este nao e CSV: nao tem cabecalho, vem separado por
 * tabulacao e as celulas quebram linha no meio do registro, porque a tela de
 * origem quebra o nome do socorrista embaixo da viatura. Colar isso num leitor
 * de CSV produz lixo — dai o leitor proprio.
 *
 * Um registro e assim, com as quebras onde a colagem quiser:
 *
 *   PORTO SEGURO | 5673329/26 | SOCORRO | L168 | LUIZ FELIPE DA SILVA
 *   14/09/2026 | 06:34 | 06:34 | ACIONADO/FINAL | EM PROCESSAMENTO | Não
 *
 * Em vez de contar colunas — que variam, porque viatura e socorrista vem vazios
 * no servico cancelado —, a leitura se ancora em dois marcos que nao mudam: o
 * numero da OS abre o registro e a data o fecha. O que estiver entre os dois e
 * especialidade, viatura e socorrista, nessa ordem, com os vazios omitidos.
 *
 * O painel nao traz valor: e a OP, semanas depois, que diz quanto a Porto pagou.
 * Ate la a OS existe, conta como servico feito e fica pendente de valor.
 */

/** "5673329/26", ou com link markdown "[5673329/26](https://...)" copiado de navegadores como Edge. O numero abre o registro. */
const NUMERO = /^(?:\[)?(\d{4,}[-/]\d{2})(?:\](?:\([^)]*\))?)?$/

function extrairNumero(campo: string): string {
  const m = campo.match(NUMERO)
  return m ? m[1] : campo
}

/** "14/09/2026". A data fecha a parte variavel. */
const DATA = /^\d{2}\/\d{2}\/\d{4}$/
/** "L168", "K85", "L25". Serve para desempatar quando so um campo veio. */
const VIATURA = /^[A-Z]{1,3}\s?\d{1,4}$/
const HORA = /^\d{2}:\d{2}(:\d{2})?$/

async function hash(dados: Record<string, string>) {
  const base = 'PAINEL_DIARIO' + Object.keys(dados).sort()
    .map(k => `|${k}=${dados[k]}`).join('')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const iso = (ddMMyyyy: string) => {
  const [d, m, a] = ddMMyyyy.split('/')
  return `${a}-${m}-${d}`
}

/**
 * Quem e quem entre o numero e a data.
 *
 * Com os tres campos preenchidos a ordem resolve. Faltando um, a sigla da
 * viatura tem forma reconhecivel (letra seguida de numero) e o nome nao — e o
 * nome nunca vem sem a viatura nos arquivos observados, entao sobra o par
 * especialidade + viatura.
 */
function repartir(meio: string[]) {
  const [especialidade = '', a = '', b = ''] = meio
  if (b) return { especialidade, sigla_viatura: a, socorrista: b }
  if (!a) return { especialidade, sigla_viatura: '', socorrista: '' }
  return VIATURA.test(a)
    ? { especialidade, sigla_viatura: a, socorrista: '' }
    : { especialidade, sigla_viatura: '', socorrista: a }
}

export async function lerPainelDiarioPorto(conteudo: string): Promise<Previa> {
  // A quebra de linha dentro do registro e a quebra entre registros sao a mesma
  // coisa para quem cola; ambas viram apenas mais um separador.
  const campos = conteudo.replace(/^﻿/, '').split(/[\t\r\n]+/)
    .map(c => c.trim())

  const inicios = campos.map((c, i) => (NUMERO.test(c) ? i : -1)).filter(i => i >= 0)
  if (!inicios.length) {
    throw new Error('O conteúdo colado não parece o painel do dia da Porto.')
  }

  const linhas: Linha[] = []
  const erros: string[] = []
  const vistos = new Set<string>()

  for (let n = 0; n < inicios.length; n++) {
    const inicio = inicios[n]
    const fim = n + 1 < inicios.length ? inicios[n + 1] - 1 : campos.length
    const registro = campos.slice(inicio, fim)
    const numero = extrairNumero(registro[0])

    const posicaoData = registro.findIndex(c => DATA.test(c))
    if (posicaoData < 0) {
      erros.push(`OS ${numero}: sem data de atendimento.`)
      continue
    }
    if (vistos.has(numero)) continue
    vistos.add(numero)

    const cauda = registro.slice(posicaoData + 1).filter(c => !HORA.test(c))
    // O painel diz duas coisas sobre o estado: como o acionamento terminou e em
    // que pe o servico esta na Porto. Cancelado em qualquer uma delas cancela.
    const situacao = cauda.filter(c => c && c !== 'Não' && c !== 'Sim').join(' · ')
    const cancelado = /CANCELAD/i.test(situacao)

    const dados: Record<string, string> = {
      seguradora: inicio > 0 && !NUMERO.test(campos[inicio - 1]) ? campos[inicio - 1] : '',
      numero_os: numero,
      ...repartir(registro.slice(1, posicaoData)),
      data_atendimento: iso(registro[posicaoData]),
      situacao_porto: situacao,
      cancelado: cancelado ? 'true' : 'false',
    }

    linhas.push({ dados, hashRegistro: await hash(dados), acao: 'IMPORTAR' })
  }

  return {
    tipo: 'PAINEL_DIARIO',
    cabecalhos: ['seguradora', 'numero_os', 'especialidade', 'sigla_viatura',
      'socorrista', 'data_atendimento', 'situacao_porto'],
    linhas,
    erros,
  }
}
