import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'

/**
 * Confirmacao de exclusao, a mesma em toda tela.
 *
 * Diz o que vai sair, com os dados que identificam o registro, porque confirmar
 * sem ver qual e um chute. A janela so fecha quando a exclusao da certo: se o
 * banco recusar (um cadastro em uso, por exemplo), o motivo aparece aqui dentro,
 * onde a pessoa esta olhando.
 */
export function ConfirmarExclusao({ coisa, nome, aviso, resumo = [], aoConfirmar, aoFechar }: {
  /** "despesa fixa", "viatura", "socorrista"... */
  coisa: string
  nome: string
  aviso: string
  resumo?: [string, ReactNode][]
  aoConfirmar: () => Promise<void>
  aoFechar: () => void
}) {
  const [apagando, setApagando] = useState(false)
  const [erro, setErro] = useState('')

  async function confirmar() {
    setApagando(true); setErro('')
    try { await aoConfirmar(); aoFechar() }
    catch (e) { setErro((e as Error).message) }
    finally { setApagando(false) }
  }

  return <Modal etiqueta="Ação irreversível" titulo={`Excluir ${coisa}?`} className="confirmar-exclusao" fecharAoClicarFora
    nomeAcessivel={`Excluir ${coisa} ${nome}`} aoFechar={() => { if (!apagando) aoFechar() }}>
    <p className="saida-texto">{aviso} Não dá para desfazer.</p>
    {resumo.length
      ? <dl className="confirmar-exclusao-resumo">
          {resumo.map(([rotulo, valor]) => <div key={rotulo}><dt>{rotulo}</dt><dd>{valor}</dd></div>)}
        </dl>
      : null}
    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
    <div className="modal-actions">
      <button type="button" className="button button-ghost" disabled={apagando} onClick={aoFechar}>Manter</button>
      <button type="button" className="button button-danger" disabled={apagando} onClick={() => void confirmar()}>
        {apagando ? 'Excluindo…' : `Excluir ${coisa}`}
      </button>
    </div>
  </Modal>
}
