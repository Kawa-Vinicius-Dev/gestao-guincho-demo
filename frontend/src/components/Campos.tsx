import type { ReactNode, SelectHTMLAttributes } from 'react'

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

export type Opcao = { valor: string | number; texto: string }

type SelecaoProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  rotulo: string
  className?: string
  ajuda?: string
  /**
   * Primeira opcao, de valor vazio. Existe porque quase todo <select> da
   * aplicacao precisava de uma ("Todos", "Selecione", "Nao relacionado") e cada
   * tela escrevia a sua na mao, com valor ora "" ora ausente.
   */
  vazio?: string
  opcoes: ReadonlyArray<Opcao>
}

export function Selecao({ rotulo, className, ajuda, vazio, opcoes, ...resto }: SelecaoProps) {
  return <Campo rotulo={rotulo} className={className} ajuda={ajuda}>
    <select {...resto}>
      {vazio === undefined ? null : <option value="">{vazio}</option>}
      {opcoes.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
    </select>
  </Campo>
}
