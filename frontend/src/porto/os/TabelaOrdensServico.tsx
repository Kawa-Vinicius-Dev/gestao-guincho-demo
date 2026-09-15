import { useState, type FormEvent } from 'react'
import { Vazio } from '../../components/EstadoPagina'
import type { OrdemServicoPorto } from '../../types/modelos'
import { moeda } from '../../utils/formatadores'
import { data, rotulo } from '../ops/opcoes'
import { mesmaPessoa } from './opcoes'

type Props = {
  itens: OrdemServicoPorto[]
  aoAssociar: (ordem: OrdemServicoPorto, motoristaId: number) => void
  aoInformarValor: (ordem: OrdemServicoPorto, valor: number) => Promise<void>
}

export function TabelaOrdensServico({ itens, aoAssociar, aoInformarValor }: Props) {
  if (!itens.length) {
    return <Vazio titulo="Nenhuma OS" descricao="Cole serviços da Porto ou ajuste os filtros."/>
  }
  return <div className="table-scroll porto-os-table">
    <table>
      <thead><tr>
        <th>OS</th><th>OP</th><th>Seguradora</th><th>Especialidade</th><th>Viatura</th>
        <th>Socorrista</th><th>Atendimento</th><th>Previsão original</th><th>Ciclo efetivo</th>
        <th>Valor</th><th>Operacional</th><th>Financeiro</th>
      </tr></thead>
      <tbody>
        {itens.map(os => <tr key={os.id}>
          <td>
            <strong>{os.numero}</strong>
            {!os.qra?.trim() ? <span className="porto-qra-ausente">Sem QRA</span> : null}
            {os.atrasadaNoCiclo ? <span className="porto-qra-ausente">Passou do ciclo</span> : null}
          </td>
          <td>{os.ordemPagamento || '—'}</td>
          <td>{os.seguradora || '—'}</td>
          <td>{os.especialidade || '—'}</td>
          <td>{os.viatura || 'Sem viatura'}</td>
          <td className="porto-socorrista"><CelulaSocorrista ordem={os} aoAssociar={aoAssociar}/></td>
          <td>{data(os.dataAtendimento)}</td>
          <td>{data(os.dataPrevistaOriginal)}</td>
          <td>
            {data(os.dataEfetivaPagamento)}
            {os.ciclosAtraso ? <small>{os.ciclosAtraso} ciclo(s) depois</small> : null}
          </td>
          <td><CelulaValor ordem={os} aoInformar={aoInformarValor}/></td>
          <td>{rotulo(os.statusOperacional)}</td>
          <td>{rotulo(os.statusFinanceiro)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>
}

/**
 * O painel diario nao traz valor: o servico entra com zero. Quem opera sabe
 * quanto vale e preenche aqui, na propria linha — sao dezenas de servicos por
 * dia, e um modal por linha inviabilizaria o trabalho.
 *
 * Servico ja pago nao edita: ali o valor e o que a OP trouxe.
 */
function CelulaValor(
  { ordem, aoInformar }: { ordem: OrdemServicoPorto; aoInformar: Props['aoInformarValor'] },
) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)

  if (ordem.statusFinanceiro === 'RECEBIDO') return <>{moeda(ordem.valorTotal)}</>

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const numero = Number(valor.replace(',', '.'))
    if (!Number.isFinite(numero) || numero < 0) return
    setSalvando(true)
    try { await aoInformar(ordem, numero); setEditando(false) } finally { setSalvando(false) }
  }

  if (!editando) {
    return <button className="table-action" onClick={() => { setValor(String(ordem.valorTotal || '')); setEditando(true) }}>
      {ordem.valorTotal > 0 ? moeda(ordem.valorTotal) : 'Informar valor'}
    </button>
  }
  return <form className="porto-valor-inline" onSubmit={salvar}>
    <input type="number" step="0.01" min="0" value={valor} autoFocus disabled={salvando}
      aria-label={`Valor da OS ${ordem.numero}`}
      onChange={evento => setValor(evento.target.value)}
      onKeyDown={evento => { if (evento.key === 'Escape') setEditando(false) }}/>
    <button type="submit" className="table-action" disabled={salvando}>
      {salvando ? '…' : 'Salvar'}
    </button>
  </form>
}

function CelulaSocorrista({ ordem, aoAssociar }: { ordem: OrdemServicoPorto; aoAssociar: Props['aoAssociar'] }) {
  return <>
    <strong>{ordem.motorista || ordem.socorrista || '—'}</strong>
    <small>{ordem.qra || 'Sem QRA'}</small>
    {ordem.motorista && !mesmaPessoa(ordem.socorrista, ordem.motorista)
      ? <small className="porto-divergencia">Porto: {ordem.socorrista}</small>
      : null}
    {ordem.motorista
      ? <button className="table-action" onClick={() => aoAssociar(ordem, ordem.motoristaId ?? 0)}>
          Alterar
        </button>
      : <button className="table-action table-action-danger"
          onClick={() => aoAssociar(ordem, ordem.sugestaoMotoristaId ?? 0)}>
          Associar socorrista
        </button>}
  </>
}
