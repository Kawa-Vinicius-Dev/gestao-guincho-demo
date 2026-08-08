import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/http'
import type { Dashboard } from '../types/modelos'
import { moeda } from '../utils/formatadores'

function Linha({ titulo, valor, nivel = 0, total = false, negativo = false }: { titulo: string; valor: number; nivel?: number; total?: boolean; negativo?: boolean }) {
  return <div className={`dre-line ${total ? 'dre-total' : ''}`} style={{ paddingLeft: `${22 + nivel * 18}px` }}><span>{negativo ? '(−) ' : ''}{titulo}</span><strong className={valor < 0 ? 'negative' : ''}>{moeda(Math.abs(valor))}</strong></div>
}

export default function DrePage() {
  const [mes, setMes] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  const [financeiro,setFinanceiro]=useState<Dashboard|null>(null)
  const [erro,setErro]=useState('')
  useEffect(()=>{
    const [ano,numeroMes]=mes.split('-').map(Number),ultimoDia=new Date(ano,numeroMes,0).getDate()
    api<Dashboard>(`/api/dashboard?inicio=${mes}-01&fim=${mes}-${String(ultimoDia).padStart(2,'0')}`).then(setFinanceiro).catch(e=>setErro(e.message))
  },[mes])
  const calculo = useMemo(() => {
    const receitaBruta=financeiro?.receitaRecebida??0
    const totalDespesas=financeiro?.despesasPagas??0
    const lucro = receitaBruta-totalDespesas
    return { receitas:receitaBruta?[['Receitas recebidas',receitaBruta] as [string,number]]:[], receitaBruta,totalDespesas,lucro }
  }, [financeiro])
  const margem = calculo.receitaBruta ? (calculo.lucro / calculo.receitaBruta) * 100 : 0
  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Demonstrativo simplificado</span><h1>DRE mensal</h1><p>Receitas recebidas, despesas pagas e resultado — conforme o financeiro oficial.</p></div><label className="month-picker"><span>Competência</span><input type="month" value={mes} onChange={evento => setMes(evento.target.value)}/></label></header>
    {erro?<div className="form-alert">{erro}</div>:null}
    <section className="dre-hero"><div><span>Lucro operacional</span><strong>{moeda(calculo.lucro)}</strong><small>Depois das despesas aprovadas e pagas</small></div><div><span>Margem líquida operacional</span><strong>{margem.toFixed(1)}%</strong><small>{margem >= 20 ? 'Resultado saudável no período' : 'Margem abaixo do alvo recomendado'}</small></div></section>
    <section className="dre-layout">
      <article className="panel dre-sheet">
        <header><span>Demonstração do resultado</span><strong>Valor</strong></header>
        <div className="dre-group"><Linha titulo="Receita bruta" valor={calculo.receitaBruta} total/>{calculo.receitas.map(([categoria, valor]) => <Linha key={categoria} titulo={categoria} valor={valor} nivel={1}/>)}</div>
        <div className="dre-group"><Linha titulo="Despesas aprovadas e pagas" valor={calculo.totalDespesas} total negativo/></div>
        <div className="dre-final"><span>Lucro operacional</span><strong>{moeda(calculo.lucro)}</strong></div>
      </article>
      <aside className="dre-explainer">
        <span className="eyebrow">Leitura da DRE</span><h2>Faturar não é lucrar.</h2>
        <p>A receita mostra somente valores recebidos. As despesas entram no resultado quando estão aprovadas e pagas.</p>
        <div><span>1</span><p><strong>Receita realizada</strong>Previsões e pagamentos programados não são tratados como entrada no caixa.</p></div>
        <div><span>2</span><p><strong>Lucro operacional</strong>O que sobra após descontar as despesas efetivamente pagas no período.</p></div>
        <button className="button button-ghost" onClick={() => window.print()}>Imprimir DRE</button>
      </aside>
    </section>
  </div>
}
