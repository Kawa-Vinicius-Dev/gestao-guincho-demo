import { useEffect,useState,type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/http'
import { Carregando,ErroPagina,Vazio } from '../components/EstadoPagina'
import type { Motorista } from '../types/modelos'

export default function EquipePage(){
  const [motoristas,setMotoristas]=useState<Motorista[]>([])
  const [carregando,setCarregando]=useState(true),[modal,setModal]=useState(false),[salvando,setSalvando]=useState(false),[erro,setErro]=useState('')
  const carregar=()=>{setCarregando(true);setErro('');api<Motorista[]>('/api/motoristas').then(setMotoristas).catch(e=>setErro(e.message)).finally(()=>setCarregando(false))}
  useEffect(carregar,[])

  async function salvar(evento:FormEvent<HTMLFormElement>){
    evento.preventDefault();const form=new FormData(evento.currentTarget);setSalvando(true);setErro('')
    try{
      const motorista=await api<Motorista>('/api/motoristas',{method:'POST',body:JSON.stringify({nome:String(form.get('nome')),telefone:String(form.get('telefone')||'')||null,documento:String(form.get('documento')||'')||null,qra:String(form.get('qra')||'')||null,usuarioId:null})})
      setMotoristas(lista=>[...lista,motorista]);setModal(false)
    }catch(e){setErro((e as Error).message)}finally{setSalvando(false)}
  }

  if(carregando)return <Carregando/>
  if(erro&&!motoristas.length)return <ErroPagina mensagem={erro} tentarNovamente={carregar}/>
  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Operação e identificação</span><h1>Funcionários</h1><p>Cadastros vinculados às OS Porto, com acesso ao histórico e à composição oficial de comissão.</p></div><button className="button button-primary" onClick={()=>setModal(true)}>+ Cadastrar funcionário</button></header>
    {erro?<div className="form-alert" role="alert">{erro}</div>:null}
    {motoristas.length?<section className="team-grid" aria-label="Funcionários cadastrados">{motoristas.map(motorista=><article className="panel team-card team-card-real" key={motorista.id}>
      <header><span className="team-avatar">{motorista.nome.split(' ').map(parte=>parte[0]).slice(0,2).join('')}</span><span><strong>{motorista.nome}</strong><small>{motorista.qra||'QRA não informado'}</small></span><span className={`staff-status ${motorista.ativo?'staff-disponivel':'staff-folga'}`}>{motorista.ativo?'Ativo':'Inativo'}</span></header>
      <div className="team-contact"><span>Telefone<strong>{motorista.telefone||'Não informado'}</strong></span><span>Usuário<strong>{motorista.usuarioId?'Vinculado':'Não vinculado'}</strong></span></div>
      <Link className="button button-ghost team-detail-action" to={`/equipe/${motorista.id}`}>Ver detalhes</Link>
    </article>)}</section>:<Vazio titulo="Nenhum funcionário cadastrado" descricao="Cadastre o primeiro funcionário para vinculá-lo às ordens de serviço."/>}

    {modal?<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="Cadastrar funcionário"><header><div><span className="eyebrow">Equipe</span><h2>Novo funcionário</h2></div><button aria-label="Fechar" onClick={()=>setModal(false)}>×</button></header>
      <form onSubmit={salvar} className="form-grid two-columns">
        <label className="field field-wide"><span>Nome</span><input name="nome" required/></label>
        <label className="field"><span>Telefone</span><input name="telefone"/></label>
        <label className="field"><span>QRA</span><input name="qra"/></label>
        <label className="field field-wide"><span>Documento</span><input name="documento"/></label>
        <div className="modal-actions field-wide"><button type="button" className="button button-ghost" onClick={()=>setModal(false)}>Cancelar</button><button className="button button-primary" disabled={salvando}>{salvando?'Salvando…':'Salvar funcionário'}</button></div>
      </form></section></div>:null}
  </div>
}
