import { useState, type ComponentProps, type ReactNode } from 'react'
import { Modal } from './Modal'

/**
 * "Tem certeza?" antes de toda acao importante.
 *
 * Kawa: "todas as coisas importantes no sistema precisam ter essa verificacao",
 * dizendo o que vai acontecer. A janela explica o efeito em linguagem simples,
 * mostra os dados que identificam o que muda e so fecha quando a acao da certo:
 * se falhar, o motivo aparece aqui dentro, onde a pessoa esta olhando.
 */
export function ConfirmarAcao({
  titulo, efeito, resumo = [], avisos = [], textoConfirmar, perigo = false, aoConfirmar, aoFechar,
}: {
  titulo: string
  /** O que vai acontecer, em uma ou duas frases. */
  efeito: ReactNode
  resumo?: [string, ReactNode][]
  /** Pontos que merecem atencao antes de confirmar. */
  avisos?: ReactNode[]
  textoConfirmar: string
  perigo?: boolean
  aoConfirmar: () => Promise<void> | void
  aoFechar: () => void
}) {
  const [executando, setExecutando] = useState(false)
  const [erro, setErro] = useState('')

  async function confirmar() {
    setExecutando(true); setErro('')
    try { await aoConfirmar(); aoFechar() }
    catch (e) { setErro((e as Error).message) }
    finally { setExecutando(false) }
  }

  return <Modal etiqueta="Confirmação" titulo={titulo} className="confirmar-exclusao" fecharAoClicarFora
    aoFechar={() => { if (!executando) aoFechar() }}>
    <p className="saida-texto">{efeito}</p>
    {resumo.length
      ? <dl className="confirmar-exclusao-resumo">
          {resumo.map(([rotulo, valor]) => <div key={rotulo}><dt>{rotulo}</dt><dd>{valor}</dd></div>)}
        </dl>
      : null}
    {avisos.filter(Boolean).length
      ? <ul className="confirmar-avisos">{avisos.filter(Boolean).map((aviso, i) => <li key={i}>{aviso}</li>)}</ul>
      : null}
    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
    <div className="modal-actions">
      <button type="button" className="button button-ghost" disabled={executando} onClick={aoFechar}>Voltar</button>
      <button type="button" className={perigo ? 'button button-danger' : 'button button-primary'} disabled={executando}
        onClick={() => void confirmar()}>
        {executando ? 'Aguarde…' : textoConfirmar}
      </button>
    </div>
  </Modal>
}

/** O que uma tela guarda para abrir a confirmacao depois do clique. */
export type PedidoConfirmacao = Omit<ComponentProps<typeof ConfirmarAcao>, 'aoFechar'>
