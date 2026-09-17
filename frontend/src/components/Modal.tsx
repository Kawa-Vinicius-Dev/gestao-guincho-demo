import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Janela modal.
 *
 * A marcacao estava copiada a mao em dezenove lugares — backdrop, section, role,
 * aria-modal, cabecalho e o botao × —, e nenhuma copia fechava no Esc, prendia o
 * foco dentro da janela ou devolvia o foco ao voltar. Quem abria um modal pelo
 * teclado continuava tabulando pela pagina atras dele.
 *
 * Aqui isso e uma coisa so, e as telas ficam com o que interessa: o conteudo.
 */

type Props = {
  titulo: string
  /** Linha pequena acima do titulo: numero da OP, nome do socorrista, etapa. */
  etiqueta?: string
  /**
   * Nome do modal para o leitor de tela, quando o titulo visivel nao basta para
   * distinguir um registro de outro: "Editar socorrista" e igual para todos,
   * "Editar Carlos Alberto" nao. Sem isto, cai no titulo.
   */
  nomeAcessivel?: string
  aoFechar: () => void
  /** Botoes extras no cabecalho, antes do ×. */
  acoes?: ReactNode
  largo?: boolean
  className?: string
  /**
   * Fecha ao clicar no fundo. So para janela sem nada digitado a perder:
   * confirmacoes e detalhes de leitura. Formulario nunca.
   */
  fecharAoClicarFora?: boolean
  children: ReactNode
}

/**
 * Janelas abertas, da mais antiga para a mais nova. O Esc fecha so a de cima:
 * uma confirmacao aberta sobre um formulario nao leva o formulario junto.
 */
const pilha: symbol[] = []

const FOCAVEIS = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Modal({ titulo, etiqueta, nomeAcessivel, aoFechar, acoes, largo, className, fecharAoClicarFora, children }: Props) {
  const caixa = useRef<HTMLElement>(null)
  const fechar = useRef(aoFechar)
  fechar.current = aoFechar

  // Esc no documento, e nao so dentro da janela: depois de um clique no fundo o
  // foco sai da janela, e o Esc parava de funcionar.
  useEffect(() => {
    const eu = Symbol('modal')
    pilha.push(eu)
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape' || pilha[pilha.length - 1] !== eu) return
      evento.stopPropagation()
      fechar.current()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      pilha.splice(pilha.indexOf(eu), 1)
    }
  }, [])

  useEffect(() => {
    const anterior = document.activeElement
    caixa.current?.querySelector<HTMLElement>(FOCAVEIS)?.focus()
    return () => { if (anterior instanceof HTMLElement) anterior.focus() }
  }, [])

  function teclado(evento: React.KeyboardEvent) {
    if (evento.key !== 'Tab') return
    const alvos = Array.from(caixa.current?.querySelectorAll<HTMLElement>(FOCAVEIS) ?? [])
      .filter(alvo => alvo.offsetParent !== null)
    if (!alvos.length) return
    const primeiro = alvos[0]!, ultimo = alvos[alvos.length - 1]!
    // Tab no ultimo volta ao primeiro, e Shift+Tab no primeiro vai ao ultimo:
    // sem isto o foco escapa para a pagina que ficou atras do modal.
    if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro.focus() }
    else if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo.focus() }
  }

  // Clicar no fundo NAO fecha formulario, de proposito. E facil errar o clique ao
  // lado de um formulario de dez campos, e fechar ali perde tudo o que a pessoa
  // digitou. Para sair: o botao x, o Cancelar, ou o Esc. So janela sem dado a
  // perder (fecharAoClicarFora) fecha no fundo; clique dentro dela nunca fecha.
  return <div className="modal-backdrop"
    onMouseDown={evento => { if (fecharAoClicarFora && evento.target === evento.currentTarget) aoFechar() }}>
    <section
      ref={caixa}
      className={['modal', largo ? 'modal-wide' : '', className ?? ''].filter(Boolean).join(' ')}
      role="dialog" aria-modal="true" aria-label={nomeAcessivel ?? titulo}
      onKeyDown={teclado}>
      <header>
        <div>{etiqueta ? <span className="eyebrow">{etiqueta}</span> : null}<h2>{titulo}</h2></div>
        {acoes ? <div className="heading-actions">{acoes}<BotaoFechar aoFechar={aoFechar}/></div>
          : <BotaoFechar aoFechar={aoFechar}/>}
      </header>
      {children}
    </section>
  </div>
}

function BotaoFechar({ aoFechar }: { aoFechar: () => void }) {
  return <button type="button" aria-label="Fechar" onClick={aoFechar}>×</button>
}

/** Rodape com Cancelar + acao principal, que todo formulario de modal repetia. */
export function AcoesModal({ aoCancelar, children }: { aoCancelar: () => void; children: ReactNode }) {
  return <div className="modal-actions field-wide">
    <button type="button" className="button button-ghost" onClick={aoCancelar}>Cancelar</button>
    {children}
  </div>
}
