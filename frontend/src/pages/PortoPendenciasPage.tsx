import { useEffect, useState } from 'react'
import { listarPendenciasPorto } from '../api/porto'
import { Vazio } from '../components/EstadoPagina'
import type { PendenciaPorto } from '../types/modelos'
import { moeda } from '../utils/formatadores'

export default function PortoPendenciasPage(){const [itens,setItens]=useState<PendenciaPorto[]>([]),[erro,setErro]=useState('');useEffect(()=>{listarPendenciasPorto().then(setItens).catch(e=>setErro(e.message))},[])
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Porto Seguro</span><h1>Pendências financeiras</h1><p>Pagamentos ainda não recebidos e serviços devolvidos para tratamento.</p></div></header>{erro?<div className="form-alert">{erro}</div>:null}<section className="panel">{itens.length?<div className="table-scroll"><table><thead><tr><th>Tipo</th><th>Referência</th><th>Data</th><th>Valor</th><th>Situação</th></tr></thead><tbody>{itens.map((p,i)=><tr key={`${p.tipo}-${p.referenciaId}-${i}`}><td><strong>{p.tipo==='SERVICO_DEVOLVIDO'?'Serviço devolvido':'Recebimento de OP'}</strong></td><td>{p.referencia}</td><td>{p.data?new Date(`${p.data}T12:00:00`).toLocaleDateString('pt-BR'):'—'}</td><td>{moeda(p.valor)}</td><td><span className="ledger-status ledger-pendente">Pendente</span></td></tr>)}</tbody></table></div>:<Vazio titulo="Nenhuma pendência" descricao="Não há pagamentos programados ou devoluções em aberto."/>}</section></div>}
