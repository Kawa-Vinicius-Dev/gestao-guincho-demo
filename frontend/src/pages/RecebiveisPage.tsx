import { useMemo, useState } from 'react'
import { useDemo } from '../demo/DemoContext'
import { data, moeda } from '../utils/formatadores'

export default function RecebiveisPage() {
  const { state, atualizarStatusLancamento } = useDemo()
  const [mes, setMes] = useState('2026-07')
  const itens = useMemo(() => state.lancamentos
    .filter(item => item.tipo === 'RECEITA' && item.status === 'A_RECEBER' && item.data.startsWith(mes))
    .sort((a, b) => a.data.localeCompare(b.data)), [state.lancamentos, mes])
  const total = itens.reduce((soma, item) => soma + item.valor, 0)
  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Carteira de recebíveis</span><h1>Contas a receber</h1><p>Acompanhe o que já foi faturado, mas ainda não entrou no caixa.</p></div><div className="heading-total"><span>Total pendente</span><strong>{moeda(total)}</strong></div></header>
    <section className="panel"><div className="ledger-filters"><label><span>Competência</span><input type="month" value={mes} onChange={evento => setMes(evento.target.value)}/></label></div>
      <div className="table-scroll"><table><thead><tr><th>Data</th><th>Descrição</th><th>Protocolo</th><th>Veículo</th><th>Origem</th><th>Valor</th><th/></tr></thead>
        <tbody>{itens.map(item => <tr key={item.id}><td>{data(item.data)}</td><td><strong>{item.descricao}</strong><small>{item.categoria}</small></td><td>{item.protocolo ?? '—'}</td><td>{state.veiculos.find(veiculo => veiculo.id === item.veiculoId)?.codigo ?? '—'}</td><td>{item.origem}</td><td><strong>{moeda(item.valor)}</strong></td><td><button className="table-action" onClick={() => atualizarStatusLancamento(item.id, 'RECEBIDO')}>Marcar como recebido</button></td></tr>)}</tbody>
      </table></div>{!itens.length ? <div className="compact-empty"><strong>Nenhum valor pendente</strong><span>Os recebíveis deste período já foram liquidados.</span></div> : null}</section>
  </div>
}
