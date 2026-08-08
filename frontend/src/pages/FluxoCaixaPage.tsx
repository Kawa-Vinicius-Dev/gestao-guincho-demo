import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api/http'
import { Vazio } from '../components/EstadoPagina'
import type { LancamentoFinanceiro } from '../types/modelos'
import { data, moeda } from '../utils/formatadores'

const mesAtual=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
const intervalo=(mes:string)=>{const [ano,m]=mes.split('-').map(Number);return {inicio:`${mes}-01`,fim:`${mes}-${String(new Date(ano,m,0).getDate()).padStart(2,'0')}`}}

export default function FluxoCaixaPage(){
  const [mes,setMes]=useState(mesAtual),[lancamentos,setLancamentos]=useState<LancamentoFinanceiro[]>([]),[erro,setErro]=useState('')
  const carregar=useCallback(async()=>{const {inicio,fim}=intervalo(mes);try{setLancamentos(await api<LancamentoFinanceiro[]>(`/api/lancamentos?inicio=${inicio}&fim=${fim}`));setErro('')}catch(e){setErro((e as Error).message)}},[mes])
  useEffect(()=>{void carregar()},[carregar])
  const realizados=useMemo(()=>lancamentos.filter(item=>item.realizado),[lancamentos])
  const saldo=realizados.reduce((total,item)=>total+(item.tipo==='RECEITA'?item.valor:-item.valor),0)
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Movimentação realizada</span><h1>Fluxo de caixa</h1><p>O mesmo extrato oficial usado pelas demais telas, limitado aos valores efetivamente realizados.</p></div><div className="heading-actions"><label className="month-picker"><span>Competência</span><input type="month" value={mes} onChange={e=>setMes(e.target.value)}/></label><div className="heading-total"><span>Saldo realizado</span><strong>{moeda(saldo)}</strong></div></div></header>
    {erro?<div className="form-alert">{erro}</div>:null}
    <section className="panel">{realizados.length?<div className="table-scroll"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Movimento</th><th>Valor</th></tr></thead><tbody>{realizados.map(item=><tr key={item.id}><td>{data(item.data)}</td><td><strong>{item.descricao}</strong><small>{item.origem}</small></td><td>{item.categoria}</td><td><span className={item.tipo==='RECEITA'?'movement-in':'movement-out'}>{item.tipo==='RECEITA'?'Entrada':'Saída'}</span></td><td className={item.tipo==='RECEITA'?'positive':'negative'}>{item.tipo==='RECEITA'?'+':'−'} {moeda(item.valor)}</td></tr>)}</tbody></table></div>:<Vazio titulo="Caixa sem movimentos" descricao="Nenhuma entrada ou saída foi realizada nesta competência."/>}</section>
  </div>
}
