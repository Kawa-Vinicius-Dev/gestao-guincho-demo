import { Vazio } from '../../components/EstadoPagina'
import type { OrdemPagamentoPorto } from '../../types/modelos'
import { moeda } from '../../utils/formatadores'
import { rotulo } from './opcoes'

/**
 * A OP chega paga.
 *
 * O relatorio da Porto so e emitido depois do pagamento, entao "confirmar
 * recebimento" era um passo que nunca dizia nao — e um botao que so tem um
 * caminho nao e uma decisao, e sim trabalho. Corrigir valor ou data continua
 * possivel pelo detalhe da OP, para o caso de erro. Pelo mesmo motivo a
 * tabela nao tem "valor recebido" nem "recebida em": repetiam o valor e a
 * data da propria OP.
 */
type Props = {
  itens: OrdemPagamentoPorto[]
  aoAbrirDetalhe: (id: number) => void
}

export function TabelaOps({ itens, aoAbrirDetalhe }: Props) {
  if (!itens.length) {
    return <Vazio titulo="Nenhuma OP" descricao="Importe a Previsão a Receber ou ajuste os filtros."/>
  }
  return <div className="table-scroll">
    <table>
      <thead><tr>
        <th>Número da OP</th><th>Período</th><th>OS vinculadas</th>
        <th>Valor previsto</th><th>Soma das OS</th><th>Diferença</th><th>Conciliação</th>
      </tr></thead>
      <tbody>
        {itens.map(op => <tr key={op.id}>
          <td>
            <button className="table-action" onClick={() => aoAbrirDetalhe(op.id)}>
              <strong>{op.numero}</strong>
            </button>
          </td>
          <td>{op.periodoFinanceiro || <span className="empty-inline">Sem período</span>}</td>
          <td>{op.quantidadeOrdensServico ?? 0}</td>
          <td>{moeda(op.valorTotal)}</td>
          <td>{moeda(op.valorOrdensServico ?? 0)}</td>
          <td>{moeda(op.divergencia ?? 0)}</td>
          <td><span className="ledger-status ledger-pendente">{rotulo(op.statusConciliacao)}</span></td>
        </tr>)}
      </tbody>
    </table>
  </div>
}
