import type { ReactNode } from 'react'

/**
 * Campo e Selecao: o par que padroniza rotulo + controle.
 *
 * Antes cada tela montava o seu. Havia cinco marcacoes diferentes para a mesma
 * coisa — <label> pelado dentro de .ledger-filters, .filter-select, .field,
 * .month-picker e <select> solto so com aria-label — e cada uma caia numa regra
 * de CSS com altura e tamanho de fonte proprios. O rotulo do filtro do extrato
 * saia em 8px; o do formulario ao lado, em 11px.
 *
 * Aqui a marcacao e uma so: <label class="field"><span>rotulo</span><controle>.
 * O rotulo dentro do <label> ja da o nome acessivel ao controle, sem precisar de
 * id nem de aria-label repetido.
 */

type CampoProps = {
  rotulo: string
  /** Classe extra do proprio <label>, para largura (.filter-grow, .field-wide). */
  className?: string
  /** Explicacao curta abaixo do controle. Sempre no mesmo lugar e no mesmo tom. */
  ajuda?: string
  children: ReactNode
}

export function Campo({ rotulo, className, ajuda, children }: CampoProps) {
  return <label className={className ? `field ${className}` : 'field'}>
    <span>{rotulo}</span>{children}
    {ajuda ? <small>{ajuda}</small> : null}
  </label>
}

/**
 * O dropdown mora em Selecao.tsx, que e maior. Fica reexportado aqui para as
 * telas continuarem importando o par inteiro de um lugar so.
 */
export { Selecao } from './Selecao'
export type { Opcao } from './Selecao'
