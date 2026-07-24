import { useMemo, useState } from 'react'
import { resultadoPorVeiculo } from '../demo/calculos'
import { useDemo } from '../demo/DemoContext'
import { moeda, numero } from '../utils/formatadores'

function Progresso({ valor, meta, inverso = false, sufixo = '' }: { valor: number; meta: number; inverso?: boolean; sufixo?: string }) {
  const percentual = meta ? (valor / meta) * 100 : 0
  const cumprida = inverso ? valor <= meta : valor >= meta
  return <div className="goal-progress"><span><strong>{numero(valor)}{sufixo}</strong><small>de {numero(meta)}{sufixo}</small></span><b className={cumprida ? 'positive' : ''}>{cumprida ? 'Meta atingida' : `${Math.min(100, percentual).toFixed(0)}%`}</b><div><i className={cumprida ? 'done' : ''} style={{ width: `${Math.min(100, inverso ? Math.max(8, percentual) : percentual)}%` }}/></div></div>
}

export default function MetasPage() {
  const { state } = useDemo()
  const [aba, setAba] = useState<'veiculos' | 'funcionarios'>('veiculos')
  const resultados = useMemo(() => resultadoPorVeiculo(state, '2026-07'), [state])
  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Julho de 2026</span><h1>Metas mensais</h1><p>Faturamento, limite de km morto e margem mínima por veículo e funcionário.</p></div></header>
    <div className="page-tabs"><button className={aba === 'veiculos' ? 'active' : ''} onClick={() => setAba('veiculos')}>Por veículo</button><button className={aba === 'funcionarios' ? 'active' : ''} onClick={() => setAba('funcionarios')}>Por funcionário</button></div>
    {aba === 'veiculos' ? <section className="goal-grid">{resultados.filter(item => item.veiculo.metaReceita > 0).map(item => <article className="panel goal-card" key={item.veiculo.id}>
      <header><span className="vehicle-monogram">{item.veiculo.codigo}</span><span><strong>{item.veiculo.modelo}</strong><small>{item.veiculo.placa}</small></span></header>
      <label>Meta de receita <em>{moeda(item.receita)} / {moeda(item.veiculo.metaReceita)}</em></label><Progresso valor={item.receita} meta={item.veiculo.metaReceita}/>
      <label>Máximo de km morto <em>{item.percentualKmMorto.toFixed(1)}% / {item.veiculo.metaKmMorto}%</em></label><Progresso valor={item.percentualKmMorto} meta={item.veiculo.metaKmMorto} inverso sufixo="%"/>
      <label>Margem de lucro <em>{item.margem.toFixed(1)}% / {item.veiculo.metaMargem}%</em></label><Progresso valor={item.margem} meta={item.veiculo.metaMargem} sufixo="%"/>
    </article>)}</section> : <section className="goal-grid">{state.funcionarios.map(funcionario => {
      const itens = state.lancamentos.filter(item => item.funcionarioId === funcionario.id && item.data.startsWith('2026-07'))
      const receita = itens.filter(item => item.tipo === 'RECEITA').reduce((soma, item) => soma + item.valor, 0)
      const veiculo = resultados.find(item => item.veiculo.id === funcionario.veiculoId)
      return <article className="panel goal-card" key={funcionario.id}><header><span className="team-avatar">{funcionario.nome.slice(0, 2).toUpperCase()}</span><span><strong>{funcionario.nome}</strong><small>{funcionario.funcao}</small></span></header>
        <label>Meta de faturamento <em>{moeda(receita)} / {moeda(funcionario.metaReceita)}</em></label><Progresso valor={receita} meta={funcionario.metaReceita}/>
        <label>Máximo de km morto <em>{(veiculo?.percentualKmMorto ?? 0).toFixed(1)}% / {funcionario.metaKmMorto}%</em></label><Progresso valor={veiculo?.percentualKmMorto ?? 0} meta={funcionario.metaKmMorto} inverso sufixo="%"/>
        <label>Margem de lucro <em>{(veiculo?.margem ?? 0).toFixed(1)}% / {funcionario.metaMargem}%</em></label><Progresso valor={veiculo?.margem ?? 0} meta={funcionario.metaMargem} sufixo="%"/>
      </article>
    })}</section>}
  </div>
}
