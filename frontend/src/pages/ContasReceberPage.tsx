import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/http'
import { StatusBadge } from '../components/StatusBadge'
import { Vazio } from '../components/EstadoPagina'
import type { ContaReceber, Contratante, Veiculo } from '../types/modelos'
import { moeda } from '../utils/formatadores'

const hoje=()=>new Date().toISOString().slice(0,10)
const proximoMes=()=>{const d=new Date();d.setMonth(d.getMonth()+1);return d.toISOString().slice(0,10)}
export default function ContasReceberPage(){
  const [contas,setContas]=useState<ContaReceber[]>([]),[contratantes,setContratantes]=useState<Contratante[]>([])
  const [veiculos,setVeiculos]=useState<Veiculo[]>([]),[status,setStatus]=useState(''),[pesquisa,setPesquisa]=useState('')
  const [modal,setModal]=useState<'nova'|'receber'|null>(null),[selecionada,setSelecionada]=useState<ContaReceber|null>(null)
  const [erro,setErro]=useState(''),[versao,setVersao]=useState(0)
  useEffect(()=>{
    const controller=new AbortController()
    api<ContaReceber[]>(`/api/contas-receber?${new URLSearchParams({...(status&&{status}),...(pesquisa&&{pesquisa})})}`,{signal:controller.signal})
      .then(setContas).catch(e=>{if(e.name!=='AbortError')setErro(e.message)})
    return()=>controller.abort()
  },[status,pesquisa,versao])
  useEffect(()=>{Promise.all([api<Contratante[]>('/api/contratantes'),api<Veiculo[]>('/api/veiculos')]).then(([c,v])=>{setContratantes(c);setVeiculos(v)})},[])
  async function salvar(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const f=new FormData(event.currentTarget)
    const body={contratanteId:Number(f.get('contratanteId')),protocolo:f.get('protocolo')||null,descricao:f.get('descricao'),
      valorPrevisto:Number(f.get('valorPrevisto')),dataCompetencia:f.get('dataCompetencia'),vencimento:f.get('vencimento'),
      veiculoId:f.get('veiculoId')?Number(f.get('veiculoId')):null,observacoes:f.get('observacoes')||null,origem:'MANUAL'}
    try{await api('/api/contas-receber',{method:'POST',body:JSON.stringify(body)});setModal(null);setVersao(v=>v+1)}catch(e){setErro((e as Error).message)}
  }
  async function receber(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!selecionada)return;const f=new FormData(event.currentTarget)
    try{await api(`/api/contas-receber/${selecionada.id}/receber`,{method:'PATCH',body:JSON.stringify({valorRecebido:Number(f.get('valorRecebido')),dataRecebimento:f.get('dataRecebimento')})});setModal(null);setVersao(v=>v+1)}catch(e){setErro((e as Error).message)}
  }
  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Financeiro</span><h1>Contas a receber</h1><p>Previsões, atrasos e recebimentos conciliados.</p></div>
      <button className="button button-primary" onClick={()=>setModal('nova')}>Nova conta</button></header>
    {erro?<div className="form-alert">{erro}</div>:null}
    <section className="panel">
      <div className="filters"><label className="search-field"><span>Pesquisar</span><input value={pesquisa} onChange={e=>setPesquisa(e.target.value)} placeholder="Protocolo, contratante ou descrição"/></label>
        <label className="filter-select"><span>Status</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos</option><option>PENDENTE</option><option>ATRASADO</option><option>RECEBIDO</option><option>CANCELADO</option></select></label></div>
      {contas.length?<div className="table-scroll"><table><thead><tr><th>Protocolo / descrição</th><th>Contratante</th><th>Vencimento</th><th>Status</th><th>Previsto</th><th>Recebido</th><th/></tr></thead>
        <tbody>{contas.map(c=><tr key={c.id}><td><strong>{c.protocolo||'Sem protocolo'}</strong><small>{c.descricao}</small></td><td>{c.contratante.nome}</td><td>{new Date(`${c.vencimento}T12:00:00`).toLocaleDateString('pt-BR')}</td><td><StatusBadge status={c.status}/></td><td>{moeda(c.valorPrevisto)}</td><td>{c.valorRecebido!=null?<><strong>{moeda(c.valorRecebido)}</strong>{c.diferenca?<small className="negative">Dif. {moeda(c.diferenca)}</small>:null}</>:'—'}</td><td>{c.status!=='RECEBIDO'&&c.status!=='CANCELADO'?<button className="table-action" onClick={()=>{setSelecionada(c);setModal('receber')}}>Registrar pagamento</button>:null}</td></tr>)}</tbody></table></div>
        :<Vazio titulo="Nenhuma conta encontrada" descricao="Cadastre uma conta manualmente ou confirme uma importação da Porto Seguro."/>}
    </section>
    {modal?<div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Contas a receber</span><h2>{modal==='nova'?'Nova conta':'Registrar recebimento'}</h2></div><button aria-label="Fechar" onClick={()=>setModal(null)}>×</button></header>
      {modal==='nova'?<form onSubmit={salvar} className="form-grid two-columns">
        <label className="field"><span>Contratante</span><select name="contratanteId" required>{contratantes.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
        <label className="field"><span>Protocolo</span><input name="protocolo"/></label>
        <label className="field field-wide"><span>Descrição</span><input name="descricao" required/></label>
        <label className="field"><span>Valor previsto</span><input name="valorPrevisto" type="number" min=".01" step=".01" required/></label>
        <label className="field"><span>Veículo</span><select name="veiculoId"><option value="">Não relacionado</option>{veiculos.map(v=><option key={v.id} value={v.id}>{v.identificacao}</option>)}</select></label>
        <label className="field"><span>Competência</span><input name="dataCompetencia" type="date" defaultValue={hoje()} required/></label>
        <label className="field"><span>Vencimento</span><input name="vencimento" type="date" defaultValue={proximoMes()} required/></label>
        <label className="field field-wide"><span>Observações</span><textarea name="observacoes" rows={3}/></label>
        <div className="modal-actions field-wide"><button type="button" className="button button-ghost" onClick={()=>setModal(null)}>Cancelar</button><button className="button button-primary">Salvar conta</button></div>
      </form>:<form onSubmit={receber} className="form-grid"><p>Previsto: <strong>{moeda(selecionada?.valorPrevisto??0)}</strong></p>
        <label className="field"><span>Valor recebido</span><input name="valorRecebido" type="number" step=".01" defaultValue={selecionada?.valorPrevisto} required/></label>
        <label className="field"><span>Data do recebimento</span><input name="dataRecebimento" type="date" defaultValue={hoje()} required/></label>
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={()=>setModal(null)}>Cancelar</button><button className="button button-primary">Confirmar recebimento</button></div>
      </form>}
    </section></div>:null}
  </div>
}
