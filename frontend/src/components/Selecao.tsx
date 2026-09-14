import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SelectHTMLAttributes } from 'react'
import { Campo } from './Campos'

/**
 * Dropdown proprio, no lugar do que o navegador desenha.
 *
 * O <select> nativo continua no DOM e continua sendo o controle de verdade: e
 * dele que o FormData tira o valor, e nele que o required do HTML age, e ele que
 * o leitor de tela anuncia e que o teclado opera do jeito que a pessoa ja sabe.
 * O que trocamos e so a lista que aparece ao clicar: o pointerdown e barrado e
 * abrimos um painel nosso.
 *
 * Isso importa porque a lista nativa e a unica parte do formulario que nao da
 * para estilizar: ela sai com a cara do sistema operacional, diferente no
 * Windows, no macOS e no Android, e no celular vira uma roleta colada no rodape
 * com alvos pequenos — justamente onde o socorrista vai usar. Aqui o painel abre
 * ancorado no campo no desktop e centralizado, sobre um fundo escurecido, no
 * celular, com linha alta o bastante para acertar com o polegar.
 *
 * Sem teclado de proposito. Quem abre pelo teclado (Enter, seta, F4) continua
 * recebendo a lista nativa, e isso e melhor, nao pior: a maior parte destes
 * campos vive dentro de um modal com aria-modal="true", e o navegador esconde do
 * leitor de tela tudo que esta fora do modal — inclusive um painel nosso, que
 * mora no fim do <body>. Painel so no ponteiro mantem a rota do teclado e do
 * leitor de tela sempre no controle nativo, que nunca fica escondido. Dentro do
 * painel ja aberto as teclas funcionam, para quem clicou e seguiu com elas.
 *
 * Se o navegador ignorar o preventDefault, a lista nativa abre e tudo funciona
 * como antes. A degradacao e essa, e ela e aceitavel.
 */

export type Opcao = { valor: string | number; texto: string }

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  rotulo: string
  className?: string
  ajuda?: string
  /** Primeira opcao, de valor vazio: "Todos", "Selecione", "Nao relacionado". */
  vazio?: string
  opcoes: ReadonlyArray<Opcao>
}

/** Acima disto a lista ganha um campo de busca. Periodos e veiculos passam disso. */
const BUSCA_A_PARTIR_DE = 8

