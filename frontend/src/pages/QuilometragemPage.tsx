import { useMemo, useState, type FormEvent } from 'react'
import { useDemo } from '../demo/DemoContext'
import { noMes, resultadoPorVeiculo } from '../demo/calculos'
import { data, moeda, numero } from '../utils/formatadores'

export default function QuilometragemPage() {
  const { state, adicionarQuilometragem } = useDemo()
  const [mes, setMes] = useState('2026-07')
  const [modal, setModal] = useState(false)
  const [simulacao, setSimulacao] = useState({ veiculoId: 1, kmRodado: 0, kmMorto: 0 })
  const resultados = useMemo(() => resultadoPorVeiculo(state, mes).filter(item => item.kmRodado > 0), [state, mes])
  const registros = state.quilometragens.filter(item => noMes(item.data, mes)).sort((a, b) => b.data.localeCompare(a.data))
  const kmRodado = registros.reduce((soma, item) => soma + item.kmRodado, 0)
  const kmMorto = registros.reduce((soma, item) => soma + item.kmMorto, 0)
  const custo = registros.reduce((soma, item) => soma + item.kmMorto * item.custoPorKm, 0)
  const percentual = kmRodado ? (kmMorto / kmRodado) * 100 : 0
  const veiculoSimulado = state.veiculos.find(item => item.id === simulacao.veiculoId)
  const custoSimulado = simulacao.kmMorto * (veiculoSimulado?.custoPorKm ?? 0)

  function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const form = new FormData(evento.currentTarget)
    const veiculoId = Number(form.get('veiculoId'))
    adicionarQuilometragem({
      veiculoId,
      funcionarioId: form.get('funcionarioId') ? Number(form.get('funcionarioId')) : undefined,
      data: String(form.get('data')),
      kmRodado: Number(form.get('kmRodado')),
      kmMorto: Number(form.get('kmMorto')),
      custoPorKm: state.veiculos.find(item => item.id === veiculoId)?.custoPorKm ?? 0,
      motivo: String(form.get('motivo')),
    })
    setModal(false)
  }

  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Eficiência operacional</span><h1>Km rodado e km morto</h1><p>Veja a distância que move a operação e a distância que consome margem sem faturar.</p></div>
      <div className="heading-actions"><label className="month-picker"><span>Competência</span><input type="month" value={mes} onChange={evento => setMes(evento.target.value)}/></label><button className="button button-primary" onClick={() => setModal(true)}>+ Registrar quilometragem</button></div></header>

    <section className="km-definitions">
      <article><span className="km-symbol paid">KM</span><div><strong>Km rodado</strong><p>Toda a quilometragem percorrida pelo veículo no período, com ou sem faturamento.</p></div></article>
      <article><span className="km-symbol dead">0</span><div><strong>Km morto</strong><p>Deslocamento vazio, retorno após serviço ou qualquer percurso sem faturamento direto.</p></div></article>
    </section>

    <section className="km-overview">
      <div><span>Km rodado</span><strong>{numero(kmRodado)} km</strong><small>100% do percurso</small></div>
      <div className={percentual > 15 ? 'danger' : ''}><span>Km morto</span><strong>{numero(kmMorto)} km</strong><small>{percentual.toFixed(1)}% do percurso</small></div>
      <div><span>Custo improdutivo</span><strong>{moeda(custo)}</strong><small>Km morto × custo por km</small></div>
    </section>

    <section className="panel km-vehicles"><header className="panel-title"><div><span className="eyebrow">Comparativo</span><h2>Eficiência por veículo</h2></div><span className="target-note">Meta recomendada: até 15%</span></header>
      <div className="km-comparison">{resultados.map(item => {
        const limite = item.veiculo.metaKmMorto
        const alto = item.percentualKmMorto > limite
        return <article key={item.veiculo.id} className={alto ? 'danger' : ''}>
          <header><span><strong>{item.veiculo.codigo}</strong><small>{item.veiculo.modelo}</small></span><strong>{item.percentualKmMorto.toFixed(1)}%</strong></header>
          <div className="km-scale"><span style={{ width: `${Math.min(100, item.percentualKmMorto * 3)}%` }}/><i style={{ left: `${limite * 3}%` }}/></div>
          <footer><span>{numero(item.kmMorto)} km mortos</span><strong>{moeda(item.custoKmMorto)}</strong></footer>
          {alto ? <p>Acima da meta em {(item.percentualKmMorto - limite).toFixed(1)} p.p.</p> : <p>Dentro da meta operacional</p>}
        </article>
      })}</div>
    </section>

    <section className="panel km-ledger"><header className="panel-title"><div><span className="eyebrow">Diário de bordo</span><h2>Registros do período</h2></div></header>
      <div className="table-scroll"><table><thead><tr><th>Data</th><th>Veículo</th><th>Funcionário</th><th>Km rodado</th><th>Km morto</th><th>Custo/km</th><th>Custo total</th><th>Motivo</th></tr></thead>
        <tbody>{registros.map(item => <tr key={item.id}><td>{data(item.data)}</td><td><strong>{state.veiculos.find(veiculo => veiculo.id === item.veiculoId)?.codigo}</strong></td><td>{state.funcionarios.find(funcionario => funcionario.id === item.funcionarioId)?.nome ?? '—'}</td><td>{numero(item.kmRodado)} km</td><td className={(item.kmMorto / item.kmRodado) * 100 > 15 ? 'negative' : ''}><strong>{numero(item.kmMorto)} km</strong></td><td>{moeda(item.custoPorKm)}</td><td>{moeda(item.kmMorto * item.custoPorKm)}</td><td>{item.motivo}</td></tr>)}</tbody>
      </table></div>
    </section>

    {modal ? <div className="modal-backdrop"><section className="modal modal-wide" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Diário de bordo</span><h2>Registrar quilometragem</h2></div><button aria-label="Fechar" onClick={() => setModal(false)}>×</button></header>
      <form onSubmit={salvar} className="form-grid three-columns">
        <label className="field"><span>Data</span><input name="data" type="date" defaultValue="2026-07-24" required/></label>
        <label className="field"><span>Veículo</span><select name="veiculoId" value={simulacao.veiculoId} onChange={evento => setSimulacao(atual => ({ ...atual, veiculoId: Number(evento.target.value) }))}>{state.veiculos.map(item => <option value={item.id} key={item.id}>{item.codigo} · {item.modelo}</option>)}</select></label>
        <label className="field"><span>Funcionário</span><select name="funcionarioId"><option value="">Não informado</option>{state.funcionarios.map(item => <option value={item.id} key={item.id}>{item.nome}</option>)}</select></label>
        <label className="field"><span>Km rodado</span><input name="kmRodado" type="number" min="0.01" step=".01" required onChange={evento => setSimulacao(atual => ({ ...atual, kmRodado: Number(evento.target.value) }))}/></label>
        <label className="field"><span>Km morto</span><input name="kmMorto" type="number" min="0" step=".01" max={simulacao.kmRodado || undefined} required onChange={evento => setSimulacao(atual => ({ ...atual, kmMorto: Number(evento.target.value) }))}/></label>
        <label className="field"><span>Custo por km</span><input value={veiculoSimulado?.custoPorKm ?? 0} readOnly/></label>
        <div className="calculation-preview field-wide"><div><span>Percentual de km morto</span><strong>{simulacao.kmRodado ? ((simulacao.kmMorto / simulacao.kmRodado) * 100).toFixed(1) : 0}%</strong></div><div><span>Custo calculado</span><strong>{moeda(custoSimulado)}</strong></div><div><span>Fórmula</span><strong className="formula-small">km morto × custo/km</strong></div></div>
        <label className="field field-wide"><span>Motivo ou observação</span><textarea name="motivo" rows={3} placeholder="Ex.: retorno vazio após atendimento fora da área" required/></label>
        <div className="modal-actions field-wide"><button type="button" className="button button-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary">Salvar e lançar custo</button></div>
      </form>
    </section></div> : null}
  </div>
}
