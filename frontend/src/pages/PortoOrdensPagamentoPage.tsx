import { useEffect, useState, type FormEvent } from 'react'
import { listarOrdensPagamentoPorto, receberOrdemPagamentoPorto } from '../api/porto'
import { Vazio } from '../components/EstadoPagina'
import type { OrdemPagamentoPorto } from '../types/modelos'
import { moeda } from '../utils/formatadores'

const data=(valor?:string)=>valor?new Date(`${valor}T12:00:00`).toLocaleDateString('pt-BR'):'—'
export default function PortoOrdensPagamentoPage(){
  const [itens,setItens]=useState<OrdemPagamentoPorto[]>([]),[selecionada,setSelecionada]=useState<OrdemPagamentoPorto|null>(null),[erro,setErro]=useState('')
  useEffect(()=>{listarOrdensPagamentoPorto().then(setItens).catch(e=>setErro(e.message))},[])
  async function receber(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!selecionada)return;const f=new FormData(event.currentTarget);try{const atualizada=await receberOrdemPagamentoPorto(selecionada.id,Number(f.get('valor')),String(f.get('data')));setItens(lista=>lista.map(x=>x.id===atualizada.id?atualizada:x));setSelecionada(null)}catch(e){setErro((e as Error).message)}}
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Porto Seguro</span><h1>Ordens de pagamento</h1><p>Programações e recebimentos confirmados manualmente.</p></div></header>{erro?<div className="form-alert">{erro}</div>:null}
    <section className="panel">{itens.length?<div className="table-scroll"><table><thead><tr><th>OP</th><th>Nome: Código</th><th>Pagamento programado</th><th>Valor total</th><th>Situação</th><th/></tr></thead><tbody>{itens.map(op=><tr key={op.id}><td><strong>{op.numero}</strong></td><td>{op.nomeCodigo||'—'}</td><td>{data(op.dataPagamentoProgramada)}</td><td>{moeda(op.valorTotal)}</td><td><span className={`ledger-status ${op.situacao==='RECEBIDO'?'ledger-recebido':'ledger-pendente'}`}>{op.situacao==='RECEBIDO'?'Recebido':'Programado'}</span></td><td>{op.situacao!=='RECEBIDO'?<button className="table-action" onClick={()=>setSelecionada(op)}>Confirmar recebimento</button>:null}</td></tr>)}</tbody></table></div>:<Vazio titulo="Nenhuma OP" descricao="Importe o relatório Previsão a Receber para começar."/>}</section>
    {selecionada?<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><header><div><span className="eyebrow">{selecionada.numero}</span><h2>Confirmar recebimento</h2></div><button aria-label="Fechar" onClick={()=>setSelecionada(null)}>×</button></header><form className="form-grid" onSubmit={receber}><label className="field"><span>Valor recebido</span><input aria-label="Valor recebido" name="valor" type="number" step=".01" min=".01" defaultValue={selecionada.valorTotal} required/></label><label className="field"><span>Data do recebimento</span><input name="data" type="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label><div className="modal-actions"><button type="button" className="button button-ghost" onClick={()=>setSelecionada(null)}>Cancelar</button><button className="button button-primary">Salvar recebimento</button></div></form></section></div>:null}
  </div>
}
