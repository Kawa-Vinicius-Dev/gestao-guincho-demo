import { useEffect,useState,type FormEvent } from 'react'
import { criarDataCalendarioPorto,desativarDataCalendarioPorto,listarCalendarioPorto } from '../api/porto'
import type { CalendarioPorto } from '../types/modelos'

const data=(valor:string)=>new Date(`${valor}T12:00:00`).toLocaleDateString('pt-BR')
export default function PortoCalendarioPage(){
  const [itens,setItens]=useState<CalendarioPorto[]>([]),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(false)
  async function carregar(){try{setItens(await listarCalendarioPorto())}catch(e){setErro((e as Error).message)}}
  useEffect(()=>{void carregar()},[])
  async function adicionar(event:FormEvent<HTMLFormElement>){event.preventDefault();setCarregando(true);setErro('');const elemento=event.currentTarget,form=new FormData(elemento);try{await criarDataCalendarioPorto({dataPagamento:String(form.get('data')),descricao:String(form.get('descricao')),ativo:true});elemento.reset();await carregar()}catch(e){setErro((e as Error).message)}finally{setCarregando(false)}}
  async function desativar(id:number){setCarregando(true);try{await desativarDataCalendarioPorto(id);await carregar()}catch(e){setErro((e as Error).message)}finally{setCarregando(false)}}
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Porto Seguro</span><h1>Calendário de pagamentos</h1><p>Datas configuráveis usadas para prever o próximo ciclo dos serviços.</p></div></header>{erro?<div className="form-alert">{erro}</div>:null}
    <section className="panel"><form className="ledger-filters" onSubmit={adicionar}><label><span>Data de pagamento</span><input aria-label="Data de pagamento" name="data" type="date" required/></label><label className="filter-grow"><span>Descrição</span><input aria-label="Descrição" name="descricao" required/></label><button className="button button-primary" disabled={carregando}>Adicionar data</button></form>
      <div className="table-scroll"><table><thead><tr><th>Data</th><th>Descrição</th><th>Situação</th><th/></tr></thead><tbody>{itens.map(item=><tr key={item.id}><td><strong>{data(item.dataPagamento)}</strong></td><td>{item.descricao}</td><td>{item.ativo?'Ativa':'Inativa'}</td><td>{item.ativo?<button className="table-action" disabled={carregando} onClick={()=>void desativar(item.id)}>Desativar</button>:null}</td></tr>)}</tbody></table></div>
    </section></div>
}
