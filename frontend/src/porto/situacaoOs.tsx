import type { SituacaoDaOs } from '../dados/porto/listaOs'

/**
 * Como cada situação de conciliação aparece na tela.
 *
 * Estava escrito dentro da tela de ordens de serviço, e quando as Pendências do
 * período precisaram das mesmas situações a escolha era copiar ou compartilhar.
 * Copiar significaria a mesma OS aparecendo como "Valor divergente" numa tela e
 * como outra coisa na outra no dia em que alguém mexesse num dos dois lugares.
 */
export const ETIQUETAS_SITUACAO: Record<SituacaoDaOs, { texto: string; classe: string }> = {
  AGUARDANDO_ANALISE: { texto: 'Sem valor', classe: 'status-pendente' },
  VALOR_MANUAL: { texto: 'Valor informado', classe: 'status-prevista' },
  AGUARDANDO_PROXIMA_OP: { texto: 'Aguardando próxima OP', classe: 'status-pendente' },
  CONCILIADA: { texto: 'Conciliada', classe: 'status-recebido' },
  DIVERGENTE: { texto: 'Valor divergente', classe: 'status-erro_leitura' },
}

export function EtiquetaSituacao({ situacao }: { situacao?: SituacaoDaOs }) {
  const etiqueta = situacao ? ETIQUETAS_SITUACAO[situacao] : undefined
  if (!etiqueta) return <>—</>
  return <span className={`vehicle-status ${etiqueta.classe}`}>{etiqueta.texto}</span>
}
