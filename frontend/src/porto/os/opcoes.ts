import type { Opcao } from '../../components/Campos'

export const STATUS_OPERACIONAL: Opcao[] = [
  { valor: 'AGUARDANDO_LANCAMENTO', texto: 'Aguardando lançamento' },
  { valor: 'PROCESSADO', texto: 'Processado' },
  { valor: 'LIBERADO_APOS_ANALISE', texto: 'Liberado após análise' },
  { valor: 'NORMAL', texto: 'Normal' },
  { valor: 'PENDENTE_PORTO', texto: 'Pendente Porto' },
  { valor: 'DEVOLVIDO_FINALIZADO', texto: 'Devolvido finalizado' },
  { valor: 'CANCELADO', texto: 'Cancelado' },
]

export const STATUS_FINANCEIRO: Opcao[] = [
  { valor: 'AGUARDANDO_OP', texto: 'Aguardando OP' },
  { valor: 'PAGAMENTO_PROGRAMADO', texto: 'Pagamento programado' },
  { valor: 'A_CONFIRMAR', texto: 'A confirmar' },
  { valor: 'RECEBIDO', texto: 'Recebido' },
  { valor: 'BLOQUEADO_PARA_PAGAMENTO', texto: 'Bloqueado' },
  { valor: 'VALOR_DIVERGENTE', texto: 'Valor divergente' },
]

/** Campos de filtro que a tela manda para a API. */
export const FILTROS_OS = ['dataInicio', 'dataFim', 'numeroOs', 'numeroOp', 'especialidade',
  'socorrista', 'qra', 'viatura', 'seguradora', 'statusOperacional', 'statusFinanceiro'] as const

/**
 * O painel da Porto corta o nome do socorrista na largura da coluna ("QEBSON RAMOS
 * DA SILV"), entao o nome do cadastro deve comecar com o que veio de la. Quando nao
 * comeca, as duas fontes discordam e o operador precisa ver: o vinculo continua sendo
 * so pelo QRA, mas divergencia de nome e sinal de que o QRA pode estar no cadastro
 * errado - a equipe tem pai e filho com nomes quase iguais.
 */
export function mesmaPessoa(daPorto?: string | null, vinculado?: string | null) {
  if (!daPorto?.trim() || !vinculado?.trim()) return true
  const limpar = (v: string) =>
    v.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
  return limpar(vinculado).startsWith(limpar(daPorto))
}
