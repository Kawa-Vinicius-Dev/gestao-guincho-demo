import type { Opcao } from '../../components/Campos'

/**
 * Listas de opcao da area Porto, num lugar so.
 *
 * Os mesmos <option> apareciam escritos a mao em quatro formularios desta tela.
 * Acrescentar um motivo de divergencia exigia lembrar de todos, e o que estava
 * no ar ja divergia: o formulario de nova OP oferecia "Selecione" em Status
 * Porto, o de edicao nao.
 */

export const STATUS_PORTO: Opcao[] = [
  { valor: 'AGUARDANDO_PROCESSAMENTO', texto: 'Aguardando processamento' },
  { valor: 'PROCESSADO', texto: 'Processado' },
]

export const SITUACAO_FINANCEIRA: Opcao[] = [
  { valor: 'PROGRAMADO', texto: 'Programado' },
  { valor: 'A_CONFIRMAR', texto: 'A confirmar' },
]

/** Motivos de diferenca entre o previsto da OP e a soma das OS da composicao. */
export const MOTIVOS_COMPOSICAO: Opcao[] = [
  { valor: 'DESCONTO', texto: 'Desconto' },
  { valor: 'AJUSTE_PORTO', texto: 'Ajuste Porto' },
  { valor: 'DIVERGENCIA_VALOR', texto: 'Divergência de valor' },
  { valor: 'OUTRO', texto: 'Outro' },
]

/** Motivos de divergencia da OP ja fechada: os de cima mais os de servico. */
export const MOTIVOS_DIVERGENCIA: Opcao[] = [
  { valor: 'SERVICO_NAO_INCLUIDO', texto: 'Serviço ainda não incluído' },
  { valor: 'DESCONTO', texto: 'Desconto' },
  { valor: 'AJUSTE_PORTO', texto: 'Ajuste da Porto' },
  { valor: 'SERVICO_PENDENTE', texto: 'Serviço pendente' },
  { valor: 'SERVICO_DEVOLVIDO', texto: 'Serviço devolvido' },
  { valor: 'DIVERGENCIA_VALOR', texto: 'Divergência de valor' },
  { valor: 'OUTRO', texto: 'Outro' },
]

export const CONCILIACAO: Opcao[] = [
  { valor: 'SEM_COMPOSICAO', texto: 'Sem composição' },
  { valor: 'CONCILIADA', texto: 'Conciliada' },
  { valor: 'VALOR_ABAIXO', texto: 'Valor abaixo' },
  { valor: 'VALOR_ACIMA', texto: 'Valor acima' },
  { valor: 'RECEBIDA_COM_DIVERGENCIA', texto: 'Recebida com divergência' },
]

export const RECEBIMENTO: Opcao[] = [
  { valor: 'true', texto: 'Recebidas' },
  { valor: 'false', texto: 'Não recebidas' },
]

/** "VALOR_ABAIXO" -> "Valor abaixo". Vale para qualquer enum vindo do backend. */
export const rotulo = (valor?: string) =>
  valor ? valor.toLowerCase().replaceAll('_', ' ').replace(/^./, x => x.toUpperCase()) : '—'

export const data = (valor?: string) =>
  valor ? new Date(`${valor}T12:00:00`).toLocaleDateString('pt-BR') : '—'
