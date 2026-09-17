import { useCallback, useEffect, useMemo, useState } from 'react'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { usePeriodoGlobal } from '../utils/periodoGlobal'
import { lerExtrato } from '../dados/extrato'
import { Carregando, Vazio } from '../components/EstadoPagina'
import type { LancamentoFinanceiro } from '../types/modelos'
import { data, moeda } from '../utils/formatadores'


export default function FluxoCaixaPage(){
  const [periodo,setPeriodo]=usePeriodoGlobal(),[lancamentos,setLancamentos]=useState<LancamentoFinanceiro[]>([]),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(true)
  const carregar=useCallback(async()=>{const {inicio,fim}=periodo;if(!inicio||!fim||inicio>fim)return;setCarregando(true);try{setLancamentos(await lerExtrato(inicio,fim));setErro('')}catch(e){setErro((e as Error).message)}finally{setCarregando(false)}},[periodo])
  useEffect(()=>{void carregar()},[carregar])
  const realizados=useMemo(()=>lancamentos.filter(item=>item.realizado),[lancamentos])
  const saldo=realizados.reduce((total,item)=>total+(item.tipo==='RECEITA'?item.valor:-item.valor),0)
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Movimentação realizada</span><h1>Fluxo de caixa</h1><p>O mesmo extrato oficial usado pelas demais telas, limitado aos valores efetivamente realizados.</p></div><div className="heading-actions"><div className="periodo-no-cabecalho"><SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/></div><div className="heading-total"><span>Saldo realizado</span><strong>{moeda(saldo)}</strong></div></div></header>
    {erro?<div className="form-alert">{erro}</div>:null}
    <section className="panel">{carregando?<Carregando/>:realizados.length?<div className="table-scroll"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Movimento</th><th>Valor</th></tr></thead><tbody>{realizados.map(item=><tr key={item.id}><td>{data(item.data)}</td><td><strong>{item.descricao}</strong><small>{item.origem}</small></td><td>{item.categoria}</td><td><span className={item.tipo==='RECEITA'?'movement-in':'movement-out'}>{item.tipo==='RECEITA'?'Receita':'Despesa'}</span></td><td className={item.tipo==='RECEITA'?'positive':'negative'}>{item.tipo==='RECEITA'?'+':'−'} {moeda(item.valor)}</td></tr>)}</tbody></table></div>:<Vazio titulo="Caixa sem movimentos" descricao="Nenhuma receita ou despesa foi realizada nesta competência."/>}</section>
  </div>
}