export function Selecao({ rotulo, className, ajuda, vazio, opcoes, ...resto }: Props) {
  const campo = useRef<HTMLSelectElement>(null)
  const [aberto, setAberto] = useState(false)
  const [ancora, setAncora] = useState<DOMRect | null>(null)

  const lista = useMemo<Opcao[]>(
    () => (vazio === undefined ? [...opcoes] : [{ valor: '', texto: vazio }, ...opcoes]),
    [vazio, opcoes],
  )

  function abrir() {
    const alvo = campo.current
    if (!alvo || alvo.disabled) return
    setAncora(alvo.getBoundingClientRect())
    setAberto(true)
  }

  function fechar() {
    setAberto(false)
    campo.current?.focus()
  }

  /**
   * Escreve no <select> passando pelo setter nativo antes de disparar o evento.
   * Sem isso o React nao percebe a mudanca e um campo controlado volta sozinho
   * para o valor anterior.
   */
  function escolher(valor: string) {
    const alvo = campo.current
    if (alvo) {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
      setter?.call(alvo, valor)
      alvo.dispatchEvent(new Event('change', { bubbles: true }))
    }
    fechar()
  }

  return <Campo rotulo={rotulo} className={className} ajuda={ajuda}>
    <div className="selecao">
      <select
        {...resto}
        ref={campo}
        className="selecao-campo"
        onPointerDown={evento => { evento.preventDefault(); abrir() }}
        onMouseDown={evento => evento.preventDefault()}
        >
        {lista.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
      {aberto && ancora
        ? <Painel
            rotulo={rotulo}
            opcoes={lista}
            ancora={ancora}
            selecionado={campo.current?.value ?? ''}
            aoEscolher={escolher}
            aoFechar={fechar}/>
        : null}
    </div>
  </Campo>
}

type PainelProps = {
  rotulo: string
  opcoes: ReadonlyArray<Opcao>
  ancora: DOMRect
  selecionado: string
  aoEscolher: (valor: string) => void
  aoFechar: () => void
}

function Painel({ rotulo, opcoes, ancora, selecionado, aoEscolher, aoFechar }: PainelProps) {
  const id = useId()
  const caixa = useRef<HTMLDivElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const [busca, setBusca] = useState('')
  const comBusca = opcoes.length > BUSCA_A_PARTIR_DE

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return termo ? opcoes.filter(o => o.texto.toLowerCase().includes(termo)) : opcoes
  }, [opcoes, busca])

  const [destaque, setDestaque] = useState(() => {
    const indice = opcoes.findIndex(o => String(o.valor) === selecionado)
    return indice < 0 ? 0 : indice
  })

  // A busca encurta a lista: o destaque volta para o topo para nao apontar para
  // uma linha que saiu de vista.
  useEffect(() => { setDestaque(0) }, [busca])

  useLayoutEffect(() => {
    // Sem foco dentro do painel o Esc e as setas continuariam indo para a pagina.
    ;(comBusca ? caixa.current?.querySelector('input') : listaRef.current)?.focus()
  }, [comBusca])

  useEffect(() => {
    const linha = listaRef.current?.querySelector('[data-destacado="sim"]')
    // scrollIntoView nao existe no jsdom nem em navegadores antigos, e rolar a
    // lista e conforto, nao funcao: se faltar, seguimos sem.
    if (linha instanceof HTMLElement && typeof linha.scrollIntoView === 'function') {
      linha.scrollIntoView({ block: 'nearest' })
    }
  }, [destaque])

  const mover = useCallback((passo: number) => {
    setDestaque(atual => {
      if (!visiveis.length) return 0
      return Math.min(visiveis.length - 1, Math.max(0, atual + passo))
    })
  }, [visiveis.length])

  function teclado(evento: React.KeyboardEvent) {
    if (evento.key === 'Escape') { evento.preventDefault(); aoFechar(); return }
    if (evento.key === 'ArrowDown') { evento.preventDefault(); mover(1); return }
    if (evento.key === 'ArrowUp') { evento.preventDefault(); mover(-1); return }
    if (evento.key === 'Home') { evento.preventDefault(); setDestaque(0); return }
    if (evento.key === 'End') { evento.preventDefault(); setDestaque(visiveis.length - 1); return }
    if (evento.key === 'Enter' || (evento.key === ' ' && !comBusca)) {
      evento.preventDefault()
      const alvo = visiveis[destaque]
      if (alvo !== undefined) aoEscolher(String(alvo.valor))
    }
  }

  // A rolagem da pagina moveria o campo e o painel ancorado ficaria solto dele.
  useEffect(() => {
    const fechar = () => aoFechar()
    window.addEventListener('resize', fechar)
    window.addEventListener('scroll', fechar, true)
    return () => {
      window.removeEventListener('resize', fechar)
      window.removeEventListener('scroll', fechar, true)
    }
  }, [aoFechar])

  /**
   * Abre para baixo quando ha espaco, para cima quando nao ha.
   *
   * Um campo no rodape de um formulario longo — a categoria da despesa fixa, por
   * exemplo — tem poucos pixels abaixo de si, e o painel saia cortado pela borda
   * da janela. A conta usa a altura que o painel pode pedir, nao a que ele tem:
   * na hora de decidir ele ainda nao foi medido.
   */
  const alturaProvavel = Math.min(420, 52 + opcoes.length * 42 + (comBusca ? 60 : 0))
  const espacoAbaixo = window.innerHeight - ancora.bottom
  const espacoAcima = ancora.top
  const paraCima = espacoAbaixo < alturaProvavel && espacoAcima > espacoAbaixo

  // A largura minima do painel e maior que a de alguns campos: ancorado pela
  // esquerda, um campo colado na borda direita empurraria o painel para fora.
  const larguraMinima = 260
  const largura = Math.max(ancora.width, larguraMinima)
  const esquerda = Math.min(ancora.left, window.innerWidth - largura - 8)

  // Coordenadas do campo viajam como variaveis de CSS: assim a folha decide se
  // as usa (ancorado, no desktop) ou as ignora (centralizado, no celular).
  const posicao = {
    '--campo-topo': `${ancora.bottom}px`,
    '--campo-base': `${ancora.top}px`,
    '--campo-esquerda': `${Math.max(esquerda, 8)}px`,
    '--campo-largura': `${ancora.width}px`,
    '--campo-espaco': `${Math.max(espacoAbaixo, espacoAcima) - 16}px`,
  } as React.CSSProperties

  return createPortal(
    <div className="selecao-fundo" style={posicao}
      onPointerDown={evento => { if (evento.target === evento.currentTarget) aoFechar() }}>
      <div className={paraCima ? 'selecao-painel para-cima' : 'selecao-painel'}
        ref={caixa} role="dialog" aria-label={rotulo} onKeyDown={teclado}>
        <header>
          <span>{rotulo}</span>
          <button type="button" aria-label="Fechar" onClick={aoFechar}>×</button>
        </header>
        {comBusca
          ? <div className="selecao-busca">
              <input value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar…" aria-label={`Buscar em ${rotulo}`}
                aria-controls={`${id}-lista`}/>
            </div>
          : null}
        <div className="selecao-opcoes" id={`${id}-lista`} ref={listaRef}
          role="listbox" aria-label={rotulo} tabIndex={-1}
          aria-activedescendant={visiveis[destaque] ? `${id}-${destaque}` : undefined}>
          {visiveis.length
            ? visiveis.map((o, indice) => {
                const marcado = String(o.valor) === selecionado
                return <button key={o.valor} type="button" id={`${id}-${indice}`}
                  role="option" aria-selected={marcado}
                  data-destacado={indice === destaque ? 'sim' : 'nao'}
                  onPointerEnter={() => setDestaque(indice)}
                  onClick={() => aoEscolher(String(o.valor))}>
                  <span>{o.texto}</span>
                  {marcado ? <i className="selecao-marca" aria-hidden="true"/> : null}
                </button>
              })
            : <p className="selecao-vazio">Nada encontrado para “{busca}”.</p>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
