import { useEffect,useState,type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/http'
import { Carregando,ErroPagina,Vazio } from '../components/EstadoPagina'
import type { Motorista,Veiculo } from '../types/modelos'

export default function EquipePage(){
  const [motoristas,setMotoristas]=useState<Motorista[]>([])
  const [veiculos,setVeiculos]=useState<Veiculo[]>([])
  const [carregando,setCarregando]=useState(true),[modal,setModal]=useState(false),[salvando,setSalvando]=useState(false),[erro,setErro]=useState('')
  const [editando,setEditando]=useState<Motorista|null>(null)
  const carregar=()=>{setCarregando(true);setErro('');api<Motorista[]>('/api/motoristas').then(setMotoristas).catch(e=>setErro(e.message)).finally(()=>setCarregando(false))}
  useEffect(carregar,[])
  useEffect(()=>{api<Veiculo[]>('/api/veiculos').then(setVeiculos).catch(()=>setVeiculos([]))},[])

  function abrirCadastro(){setEditando(null);setErro('');setModal(true)}
  function abrirEdicao(motorista:Motorista){setEditando(motorista);setErro('');setModal(true)}
  function fechar(){setModal(false);setEditando(null)}
  async function salvar(evento:FormEvent<HTMLFormElement>){
    evento.preventDefault();const form=new FormData(evento.currentTarget);setSalvando(true);setErro('')
    const corpo={nome:String(form.get('nome')),telefone:String(form.get('telefone')||'')||null,documento:String(form.get('documento')||'')||null,qra:String(form.get('qra')||'')||null,usuarioId:editando?.usuarioId??null,veiculoId:Number(form.get('veiculoId'))||null}
    try{
      const motorista=editando
        ?await api<Motorista>(`/api/motoristas/${editando.id}`,{method:'PUT',body:JSON.stringify(corpo)})
        :await api<Motorista>('/api/motoristas',{method:'POST',body:JSON.stringify(corpo)})
      setMotoristas(lista=>editando?lista.map(item=>item.id===motorista.id?motorista:item):[...lista,motorista])
      fechar()
    }catch(e){setErro((e as Error).message)}finally{setSalvando(false)}
  }
  // desativar nao apaga: o socorrista sai dos vinculos novos e o historico dele continua de pe
  async function alternarAtivo(motorista:Motorista){
    setErro('')
    try{
      const atualizado=await api<Motorista>(`/api/motoristas/${motorista.id}/${motorista.ativo?'desativar':'reativar'}`,{method:'PATCH'})
      setMotoristas(lista=>lista.map(item=>item.id===atualizado.id?atualizado:item))
    }catch(e){setErro((e as Error).message)}
  }

  if(carregando)return <Carregando/>
  if(erro&&!motoristas.length)return <ErroPagina mensagem={erro} tentarNovamente={carregar}/>
  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Operação e identificação</span><h1>Socorristas</h1><p>Cadastros vinculados às OS Porto, com acesso ao histórico e à composição oficial de comissão.</p></div><button className="button button-primary" onClick={abrirCadastro}>+ Cadastrar socorrista</button></header>
    {erro?<div className="form-alert" role="alert">{erro}</div>:null}
    {motoristas.length?<section className="team-grid" aria-label="Socorristas cadastrados">{motoristas.map(motorista=><article className="panel team-card team-card-real" key={motorista.id}>
      <header><span className="team-avatar">{motorista.nome.split(' ').map(parte=>parte[0]).slice(0,2).join('')}</span><span><strong>{motorista.nome}</strong><small>{motorista.qra||'QRA não informado'}{motorista.veiculo?` · ${motorista.veiculo}`:' · sem viatura'}</small></span><span className={`staff-status ${motorista.ativo?'staff-disponivel':'staff-folga'}`}>{motorista.ativo?'Ativo':'Inativo'}</span></header>
      <div className="team-contact"><span>Telefone<strong>{motorista.telefone||'Não informado'}</strong></span><span>Usuário<strong>{motorista.usuarioId?'Vinculado':'Não vinculado'}</strong></span></div>
      <div className="team-card-actions"><Link className="button button-ghost team-detail-action" to={`/equipe/${motorista.id}`}>Ver detalhes</Link>
        <button className="table-action" onClick={()=>abrirEdicao(motorista)}>Editar</button>
        <button className={motorista.ativo?'table-action table-action-danger':'table-action'} onClick={()=>void alternarAtivo(motorista)}>{motorista.ativo?'Desativar':'Reativar'}</button></div>
    </article>)}</section>:<Vazio titulo="Nenhum socorrista cadastrado" descricao="Cadastre o primeiro socorrista para vinculá-lo às ordens de serviço."/>}

    {modal?<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label={editando?`Editar ${editando.nome}`:'Cadastrar socorrista'}><header><div><span className="eyebrow">Equipe</span><h2>{editando?'Editar socorrista':'Novo socorrista'}</h2></div><button aria-label="Fechar" onClick={fechar}>×</button></header>
      <form onSubmit={salvar} className="form-grid two-columns" key={editando?.id??'novo'}>
        <label className="field field-wide"><span>Nome</span><input name="nome" defaultValue={editando?.nome} required/></label>
        <label className="field"><span>Telefone</span><input name="telefone" defaultValue={editando?.telefone}/></label>
        <label className="field"><span>QRA</span><input name="qra" defaultValue={editando?.qra}/></label>
        <label className="field"><span>Viatura</span><select name="veiculoId" aria-label="Viatura" defaultValue={editando?.veiculoId??''}><option value="">Sem viatura</option>{veiculos.map(v=><option key={v.id} value={v.id}>{v.identificacao}</option>)}</select></label>
        <label className="field field-wide"><span>Documento</span><input name="documento" defaultValue={editando?.documento}/></label>
        <div className="modal-actions field-wide"><button type="button" className="button button-ghost" onClick={fechar}>Cancelar</button><button className="button button-primary" disabled={salvando}>{salvando?'Salvando…':editando?'Salvar alterações':'Salvar socorrista'}</button></div>
      </form></section></div>:null}
  </div>
}
