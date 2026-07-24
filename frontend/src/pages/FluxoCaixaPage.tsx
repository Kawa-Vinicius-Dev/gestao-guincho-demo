import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/http'
import type { Despesa, Receita } from '../types/modelos'
import { data, moeda } from '../utils/formatadores'

export default function FluxoCaixaPage(){
  const [receitas,setReceitas]=useState<Receita[]>([]),[despesas,setDespesas]=useState<Despesa[]>([])
  useEffect(()=>{Promise.all([api<Receita[]>('/api/receitas'),api<Despesa[]>('/api/despesas')]).then(([r,d])=>{setReceitas(r);setDespesas(d)})},[])
  const linhas=useMemo(()=>[
    ...receitas.filter(r=>r.status==='RECEBIDA').map(r=>({id:`r${r.id}`,data:r.dataRecebimento??r.dataCompetencia,descricao:r.descricao,tipo:'Entrada',valor:r.valor})),
    ...despesas.filter(d=>d.aprovada&&d.status==='PAGO').map(d=>({id:`d${d.id}`,data:d.dataPagamento??d.data,descricao:d.descricao,tipo:'Saída',valor:-d.valor})),
  ].sort((a,b)=>b.data.localeCompare(a.data)),[receitas,despesas])
  const saldo=linhas.reduce((t,l)=>t+l.valor,0)
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Movimentação realizada</span><h1>Fluxo de caixa</h1><p>Somente valores efetivamente recebidos e despesas pagas aprovadas.</p></div><div className="heading-total"><span>Saldo realizado</span><strong>{moeda(saldo)}</strong></div></header>
    <section className="panel"><div className="table-scroll"><table><thead><tr><th>Data</th><th>Descrição</th><th>Movimento</th><th>Valor</th></tr></thead><tbody>{linhas.map(l=><tr key={l.id}><td>{data(l.data)}</td><td><strong>{l.descricao}</strong></td><td><span className={l.valor>=0?'movement-in':'movement-out'}>{l.tipo}</span></td><td className={l.valor>=0?'positive':'negative'}>{moeda(l.valor)}</td></tr>)}</tbody></table></div></section>
  </div>
}
