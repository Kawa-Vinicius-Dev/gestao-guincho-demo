import { useMemo, useState } from 'react'
import { useDemo } from '../demo/DemoContext'
import { noMes } from '../demo/calculos'
import { moeda } from '../utils/formatadores'

function Linha({ titulo, valor, nivel = 0, total = false, negativo = false }: { titulo: string; valor: number; nivel?: number; total?: boolean; negativo?: boolean }) {
  return <div className={`dre-line ${total ? 'dre-total' : ''}`} style={{ paddingLeft: `${22 + nivel * 18}px` }}><span>{negativo ? '(−) ' : ''}{titulo}</span><strong className={valor < 0 ? 'negative' : ''}>{moeda(Math.abs(valor))}</strong></div>
}

export default function DrePage() {
  const { state } = useDemo()
  const [mes, setMes] = useState('2026-07')
  const calculo = useMemo(() => {
    const itens = state.lancamentos.filter(item => noMes(item.data, mes))
    const receitas = itens.filter(item => item.tipo === 'RECEITA')
    const despesas = itens.filter(item => item.tipo === 'DESPESA')
    const agrupar = (lista: typeof itens) => [...lista.reduce((mapa, item) => mapa.set(item.categoria, (mapa.get(item.categoria) ?? 0) + item.valor), new Map<string, number>())]
    const total = (lista: typeof itens) => lista.reduce((soma, item) => soma + item.valor, 0)
    const variaveis = despesas.filter(item => item.classeCusto === 'VARIAVEL')
    const fixas = despesas.filter(item => item.classeCusto === 'FIXO')
    const receitaBruta = total(receitas)
    const totalVariavel = total(variaveis)
    const margemOperacional = receitaBruta - totalVariavel
    const totalFixo = total(fixas)
    const lucro = margemOperacional - totalFixo
    return { receitas: agrupar(receitas), variaveis: agrupar(variaveis), fixas: agrupar(fixas), receitaBruta, totalVariavel, margemOperacional, totalFixo, lucro }
  }, [state.lancamentos, mes])
  const margem = calculo.receitaBruta ? (calculo.lucro / calculo.receitaBruta) * 100 : 0
  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Demonstrativo simplificado</span><h1>DRE mensal</h1><p>Receita bruta, custos da operação e lucro — em uma leitura que cabe em uma página.</p></div><label className="month-picker"><span>Competência</span><input type="month" value={mes} onChange={evento => setMes(evento.target.value)}/></label></header>
    <section className="dre-hero"><div><span>Lucro operacional</span><strong>{moeda(calculo.lucro)}</strong><small>Depois de custos variáveis e fixos</small></div><div><span>Margem líquida operacional</span><strong>{margem.toFixed(1)}%</strong><small>{margem >= 20 ? 'Resultado saudável no período' : 'Margem abaixo do alvo recomendado'}</small></div></section>
    <section className="dre-layout">
      <article className="panel dre-sheet">
        <header><span>Demonstração do resultado</span><strong>Valor</strong></header>
        <div className="dre-group"><Linha titulo="Receita bruta" valor={calculo.receitaBruta} total/>{calculo.receitas.map(([categoria, valor]) => <Linha key={categoria} titulo={categoria} valor={valor} nivel={1}/>)}</div>
        <div className="dre-group"><Linha titulo="Custos variáveis" valor={calculo.totalVariavel} total negativo/>{calculo.variaveis.map(([categoria, valor]) => <Linha key={categoria} titulo={categoria} valor={valor} nivel={1}/>)}</div>
        <Linha titulo="Margem operacional" valor={calculo.margemOperacional} total/>
        <div className="dre-group"><Linha titulo="Custos fixos" valor={calculo.totalFixo} total negativo/>{calculo.fixas.map(([categoria, valor]) => <Linha key={categoria} titulo={categoria} valor={valor} nivel={1}/>)}</div>
        <div className="dre-final"><span>Lucro operacional</span><strong>{moeda(calculo.lucro)}</strong></div>
      </article>
      <aside className="dre-explainer">
        <span className="eyebrow">Leitura da DRE</span><h2>Faturar não é lucrar.</h2>
        <p>A receita bruta mostra tudo que foi vendido. Os custos variáveis acompanham a operação; os fixos existem mesmo com a frota parada.</p>
        <div><span>1</span><p><strong>Margem operacional</strong>Receita menos combustível, pedágios, km morto e demais custos variáveis.</p></div>
        <div><span>2</span><p><strong>Lucro operacional</strong>O que sobra depois de descontar também manutenção, seguros, parcelas e estrutura.</p></div>
        <button className="button button-ghost" onClick={() => window.print()}>Imprimir DRE</button>
      </aside>
    </section>
  </div>
}
