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
  children: ReactNode
}

const FOCAVEIS = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Modal({ titulo, etiqueta, nomeAcessivel, aoFechar, acoes, largo, className, children }: Props) {
  const caixa = useRef<HTMLElement>(null)

  useEffect(() => {
    const anterior = document.activeElement
    caixa.current?.querySelector<HTMLElement>(FOCAVEIS)?.focus()
    return () => { if (anterior instanceof HTMLElement) anterior.focus() }
  }, [])

  function teclado(evento: React.KeyboardEvent) {
    if (evento.key === 'Escape') { evento.stopPropagation(); aoFechar(); return }
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

  return <div className="modal-backdrop"
    onPointerDown={evento => { if (evento.target === evento.currentTarget) aoFechar() }}>
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
