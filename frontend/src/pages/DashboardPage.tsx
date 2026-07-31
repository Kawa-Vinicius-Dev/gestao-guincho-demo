import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { despesasPorCategoria, entraNoResultado, resumoMensal, serieMensal } from '../demo/calculos'
import { useDemo } from '../demo/DemoContext'
import type { LancamentoDemo, ResultadoVeiculoDemo } from '../demo/modelosDemo'
import { data, moeda, numero } from '../utils/formatadores'

const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotuloMes = (mes: string) => {
  const [ano, numeroMes] = mes.split('-').map(Number)
  return `${meses[numeroMes - 1]}/${String(ano).slice(-2)}`
}
const statusVeiculo: Record<ResultadoVeiculoDemo['status'], string> = {
  SAUDAVEL: 'Saudável', MONITORAR: 'Monitorar', ATENCAO_KM: 'Km morto alto', PREJUIZO: 'Prejuízo',
}

function CartaoMetrica({ titulo, valor, apoio, tom = '' }: { titulo: string; valor: string; apoio: string; tom?: string }) {
  return <article className={`metric metric-v2 ${tom}`}>
    <span>{titulo}</span><strong>{valor}</strong><small>{apoio}</small>
  </article>
}

function GraficoMensal({ state }: { state: ReturnType<typeof useDemo>['state'] }) {
  const serie = serieMensal(state)
  const maximo = Math.max(...serie.flatMap(item => [item.entradas, item.saidas]), 1)
  return <article className="panel chart-card">
    <header className="panel-title"><div><span className="eyebrow">Movimento financeiro</span><h2>Entradas × saídas</h2></div>
      <div className="chart-legend"><span><i className="legend-in"/>Entradas</span><span><i className="legend-out"/>Saídas</span></div></header>
    <div className="bar-chart" role="img" aria-label="Gráfico de entradas e saídas dos últimos seis meses">
      {serie.map(item => <div className="bar-month" key={item.mes}>
        <div className="bar-pair">
          <span className="bar-in" style={{ height: `${(item.entradas / maximo) * 100}%` }} title={`Entradas: ${moeda(item.entradas)}`}/>
          <span className="bar-out" style={{ height: `${(item.saidas / maximo) * 100}%` }} title={`Saídas: ${moeda(item.saidas)}`}/>
        </div>
        <small>{rotuloMes(item.mes)}</small>
      </div>)}
    </div>
  </article>
}

function GraficoCategorias({ state, mes }: { state: ReturnType<typeof useDemo>['state']; mes: string }) {
  const categorias = despesasPorCategoria(state, mes)
  const principais = categorias.slice(0, 5)
  const total = categorias.reduce((soma, item) => soma + item.valor, 0)
  const cores = ['#1570ef', '#46c7ee', '#6f8baa', '#f0a24a', '#c4324c']
  let acumulado = 0
  const fatias = principais.map((item, indice) => {
    const inicio = total ? (acumulado / total) * 100 : 0
    acumulado += item.valor
    const fim = total ? (acumulado / total) * 100 : 0
    return `${cores[indice]} ${inicio}% ${fim}%`
  }).join(', ')
  return <article className="panel chart-card category-card">
    <header className="panel-title"><div><span className="eyebrow">Composição de custos</span><h2>Despesas por categoria</h2></div></header>
    <div className="category-chart">
      <div className="donut" style={{ background: `conic-gradient(${fatias || '#e5ebf1 0 100%'})` }}>
        <span><small>Total</small><strong>{moeda(total)}</strong></span>
      </div>
      <ol>{principais.map((item, indice) => <li key={item.categoria}>
        <i style={{ background: cores[indice] }}/><span>{item.categoria}</span><strong>{total ? ((item.valor / total) * 100).toFixed(0) : 0}%</strong>
      </li>)}</ol>
    </div>
  </article>
}

function LancamentosRecentes({ itens }: { itens: LancamentoDemo[] }) {
  return <article className="panel recent-card">
    <header className="panel-title"><div><span className="eyebrow">Últimos registros</span><h2>Entradas e saídas recentes</h2></div><Link to="/lancamentos">Ver todos</Link></header>
    <div className="recent-list">{itens.map(item => <div key={item.id}>
      <span className={`movement-icon ${item.tipo === 'RECEITA' ? 'in' : 'out'}`}>{item.tipo === 'RECEITA' ? '↙' : '↗'}</span>
      <span><strong>{item.descricao}</strong><small>{data(item.data)} · {item.categoria}</small></span>
      <strong className={item.tipo === 'RECEITA' ? 'positive' : 'negative'}>{item.tipo === 'RECEITA' ? '+' : '−'} {moeda(item.valor)}</strong>
    </div>)}</div>
  </article>
}

