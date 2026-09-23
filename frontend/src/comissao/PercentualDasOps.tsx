import { useEffect, useState, type FormEvent } from 'react'
import { LinkOp } from '../components/LinksDeDado'
import { Modal } from '../components/Modal'
import { definirPercentualDaOp, listarPercentuaisDasOps, type PercentualDaOp } from '../dados/comissoes'

const emPorcento = (p: number) => `${String(Math.round(p * 1000) / 10).replace('.', ',')}%`

/**
 * A % de comissao de cada OP do periodo, editavel.
 *
 * Kawa, 22/09/2026: "em certas OPs ele usa 17%, as vezes usa 20%". A % da OP vale
 * para todos os socorristas daquela OP e passa por cima da % de cada um. Vazio,
 * vale a % de cada socorrista, ou o padrao da empresa (Configuracoes).
 */
export function PercentualDasOps({ ids, padrao, aoMudar }: {
  ids: number[]
  /** O padrao da empresa, para dizer o que vale quando a OP nao tem % propria. */
  padrao: number
  aoMudar: () => void
}) {
  const [ops, setOps] = useState<PercentualDaOp[]>([])
  const [editando, setEditando] = useState<PercentualDaOp | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const chave = ids.join(',')

  const carregar = () => listarPercentuaisDasOps(ids).then(setOps).catch((e: Error) => setErro(e.message))
  useEffect(() => { void carregar() }, [chave])

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!editando) return
    const digitado = String(new FormData(evento.currentTarget).get('percentual') || '').trim().replace(',', '.')
    const percentual = digitado ? Number(digitado) / 100 : null
    if (percentual !== null && (!(percentual > 0) || percentual > 0.2)) {
      setErro('A comissão tem que ficar entre 0 e 20%.'); return
    }
    setSalvando(true); setErro('')
    try {
      await definirPercentualDaOp(editando.id, percentual)
      setEditando(null); await carregar(); aoMudar()
    } catch (e) { setErro((e as Error).message) }
    finally { setSalvando(false) }
  }

  if (!ops.length) return null
  return <section className="panel percentual-das-ops" aria-label="Porcentagem da comissão por OP">
    <header className="panel-title"><div>
      <span className="eyebrow">Porcentagem da comissão</span><h2>Por OP deste período</h2>
      <p>A % da OP vale para todos os socorristas dela. Sem % na OP, vale a de cada socorrista ou o padrão da empresa ({emPorcento(padrao)}).</p>
    </div></header>
    {erro && !editando ? <div className="form-alert" role="alert">{erro}</div> : null}
    <div className="table-scroll"><table>
      <thead><tr><th>OP</th><th>Comissão</th><th/></tr></thead>
      <tbody>{ops.map(op => <tr key={op.id}>
        <td><strong><LinkOp numero={op.numero}/></strong></td>
        <td>{op.percentual !== null
          ? <strong>{emPorcento(op.percentual)}</strong>
          : <span className="commission-waiting">Padrão / de cada socorrista</span>}</td>
        <td className="col-acoes"><button className="table-action" onClick={() => { setErro(''); setEditando(op) }}
          aria-label={`Editar a comissão da OP ${op.numero}`}>Editar</button></td>
      </tr>)}</tbody>
    </table></div>

    {editando ? <Modal etiqueta="Comissão da OP" titulo={`OP ${editando.numero}`} aoFechar={() => setEditando(null)}>
      <form onSubmit={salvar} className="form-grid">
        <p className="saida-texto">
          A porcentagem vale para <strong>todos os socorristas desta OP</strong>, por cima da % de cada um.
          A comissão da OP é refeita na hora, e as despesas de comissão dela mudam de valor.
          Deixe vazio para voltar a valer a % de cada socorrista.
        </p>
        <label className="field"><span>Comissão desta OP (%)</span>
          <input name="percentual" type="number" min="0" max="20" step="0.5" inputMode="decimal" autoFocus
            defaultValue={editando.percentual !== null ? String(Math.round(editando.percentual * 1000) / 10) : ''}
            placeholder={`Vazio: padrão (${emPorcento(padrao)})`}/>
          <small>Máximo de 20%.</small>
        </label>
        {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
        <div className="modal-actions">
          <button type="button" className="button button-ghost" onClick={() => setEditando(null)}>Cancelar</button>
          <button className="button button-primary" disabled={salvando}>{salvando ? 'Refazendo a comissão…' : 'Salvar e refazer a comissão'}</button>
        </div>
      </form>
    </Modal> : null}
  </section>
}
