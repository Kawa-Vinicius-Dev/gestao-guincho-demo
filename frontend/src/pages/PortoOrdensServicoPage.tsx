import { useEffect, useState } from 'react'
import { listarOrdensServicoPorto } from '../api/porto'
import { Vazio } from '../components/EstadoPagina'
import type { OrdemServicoPorto } from '../types/modelos'
import { moeda } from '../utils/formatadores'

export default function PortoOrdensServicoPage(){const [itens,setItens]=useState<OrdemServicoPorto[]>([]),[erro,setErro]=useState('');useEffect(()=>{listarOrdensServicoPorto().then(setItens).catch(e=>setErro(e.message))},[])
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Porto Seguro</span><h1>Ordens de serviço</h1><p>Serviços vinculados às ordens de pagamento importadas.</p></div></header>{erro?<div className="form-alert">{erro}</div>:null}<section className="panel">{itens.length?<div className="table-scroll"><table><thead><tr><th>OS</th><th>OP</th><th>Especialidade</th><th>Viatura</th><th>Socorrista / QRA</th><th>Atendimento</th><th>Valor</th></tr></thead><tbody>{itens.map(os=><tr key={os.id}><td><strong>{os.numero}</strong></td><td>{os.ordemPagamento||'—'}</td><td>{os.especialidade||'—'}</td><td>{os.viatura||'Sem viatura'}</td><td><strong>{os.socorrista||'—'}</strong><small>{os.qra||'Sem QRA'}</small></td><td>{os.dataAtendimento?new Date(`${os.dataAtendimento}T12:00:00`).toLocaleDateString('pt-BR'):'—'}</td><td>{moeda(os.valorTotal)}</td></tr>)}</tbody></table></div>:<Vazio titulo="Nenhuma OS" descricao="Importe OS vinculadas e selecione a OP correspondente."/>}</section></div>}
