import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { usePeriodoGlobal } from '../utils/periodoGlobal'
import { porCompetenciaDaOp } from '../utils/modoDoPeriodo'
import { useEffect, useMemo, useState } from 'react'
import { Carregando } from '../components/EstadoPagina'
import { lerIndicadores } from '../dados/dashboard'
import { lerExtrato } from '../dados/extrato'
import { baixarDre } from '../dados/relatorios'
import type { Dashboard, LancamentoFinanceiro } from '../types/modelos'
import { moeda, percentual } from '../utils/formatadores'
import { ServicosDoPeriodo } from './dre/ServicosDoPeriodo'
import { DespesasDoPeriodo } from './dre/DespesasDoPeriodo'

function Linha({ titulo, valor, nivel = 0, total = false, negativo = false }: { titulo: string; valor: number; nivel?: number; total?: boolean; negativo?: boolean }) {
  return <div className={`dre-line ${total ? 'dre-total' : ''}`} style={{ paddingLeft: `${22 + nivel * 18}px` }}><span>{negativo ? '(−) ' : ''}{titulo}</span><strong className={valor < 0 ? 'negative' : ''}>{moeda(Math.abs(valor))}</strong></div>
}

export default function DrePage() {
  const [periodo,setPeriodo]=usePeriodoGlobal()
  const {inicio,fim}=periodo
  const [financeiro,setFinanceiro]=useState<Dashboard|null>(null)
  const [extrato,setExtrato]=useState<LancamentoFinanceiro[]>([])
  const [erro,setErro]=useState('')
  // O banco e lento: sem isto a tela ficava mostrando zeros como se fossem o
  // resultado do periodo, e so depois trocava pelos numeros de verdade.
  const [carregando,setCarregando]=useState(true)
  const [exportando,setExportando]=useState('')
  async function exportar(formato:'excel'|'pdf'){setExportando(formato);setErro('')
    try{await baixarDre(inicio,fim,formato)}catch(e){setErro((e as Error).message)}finally{setExportando('')}}
  useEffect(()=>{
    if(!inicio||!fim||inicio>fim)return
    setCarregando(true)
    Promise.all([lerIndicadores(inicio,fim),lerExtrato(inicio,fim).catch(()=>[] as LancamentoFinanceiro[])])
      .then(([f,x])=>{setFinanceiro(f);setExtrato(x)}).catch(e=>setErro(e.message))
      .finally(()=>setCarregando(false))
  },[inicio,fim])
  // Kawa, 23/09/2026: "a DRE precisa discriminar o que e essa despesa e o que
  // sao os lucros". Cada total abre por categoria, da maior para a menor.
  const calculo = useMemo(() => {
    const receitaBruta=financeiro?.receitaRecebida??0
    const totalDespesas=financeiro?.despesasPagas??0
    const lucro = receitaBruta-totalDespesas
    const porCategoria=(tipo:'RECEITA'|'DESPESA')=>[...extrato.filter(l=>l.tipo===tipo&&l.realizado)
      .reduce((m,l)=>m.set(l.categoria||'Sem categoria',(m.get(l.categoria||'Sem categoria')??0)+l.valor),new Map<string,number>())]
      .sort((a,b)=>b[1]-a[1])
    const despesasCat=(financeiro?.despesasPorCategoria??[]).map(c=>[c.categoria,c.valor] as [string,number])
    return { receitas:porCategoria('RECEITA'), despesas:despesasCat.length?despesasCat:porCategoria('DESPESA'), receitaBruta,totalDespesas,lucro }
  }, [financeiro,extrato])
  const margem = calculo.receitaBruta ? (calculo.lucro / calculo.receitaBruta) * 100 : null
  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Demonstrativo simplificado</span><h1>DRE</h1><p>Receitas recebidas, despesas pagas e resultado — conforme o financeiro oficial.</p></div></header>
    <section className="panel painel-filtros"><form className="ledger-filters" onSubmit={e=>e.preventDefault()}><SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/></form></section>
    {erro?<div className="form-alert">{erro}</div>:null}
    {carregando?<Carregando/>:<>
    <section className="dre-hero"><div><span>Lucro operacional</span><strong>{moeda(calculo.lucro)}</strong><small>Depois das despesas aprovadas e pagas</small></div><div><span>Margem líquida operacional</span><strong>{margem===null?'—':percentual(margem)}</strong><small>{margem===null?'Sem receita no período':margem >= 20 ? 'Resultado saudável no período' : 'Margem abaixo do alvo recomendado'}</small></div></section>
    <section className="dre-layout">
      <article className="panel dre-sheet">
        <header><span>Demonstração do resultado</span><strong>Valor</strong></header>
        <div className="dre-group"><Linha titulo="Receita bruta" valor={calculo.receitaBruta} total/>{calculo.receitas.map(([categoria, valor]) => <Linha key={categoria} titulo={categoria} valor={valor} nivel={1}/>)}</div>
        <div className="dre-group"><Linha titulo="Despesas pagas" valor={calculo.totalDespesas} total negativo/>{calculo.despesas.map(([categoria, valor]) => <Linha key={categoria} titulo={categoria} valor={valor} nivel={1}/>)}</div>
        <div className="dre-final"><span>Lucro operacional</span><strong>{moeda(calculo.lucro)}</strong></div>
      </article>
      <aside className="dre-explainer">
        <span className="eyebrow">Leitura da DRE</span><h2>Faturar não é lucrar.</h2>
        <p>A receita mostra somente valores recebidos. As despesas entram no resultado quando estão aprovadas e pagas.</p>
        <div><span>1</span><p><strong>Receita realizada</strong>Previsões e pagamentos programados não são tratados como entrada no caixa.</p></div>
        <div><span>2</span><p><strong>Lucro operacional</strong>O que sobra após descontar as despesas efetivamente pagas no período.</p></div>
        <button className="button button-primary" disabled={exportando!==''} onClick={()=>void exportar('excel')}>{exportando==='excel'?'Gerando Excel…':'Exportar Excel'}</button>
        <button className="button button-ghost" disabled={exportando!==''} onClick={()=>void exportar('pdf')}>{exportando==='pdf'?'Gerando PDF…':'Exportar PDF'}</button>
        <button className="button button-ghost" onClick={() => window.print()}>Imprimir DRE</button>
      </aside>
    </section>
    {inicio&&fim&&inicio<=fim?<><ServicosDoPeriodo inicio={inicio} fim={fim} porCompetencia={porCompetenciaDaOp(periodo)}/><DespesasDoPeriodo lancamentos={extrato}/></>:null}
    </>}
  </div>
}
