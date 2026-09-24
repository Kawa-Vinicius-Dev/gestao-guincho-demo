import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * Peças de tela reutilizáveis.
 *
 * O equivalente, aqui, ao que uma classe é no backend: o componente define a
 * forma uma vez e cada tela a instancia com seus dados. Antes cada página
 * montava o próprio cabeçalho e o próprio cartão, com valores de espaçamento
 * escolhidos na hora — e é por isso que duas telas do mesmo sistema não pareciam
 * o mesmo sistema. O que muda de tela para tela são os dados; a forma vem daqui.
 *
 * Nada neste arquivo decide regra de negócio: são só recipientes.
 */

type CabecalhoProps = {
  /** Linha pequena acima do título: o módulo a que a tela pertence. */
  modulo: string
  titulo: string
  descricao?: string
  /** Fato curto ligado ao que está na tela, como o período selecionado. */
  contexto?: ReactNode
  acoes?: ReactNode
}

export function CabecalhoPagina({ modulo, titulo, descricao, contexto, acoes }: CabecalhoProps) {
  return <header className="page-heading">
    <div>
      <span className="eyebrow">{modulo}</span>
      <h1>{titulo}</h1>
      {descricao ? <p>{descricao}</p> : null}
      {contexto ? <p className="cabecalho-contexto"><i aria-hidden="true"/>{contexto}</p> : null}
    </div>
    {acoes ? <div className="heading-actions">{acoes}</div> : null}
  </header>
}

type PainelProps = {
  titulo?: string
  /** Linha pequena acima do título do painel. */
  etiqueta?: string
  /** Canto direito do cabeçalho: um link, um seletor, um grupo de botões. */
  aoLado?: ReactNode
  /** Painéis com tabela tiram o respiro interno, que a própria tabela já tem. */
  semRespiro?: boolean
  className?: string
  children: ReactNode
}

export function Painel({ titulo, etiqueta, aoLado, semRespiro, className, children }: PainelProps) {
  const classes = ['panel', semRespiro ? 'panel-liso' : 'panel-respiro', className]
    .filter(Boolean).join(' ')
  return <section className={classes}>
    {titulo || aoLado
      ? <header className={`panel-title${semRespiro ? ' panel-title-solto' : ''}`}>
          <div>
            {etiqueta ? <span className="eyebrow">{etiqueta}</span> : null}
            {titulo ? <h2>{titulo}</h2> : null}
          </div>
          {aoLado}
        </header>
      : null}
    {children}
  </section>
}

/** O tom carrega significado: alerta e atencao so aparecem quando ha o que resolver. */
export type TomIndicador = 'neutro' | 'atencao' | 'alerta' | 'positivo'

type IndicadorProps = {
  rotulo: string
  valor: ReactNode
  /** Uma linha de apoio: o valor em dinheiro por trás da contagem, por exemplo. */
  apoio?: ReactNode
  tom?: TomIndicador
  /** Quando existe, o card inteiro vira link para a lista que ele resume. */
  link?: string
  /** Filtro na propria tela: o card vira botao, e `ativo` marca o filtro aplicado. */
  aoClicar?: () => void
  ativo?: boolean
}

export function Indicador({ rotulo, valor, apoio, tom = 'neutro', link, aoClicar, ativo }: IndicadorProps) {
  const corpo = <>
    <span>{rotulo}</span>
    <strong>{valor}</strong>
    {apoio ? <small>{apoio}</small> : null}
  </>
  // Card que representa um conjunto de linhas abre esse conjunto: quem ve "12 sem
  // valor" quer saber quais sao, e o caminho ate a lista filtrada era manual.
  if (aoClicar) {
    return <button type="button" aria-pressed={Boolean(ativo)} onClick={aoClicar}
      className={`indicador indicador-${tom} indicador-link indicador-botao${ativo ? ' indicador-ativo' : ''}`}>{corpo}</button>
  }
  return link
    ? <Link className={`indicador indicador-${tom} indicador-link`} to={link}>{corpo}</Link>
    : <article className={`indicador indicador-${tom}`}>{corpo}</article>
}

/** Grade de indicadores: uma só medida de coluna para todas as telas. */
export function GradeIndicadores({ children }: { children: ReactNode }) {
  return <div className="grade-indicadores">{children}</div>
}

const TONS_ETIQUETA = {
  ok: 'etiqueta-ok', neutro: 'etiqueta-neutra',
  alerta: 'etiqueta-alerta', atencao: 'etiqueta-atencao',
} as const

/** Marcador de estado numa tabela: discreto, sem virar carnaval de cores. */
export function Etiqueta({ tom, children }: {
  tom: keyof typeof TONS_ETIQUETA
  children: ReactNode
}) {
  return <span className={`etiqueta ${TONS_ETIQUETA[tom]}`}>{children}</span>
}