export default function DashboardPage() {
  const { state } = useDemo()
  const [mes, setMes] = useState('2026-07')
  const resumo = useMemo(() => resumoMensal(state, mes), [state, mes])
  const ativos = resumo.resultadoVeiculos.filter(item => item.receita || item.despesas || item.kmRodado)
  const maisLucrativo = [...ativos].sort((a, b) => b.lucro - a.lucro)[0]
  const maiorGasto = [...ativos].sort((a, b) => b.despesas - a.despesas)[0]
  const alertas = ativos.filter(item => item.status === 'ATENCAO_KM')
  const recentes = state.lancamentos.filter(item => item.data.startsWith(mes) && entraNoResultado(item)).sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id).slice(0, 6)

  return <div className="page-enter">
    <header className="page-heading dashboard-heading">
      <div><span className="eyebrow">Central financeira · {rotuloMes(mes)}</span><h1>Visão financeira</h1><p>Quanto entrou, quanto saiu e o lucro real da operação — sem misturar faturamento com resultado.</p></div>
      <div className="heading-actions"><label className="month-picker"><span>Competência</span><input aria-label="Competência" type="month" value={mes} onChange={evento => setMes(evento.target.value)}/></label>
        <Link className="button button-primary" to="/lancamentos?novo=1">+ Nova entrada ou saída</Link></div>
    </header>

    {alertas.length ? <Link to="/quilometragem" className="dead-km-alert">
      <span className="alert-beacon">!</span><span><strong>Atenção ao deslocamento improdutivo</strong><small>{alertas.map(item => item.veiculo.codigo).join(', ')} {alertas.length > 1 ? 'estão' : 'está'} acima da meta de km morto. Clique para analisar.</small></span>
      <span>Ver quilometragem →</span>
    </Link> : null}

    <section className="finance-lane" aria-label="Fluxo do resultado operacional">
      <div><span>Receita do mês</span><strong>{moeda(resumo.receita)}</strong><small>100% do faturamento lançado</small></div>
      <i className="lane-separator">−</i>
      <div><span>Despesas do mês</span><strong>{moeda(resumo.despesas)}</strong><small>{resumo.receita ? ((resumo.despesas / resumo.receita) * 100).toFixed(1) : 0}% da receita</small></div>
      <i className="lane-separator">=</i>
      <div className="lane-result"><span>Lucro operacional</span><strong>{moeda(resumo.lucro)}</strong><small>Margem de {resumo.margem.toFixed(1)}%</small></div>
    </section>

    <section className="metric-grid metric-grid-v2">
      <CartaoMetrica titulo="Valores a receber" valor={moeda(resumo.aReceber)} apoio="Receitas ainda não liquidadas" tom="metric-warn"/>
      <CartaoMetrica titulo="Km rodado" valor={`${numero(resumo.kmRodado)} km`} apoio="Percurso total da frota"/>
      <CartaoMetrica titulo="Km morto" valor={`${numero(resumo.kmMorto)} km`} apoio={`${resumo.percentualKmMorto.toFixed(1)}% do percurso total`} tom={resumo.percentualKmMorto > 15 ? 'metric-alert' : ''}/>
      <CartaoMetrica titulo="Custo do km morto" valor={moeda(resumo.custoKmMorto)} apoio="Km improdutivo × custo por km"/>
      <CartaoMetrica titulo="Veículo mais lucrativo" valor={maisLucrativo?.veiculo.codigo ?? '—'} apoio={maisLucrativo ? `${moeda(maisLucrativo.lucro)} de resultado` : 'Sem movimento'}/>
      <CartaoMetrica titulo="Veículo com maior gasto" valor={maiorGasto?.veiculo.codigo ?? '—'} apoio={maiorGasto ? `${moeda(maiorGasto.despesas)} em despesas` : 'Sem movimento'} tom="metric-neutral"/>
    </section>

    <section className="analytics-grid"><GraficoMensal state={state}/><GraficoCategorias state={state} mes={mes}/></section>

    <section className="dashboard-grid dashboard-grid-v2">
      <article className="panel vehicle-results vehicle-results-v2"><header className="panel-title"><div><span className="eyebrow">Resultado individual</span><h2>Lucro por veículo</h2></div><Link to="/veiculos">Abrir veículos</Link></header>
        <div className="table-scroll"><table><thead><tr><th>Veículo</th><th>Receita</th><th>Despesas</th><th>Lucro</th><th>Margem</th><th>Km rodado</th><th>Km morto</th><th>Situação</th></tr></thead>
          <tbody>{ativos.map(item => <tr key={item.veiculo.id}><td><strong>{item.veiculo.codigo}</strong><small>{item.veiculo.modelo}</small></td><td>{moeda(item.receita)}</td><td>{moeda(item.despesas)}</td><td className={item.lucro >= 0 ? 'positive' : 'negative'}><strong>{moeda(item.lucro)}</strong></td><td>{item.margem.toFixed(1)}%</td><td>{numero(item.kmRodado)} km</td><td><strong className={item.percentualKmMorto > item.veiculo.metaKmMorto ? 'negative' : ''}>{numero(item.kmMorto)} km</strong><small>{item.percentualKmMorto.toFixed(1)}%</small></td><td><span className={`vehicle-status status-${item.status.toLowerCase()}`}>{statusVeiculo[item.status]}</span></td></tr>)}</tbody>
        </table></div>
      </article>
      <LancamentosRecentes itens={recentes}/>
    </section>

    <p className="calculation-note"><strong>Como calculamos:</strong> lucro operacional = receitas − despesas. Margem = lucro ÷ receitas × 100. O custo do km morto é incluído nas despesas do veículo.</p>
  </div>
}
