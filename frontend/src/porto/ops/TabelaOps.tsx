import { Vazio } from '../../components/EstadoPagina'
import type { OrdemPagamentoPorto } from '../../types/modelos'
import { moeda } from '../../utils/formatadores'
import { data, rotulo } from './opcoes'

type Props = {
  itens: OrdemPagamentoPorto[]
  aoAbrirDetalhe: (id: number) => void
  aoReceber: (op: OrdemPagamentoPorto) => void
}

export function TabelaOps({ itens, aoAbrirDetalhe, aoReceber }: Props) {
  if (!itens.length) {
    return <Vazio titulo="Nenhuma OP" descricao="Importe a Previsão a Receber ou ajuste os filtros."/>
  }
  return <div className="table-scroll">
    <table>
      <thead><tr>
        <th>Número da OP</th><th>Quinzena</th><th>Data programada</th><th>OS vinculadas</th>
        <th>Valor previsto</th><th>Soma das OS</th><th>Diferença</th><th>Conciliação</th>
        <th>Recebimento</th><th>Valor recebido</th><th>Data recebida</th><th/>
      </tr></thead>
      <tbody>
        {itens.map(op => <tr key={op.id}>
          <td>
            <button className="table-action" onClick={() => aoAbrirDetalhe(op.id)}>
              <strong>{op.numero}</strong>
            </button>
          </td>
          <td>{op.periodoFinanceiro || <span className="empty-inline">Sem quinzena</span>}</td>
          <td>{data(op.dataPagamentoProgramada)}</td>
          <td>{op.quantidadeOrdensServico ?? 0}</td>
          <td>{moeda(op.valorTotal)}</td>
          <td>{moeda(op.valorOrdensServico ?? 0)}</td>
          <td>{moeda(op.divergencia ?? 0)}</td>
          <td><span className="ledger-status ledger-pendente">{rotulo(op.statusConciliacao)}</span></td>
          <td>{rotulo(op.situacao)}</td>
          <td>{op.valorRecebido == null ? '—' : moeda(op.valorRecebido)}</td>
          <td>{data(op.dataRecebimento)}</td>
          <td>
            {op.situacao !== 'RECEBIDO'
              ? <button className="table-action" onClick={() => aoReceber(op)}>Confirmar recebimento</button>
              : null}
          </td>
        </tr>)}
      </tbody>
    </table>
  </div>
}
