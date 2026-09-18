import { Carregando, Vazio } from '../../components/EstadoPagina'
import type { LancamentoFinanceiro } from '../../types/modelos'
import { data, moeda } from '../../utils/formatadores'

type Props = {
  itens: LancamentoFinanceiro[]
  carregando: boolean
  aoPagar: (item: LancamentoFinanceiro) => void
}

export function TabelaExtrato({ itens, carregando, aoPagar }: Props) {
  if (carregando) return <Carregando card />
  if (!itens.length) {
    return <Vazio titulo="Nenhum lançamento"
      descricao="O backend não possui movimentos nesta competência."/>
  }
  return <div className="table-scroll">
    <table>
      <thead><tr>
        <th>Data financeira</th><th>Descrição</th><th>Categoria</th><th>Veículo</th>
        <th>Situação</th><th>Valor</th><th/>
      </tr></thead>
      <tbody>
        {itens.map(item => {
          const receita = item.tipo === 'RECEITA'
          // Despesa ja rejeitada nao volta a ser pagavel: o botao sumiria de
          // qualquer forma no backend, e mostra-lo so gera erro na cara da pessoa.
          const podePagar = !receita && !item.realizado && item.status !== 'REJEITADO'
          return <tr key={item.id}>
            <td>{data(item.data)}</td>
            <td>
              <strong>{item.descricao}</strong>
              <small>{item.origem}{item.protocolo ? ` · ${item.protocolo}` : ''}</small>
            </td>
            <td>{item.categoria}</td>
            <td>{item.veiculo ?? '—'}</td>
            <td>
              <span className={`ledger-status ${item.realizado ? 'ledger-recebido' : 'ledger-pendente'}`}>
                {item.realizado ? (receita ? 'Recebido' : 'Pago') : 'Previsto'}
              </span>
            </td>
            <td className={receita ? 'positive' : 'negative'}>
              <strong>{receita ? '+' : '−'} {moeda(item.valor)}</strong>
            </td>
            <td>
              {podePagar
                ? <button className="table-action" onClick={() => aoPagar(item)}>Registrar pagamento</button>
                : null}
            </td>
          </tr>
        })}
      </tbody>
    </table>
  </div>
}
