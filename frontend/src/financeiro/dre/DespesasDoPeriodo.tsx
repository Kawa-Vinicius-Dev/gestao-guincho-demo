import { LinkSocorrista, LinkViatura } from '../../components/LinksDeDado'
import type { LancamentoFinanceiro } from '../../types/modelos'
import { data, moeda } from '../../utils/formatadores'
import './dre.css'

/**
 * Todas as despesas do periodo, uma por uma.
 *
 * Kawa, 23/09/2026: filtrando um dia, "quero todos os servicos e todas as
 * despesas nesse dia". Lista pela data do lancamento, paga ou nao; a rejeitada
 * fica de fora, porque nao e custo da empresa.
 */
export function DespesasDoPeriodo({ lancamentos }: { lancamentos: LancamentoFinanceiro[] }) {
  const despesas = lancamentos
    .filter(l => l.tipo === 'DESPESA' && l.status !== 'REJEITADO')
    .sort((a, b) => a.data.localeCompare(b.data) || b.valor - a.valor)
  const total = despesas.reduce((t, d) => t + d.valor, 0)
  const pagas = despesas.filter(d => d.realizado).reduce((t, d) => t + d.valor, 0)

  return <section className="panel dre-sem-valor" aria-label="Despesas do período">
    <header className="panel-title">
      <div><span className="eyebrow">Despesas lançadas no período</span>
        <h2>{despesas.length} {despesas.length === 1 ? 'despesa' : 'despesas'}</h2></div>
      {despesas.length ? <p className="servicos-resumo"><strong>{moeda(total)}</strong>
        {pagas !== total ? <> · {moeda(pagas)} pagas</> : null}</p> : null}
    </header>
    {!despesas.length ? <p className="empty-inline">Nenhuma despesa lançada neste período.</p>
      : <div className="table-scroll"><table>
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Viatura</th><th>Socorrista</th><th>Situação</th><th className="th-numero">Valor</th></tr></thead>
        <tbody>{despesas.map(d => <tr key={d.id}>
          <td>{data(d.data)}</td>
          <td><strong>{d.descricao}</strong></td>
          <td>{d.categoria}</td>
          <td><LinkViatura id={d.veiculoId} sigla={d.veiculo}/></td>
          <td><LinkSocorrista id={d.motoristaId} nome={d.motorista}/></td>
          <td>{d.realizado ? 'Paga' : 'A pagar'}</td>
          <td className="col-numero"><strong>{moeda(d.valor)}</strong></td>
        </tr>)}</tbody>
      </table></div>}
  </section>
}
