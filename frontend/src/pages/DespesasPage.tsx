import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/http'
import { useAuth } from '../auth/AuthContext'
import { StatusBadge } from '../components/StatusBadge'
import { Vazio } from '../components/EstadoPagina'
import type { Categoria, Despesa, Motorista, Veiculo } from '../types/modelos'
import { data, moeda } from '../utils/formatadores'

export default function DespesasPage(){
  const {usuario}=useAuth(),admin=usuario?.perfil==='ADMINISTRADOR'
  const [lista,setLista]=useState<Despesa[]>([]),[categorias,setCategorias]=useState<Categoria[]>([]),[veiculos,setVeiculos]=useState<Veiculo[]>([]),[motoristas,setMotoristas]=useState<Motorista[]>([])
  const [form,setForm]=useState(false),[mensagem,setMensagem]=useState('')
  const carregar=()=>admin?api<Despesa[]>('/api/despesas').then(setLista):Promise.resolve()
  useEffect(()=>{carregar();Promise.all([api<Categoria[]>('/api/categorias?tipo=DESPESA'),api<Veiculo[]>('/api/veiculos'),api<Motorista[]>('/api/motoristas')]).then(([c,v,m])=>{setCategorias(c);setVeiculos(v);setMotoristas(m)})},[admin])
  async function salvar(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget)
    const body={descricao:f.get('descricao'),categoriaId:Number(f.get('categoriaId')),valor:Number(f.get('valor')),data:f.get('data'),
      vencimento:f.get('vencimento')||null,dataPagamento:f.get('dataPagamento')||null,formaPagamento:f.get('formaPagamento')||null,
      veiculoId:f.get('veiculoId')?Number(f.get('veiculoId')):null,motoristaId:f.get('motoristaId')?Number(f.get('motoristaId')):null,
      protocolo:f.get('protocolo')||null,comprovante:f.get('comprovante')||null,observacoes:f.get('observacoes')||null,status:f.get('status')}
    try{await api('/api/despesas',{method:'POST',body:JSON.stringify(body)});setForm(false);setMensagem(admin?'Despesa registrada. Aprove para incluí-la nos totais.':'Despesa enviada para aprovação do administrador.');await carregar()}catch(x){setMensagem((x as Error).message)}
  }
  async function aprovar(id:number){await api(`/api/despesas/${id}/aprovar`,{method:'PATCH'});await carregar()}
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Saídas</span><h1>Despesas</h1><p>Custos da operação vinculados a veículos, motoristas e protocolos.</p></div><button className="button button-primary" onClick={()=>setForm(true)}>Registrar despesa</button></header>
    {mensagem?<div className="success-notice">{mensagem}</div>:null}
    {admin?<section className="panel">{lista.length?<div className="table-scroll"><table><thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Veículo</th><th>Status</th><th>Aprovação</th><th>Valor</th></tr></thead><tbody>
      {lista.map(d=><tr key={d.id}><td><strong>{d.descricao}</strong><small>{d.criadoPor}</small></td><td>{d.categoria}</td><td>{data(d.data)}</td><td>{d.veiculo||'—'}</td><td><StatusBadge status={d.status}/></td><td>{d.aprovada?<span className="approved">Aprovada</span>:<button className="table-action" onClick={()=>aprovar(d.id)}>Aprovar</button>}</td><td>{moeda(d.valor)}</td></tr>)}
      </tbody></table></div>:<Vazio titulo="Nenhuma despesa" descricao="Registre custos ou aguarde lançamentos dos funcionários."/>}</section>
      :<section className="employee-callout"><span className="eyebrow">Perfil funcionário</span><h2>Registre os custos assim que acontecerem.</h2><p>Seus lançamentos serão conferidos pelo administrador antes de entrarem no financeiro.</p><button className="button button-primary" onClick={()=>setForm(true)}>Registrar agora</button></section>}
    {form?<div className="modal-backdrop"><section className="modal modal-wide" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Comprovante operacional</span><h2>Registrar despesa</h2></div><button aria-label="Fechar" onClick={()=>setForm(false)}>×</button></header>
      <form onSubmit={salvar} className="form-grid three-columns"><label className="field field-wide"><span>Descrição</span><input name="descricao" required/></label>
        <label className="field"><span>Categoria</span><select name="categoriaId" required>{categorias.map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
        <label className="field"><span>Valor</span><input name="valor" type="number" step=".01" min=".01" required/></label>
        <label className="field"><span>Status</span><select name="status"><option>PAGO</option><option>PENDENTE</option></select></label>
        <label className="field"><span>Data</span><input name="data" type="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label>
        <label className="field"><span>Vencimento</span><input name="vencimento" type="date"/></label><label className="field"><span>Data do pagamento</span><input name="dataPagamento" type="date"/></label>
        <label className="field"><span>Forma de pagamento</span><select name="formaPagamento"><option value="">Não informada</option><option>PIX</option><option>Cartão</option><option>Dinheiro</option><option>Boleto</option></select></label>
        <label className="field"><span>Veículo</span><select name="veiculoId"><option value="">Não relacionado</option>{veiculos.map(x=><option key={x.id} value={x.id}>{x.identificacao}</option>)}</select></label>
        <label className="field"><span>Motorista</span><select name="motoristaId"><option value="">Não relacionado</option>{motoristas.map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
        <label className="field"><span>Protocolo relacionado</span><input name="protocolo"/></label><label className="field two-span"><span>Comprovante (referência)</span><input name="comprovante" placeholder="Nome ou caminho do arquivo"/></label>
        <label className="field field-wide"><span>Observações</span><textarea name="observacoes" rows={3}/></label>
        <div className="modal-actions field-wide"><button type="button" className="button button-ghost" onClick={()=>setForm(false)}>Cancelar</button><button className="button button-primary">Enviar despesa</button></div>
      </form></section></div>:null}
  </div>
}
