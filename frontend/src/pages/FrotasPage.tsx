import { useMemo, useState, type FormEvent } from 'react'
import { resultadoPorVeiculo } from '../demo/calculos'
import { useDemo } from '../demo/DemoContext'
import { data, moeda, numero } from '../utils/formatadores'

const rotulosStatus = { SAUDAVEL: 'Saudável', MONITORAR: 'Monitorar', ATENCAO_KM: 'Km morto alto', PREJUIZO: 'Prejuízo' }

export default function FrotasPage() {
  const { state, adicionarVeiculo } = useDemo()
  const [mes, setMes] = useState('2026-07')
  const [selecionado, setSelecionado] = useState(1)
  const [modal, setModal] = useState(false)
  const resultados = useMemo(() => resultadoPorVeiculo(state, mes), [state, mes])
  const resultado = resultados.find(item => item.veiculo.id === selecionado) ?? resultados[0]
  const gastoFrota = resultados.reduce((soma, item) => soma + item.despesas, 0)
  const historico = state.lancamentos.filter(item => item.veiculoId === resultado?.veiculo.id && item.data.startsWith(mes)).sort((a, b) => b.data.localeCompare(a.data))
  const consumo = resultado?.litros ? resultado.kmRodado / resultado.litros : 0

  function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const form = new FormData(evento.currentTarget)
    adicionarVeiculo({
      codigo: String(form.get('codigo')).toUpperCase(),
      placa: String(form.get('placa')).toUpperCase(),
      modelo: String(form.get('modelo')),
      status: 'ATIVO',
      quilometragemAtual: Number(form.get('quilometragemAtual')),
      custoPorKm: Number(form.get('custoPorKm')),
      metaReceita: Number(form.get('metaReceita')),
      metaKmMorto: Number(form.get('metaKmMorto')),
      metaMargem: Number(form.get('metaMargem')),
    })
    setModal(false)
  }

  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Ativos operacionais</span><h1>Frota e custos</h1><p>Compare receita, gastos e eficiência de cada veículo em um único lugar.</p></div>
      <div className="heading-actions"><label className="month-picker"><span>Competência</span><input type="month" value={mes} onChange={evento => setMes(evento.target.value)}/></label><button className="button button-primary" onClick={() => setModal(true)}>+ Cadastrar veículo</button></div></header>
    <section className="fleet-summary"><div><span>Gasto total da frota</span><strong>{moeda(gastoFrota)}</strong><small>No período selecionado</small></div>
      <div><span>Frota disponível</span><strong>{state.veiculos.filter(item => item.status === 'ATIVO').length}/{state.veiculos.length}</strong><small>Veículos ativos</small></div>
      <div><span>Melhor margem</span><strong>{Math.max(...resultados.map(item => item.margem), 0).toFixed(1)}%</strong><small>Entre veículos com receita</small></div></section>

    <section className="fleet-layout">
      <aside className="fleet-list" aria-label="Lista de veículos">{resultados.map(item => <button key={item.veiculo.id} className={item.veiculo.id === resultado?.veiculo.id ? 'active' : ''} onClick={() => setSelecionado(item.veiculo.id)}>
        <span className="vehicle-monogram">{item.veiculo.codigo}</span><span><strong>{item.veiculo.modelo}</strong><small>{item.veiculo.placa} · {item.veiculo.status === 'ATIVO' ? 'Ativo' : item.veiculo.status === 'MANUTENCAO' ? 'Em manutenção' : 'Inativo'}</small></span>
        <span><strong className={item.lucro >= 0 ? 'positive' : 'negative'}>{moeda(item.lucro)}</strong><small>{item.margem.toFixed(1)}% margem</small></span>
      </button>)}</aside>

      {resultado ? <div className="fleet-detail">
        <article className="vehicle-hero"><div><span className="eyebrow">{resultado.veiculo.placa}</span><h2>{resultado.veiculo.codigo} · {resultado.veiculo.modelo}</h2><p>Hodômetro atual: {numero(resultado.veiculo.quilometragemAtual)} km</p></div>
          <span className={`vehicle-status status-${resultado.status.toLowerCase()}`}>{rotulosStatus[resultado.status]}</span></article>
        <div className="vehicle-metrics">
          <article><span>Receita</span><strong>{moeda(resultado.receita)}</strong><small>{resultado.veiculo.metaReceita ? `${Math.min(100, (resultado.receita / resultado.veiculo.metaReceita) * 100).toFixed(0)}% da meta` : 'Veículo de apoio'}</small></article>
          <article><span>Despesas</span><strong>{moeda(resultado.despesas)}</strong><small>Custo vinculado</small></article>
          <article className="focus"><span>Lucro</span><strong>{moeda(resultado.lucro)}</strong><small>{resultado.margem.toFixed(1)}% de margem</small></article>
          <article><span>Consumo médio</span><strong>{consumo ? `${consumo.toFixed(1)} km/l` : '—'}</strong><small>{numero(resultado.litros)} litros lançados</small></article>
        </div>
        <article className="panel cost-breakdown"><header className="panel-title"><div><span className="eyebrow">Raio-x de custos</span><h2>Para onde foi o dinheiro</h2></div></header>
          <div className="cost-grid">
            <div><span>Combustível</span><strong>{moeda(resultado.combustivel)}</strong></div>
            <div><span>Manutenção</span><strong>{moeda(resultado.manutencao)}</strong></div>
            <div><span>Seguro</span><strong>{moeda(resultado.seguro)}</strong></div>
            <div><span>Parcela</span><strong>{moeda(resultado.parcela)}</strong></div>
            <div className={resultado.percentualKmMorto > resultado.veiculo.metaKmMorto ? 'danger' : ''}><span>Km morto</span><strong>{moeda(resultado.custoKmMorto)}</strong><small>{resultado.percentualKmMorto.toFixed(1)}% do percurso</small></div>
          </div>
        </article>
        <article className="panel vehicle-history"><header className="panel-title"><div><span className="eyebrow">Auditoria individual</span><h2>Histórico financeiro</h2></div></header>
          <div className="table-scroll"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Origem</th><th>Valor</th></tr></thead><tbody>{historico.map(item => <tr key={item.id}><td>{data(item.data)}</td><td><strong>{item.descricao}</strong></td><td>{item.categoria}</td><td>{item.origem}</td><td className={item.tipo === 'RECEITA' ? 'positive' : 'negative'}>{item.tipo === 'RECEITA' ? '+' : '−'} {moeda(item.valor)}</td></tr>)}</tbody></table></div>
        </article>
      </div> : null}
    </section>

    {modal ? <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Frota</span><h2>Novo veículo</h2></div><button aria-label="Fechar" onClick={() => setModal(false)}>×</button></header>
      <form onSubmit={salvar} className="form-grid two-columns">
        <label className="field"><span>Identificador</span><input name="codigo" placeholder="G-04" required/></label><label className="field"><span>Placa</span><input name="placa" placeholder="ABC-1D23" required/></label>
        <label className="field field-wide"><span>Modelo</span><input name="modelo" placeholder="Marca e modelo" required/></label>
        <label className="field"><span>Quilometragem atual</span><input name="quilometragemAtual" type="number" min="0" required/></label><label className="field"><span>Custo por km</span><input name="custoPorKm" type="number" min="0" step=".01" required/></label>
        <label className="field"><span>Meta de receita</span><input name="metaReceita" type="number" min="0" defaultValue="18000" required/></label><label className="field"><span>Meta máx. de km morto (%)</span><input name="metaKmMorto" type="number" min="0" max="100" defaultValue="12" required/></label>
        <label className="field"><span>Meta de margem (%)</span><input name="metaMargem" type="number" min="0" max="100" defaultValue="30" required/></label>
        <div className="modal-actions field-wide"><button type="button" className="button button-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary">Salvar veículo</button></div>
      </form></section></div> : null}
  </div>
}
