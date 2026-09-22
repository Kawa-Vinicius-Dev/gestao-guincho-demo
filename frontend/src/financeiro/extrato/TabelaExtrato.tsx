import { Link } from 'react-router-dom'
import { Carregando, Vazio } from '../../components/EstadoPagina'
import type { LancamentoFinanceiro } from '../../types/modelos'
import { data, moeda } from '../../utils/formatadores'

type Props = {
  itens: LancamentoFinanceiro[]
  carregando: boolean
  aoPagar: (item: LancamentoFinanceiro) => void
  /** So para receita lancada a mao; a da Porto nao se edita. */
  aoEditarReceita?: (item: LancamentoFinanceiro) => void
  aoExcluirReceita?: (item: LancamentoFinanceiro) => void
}

export function TabelaExtrato({ itens, carregando, aoPagar, aoEditarReceita, aoExcluirReceita }: Props) {
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
          const receitaManual = receita && item.origem === 'MANUAL'
          return <tr key={item.id}>
            <td>{data(item.data)}</td>
            <td>
              <strong><Descricao item={item}/></strong>
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
              {receitaManual && aoEditarReceita && aoExcluirReceita
                ? <span className="acoes-da-linha">
                  <button className="table-action" onClick={() => aoEditarReceita(item)}>Editar</button>
                  <button className="table-action table-action-danger" onClick={() => aoExcluirReceita(item)}>Excluir</button>
                </span>
                : null}
            </td>
          </tr>
        })}
      </tbody>
    </table>
  </div>
}

/**
 * A comissao que o sistema lanca diz de quem e e de qual OP, e o nome leva a
 * ficha do socorrista, onde a comissao dele esta aberta por servico. Sem isso,
 * o extrato tinha uma linha "Comissao de socorrista" por pessoa, todas iguais.
 */
function Descricao({ item }: { item: LancamentoFinanceiro }) {
  if (!item.numeroOp || !item.motoristaId) return <>{item.descricao}</>
  return <>
    <Link className="extrato-socorrista" to={`/equipe/${item.motoristaId}`}
      title="Abrir a comissão deste socorrista">{item.motorista ?? 'Socorrista'}</Link>
    {` — comissão da OP ${item.numeroOp}`}
  </>
}
