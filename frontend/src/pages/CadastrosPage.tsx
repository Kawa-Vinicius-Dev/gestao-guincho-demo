import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/http'
import { Vazio } from '../components/EstadoPagina'
import type { Categoria, Contratante, Motorista, Usuario, Veiculo } from '../types/modelos'
import { moeda } from '../utils/formatadores'

type Tipo='veiculos'|'motoristas'|'usuarios'|'configuracoes'
const textos={
  veiculos:['Frota','Veículos','Custo por quilômetro e identificação dos guinchos.'],
  motoristas:['Equipe','Motoristas','Funcionários relacionados à operação e à quilometragem.'],
  usuarios:['Acesso','Usuários','Perfis que podem entrar no sistema e suas permissões.'],
  configuracoes:['Base financeira','Configurações','Contratantes, categorias e segurança da conta.'],
} as const
export default function CadastrosPage({tipo}:{tipo:Tipo}){
  const [dados,setDados]=useState<Array<Veiculo|Motorista|Usuario>>([]),[categorias,setCategorias]=useState<Categoria[]>([]),[contratantes,setContratantes]=useState<Contratante[]>([])
  const [form,setForm]=useState(false),[mensagem,setMensagem]=useState('')
  const carregar=()=>{if(tipo==='configuracoes')return Promise.all([api<Categoria[]>('/api/categorias'),api<Contratante[]>('/api/contratantes')]).then(([c,o])=>{setCategorias(c);setContratantes(o)})
    return api<Array<Veiculo|Motorista|Usuario>>(`/api/${tipo}`).then(setDados)}
  useEffect(()=>{carregar()},[tipo])
  async function salvar(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);let path=`/api/${tipo}`,body:Record<string,unknown>
    if(tipo==='veiculos')body={identificacao:f.get('identificacao'),placa:f.get('placa'),modelo:f.get('modelo')||null,custoPorKm:Number(f.get('custoPorKm'))}
    else if(tipo==='motoristas')body={nome:f.get('nome'),telefone:f.get('telefone')||null,documento:f.get('documento')||null}
    else body={nome:f.get('nome'),email:f.get('email'),senha:f.get('senha'),perfil:f.get('perfil')}
    try{await api(path,{method:'POST',body:JSON.stringify(body)});setForm(false);await carregar()}catch(x){setMensagem((x as Error).message)}
  }
  async function cadastroConfig(e:FormEvent<HTMLFormElement>,alvo:'categorias'|'contratantes'){e.preventDefault();const formulario=e.currentTarget;const f=new FormData(formulario)
    const body=alvo==='categorias'?{nome:f.get('nome'),tipo:f.get('tipo')}:{nome:f.get('nome'),documento:f.get('documento')||null}
    try{await api(`/api/${alvo}`,{method:'POST',body:JSON.stringify(body)});formulario.reset();await carregar()}catch(x){setMensagem((x as Error).message)}
  }
  async function senha(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget)
    try{await api('/api/auth/senha',{method:'PUT',body:JSON.stringify({senhaAtual:f.get('senhaAtual'),novaSenha:f.get('novaSenha')})});setMensagem('Senha alterada com segurança.')}catch(x){setMensagem((x as Error).message)}
  }
  const [eyebrow,titulo,descricao]=textos[tipo]
  if(tipo==='configuracoes')return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{titulo}</h1><p>{descricao}</p></div></header>
    {mensagem?<div className="success-notice">{mensagem}</div>:null}<div className="settings-grid">
      <section className="panel settings-card"><header><h2>Contratantes</h2><p>Porto Seguro e demais clientes pagadores.</p></header><ul className="simple-list">{contratantes.map(c=><li key={c.id}><strong>{c.nome}</strong><small>{c.documento||'Sem documento'}</small></li>)}</ul>
        <form onSubmit={e=>cadastroConfig(e,'contratantes')} className="inline-form"><input name="nome" placeholder="Nome do contratante" required/><input name="documento" placeholder="CNPJ/CPF"/><button className="button button-ghost">Adicionar</button></form></section>
      <section className="panel settings-card"><header><h2>Categorias</h2><p>Classifique para entender para onde o dinheiro vai.</p></header><ul className="simple-list">{categorias.map(c=><li key={c.id}><strong>{c.nome}</strong><small>{c.tipo}</small></li>)}</ul>
        <form onSubmit={e=>cadastroConfig(e,'categorias')} className="inline-form"><input name="nome" placeholder="Nome da categoria" required/><select name="tipo"><option>DESPESA</option><option>RECEITA</option></select><button className="button button-ghost">Adicionar</button></form></section>
      <section className="panel settings-card"><header><h2>Trocar senha</h2><p>A nova senha deve ter pelo menos oito caracteres.</p></header><form onSubmit={senha} className="form-grid"><label className="field"><span>Senha atual</span><input name="senhaAtual" type="password" required/></label><label className="field"><span>Nova senha</span><input name="novaSenha" type="password" minLength={8} required/></label><button className="button button-primary">Alterar senha</button></form></section>
      <section className="panel settings-card"><header><h2>Custos da frota</h2><p>O custo por km é configurado em cada veículo e aplicado ao km morto no momento do registro.</p></header><a className="button button-ghost" href="/veiculos">Configurar veículos</a></section>
    </div></div>
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{titulo}</h1><p>{descricao}</p></div><button className="button button-primary" onClick={()=>setForm(true)}>Novo cadastro</button></header>
    {mensagem?<div className="form-alert">{mensagem}</div>:null}<section className="panel">{dados.length?<div className="registry-grid">{dados.map(item=><article key={item.id}>
      <span className="registry-avatar">{'placa' in item?item.placa.slice(0,2):item.nome.slice(0,2).toUpperCase()}</span>
      <div><strong>{'identificacao' in item?item.identificacao:item.nome}</strong>
        <small>{'placa' in item?`${item.placa} · ${item.modelo||'Sem modelo'} · ${moeda(item.custoPorKm)}/km`:'email' in item?`${item.email} · ${item.perfil}`:`${item.telefone||'Sem telefone'} · ${item.documento||'Sem documento'}`}</small></div>
      <span className="active-mark">Ativo</span></article>)}</div>:<Vazio titulo={`Nenhum ${titulo.toLowerCase().slice(0,-1)}`} descricao="Use o botão acima para fazer o primeiro cadastro."/>}</section>
    {form?<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><header><div><span className="eyebrow">{eyebrow}</span><h2>Novo cadastro</h2></div><button aria-label="Fechar" onClick={()=>setForm(false)}>×</button></header><form onSubmit={salvar} className="form-grid">
      {tipo==='veiculos'?<><label className="field"><span>Identificação</span><input name="identificacao" placeholder="Guincho 01" required/></label><label className="field"><span>Placa</span><input name="placa" placeholder="ABC1D23" pattern="[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}" required/></label><label className="field"><span>Modelo</span><input name="modelo"/></label><label className="field"><span>Custo por quilômetro</span><input name="custoPorKm" type="number" step=".0001" min="0" required/></label></>:
      tipo==='motoristas'?<><label className="field"><span>Nome</span><input name="nome" required/></label><label className="field"><span>Telefone</span><input name="telefone"/></label><label className="field"><span>Documento</span><input name="documento"/></label></>:
      <><label className="field"><span>Nome</span><input name="nome" required/></label><label className="field"><span>E-mail</span><input name="email" type="email" required/></label><label className="field"><span>Senha inicial</span><input name="senha" type="password" minLength={8} required/></label><label className="field"><span>Perfil</span><select name="perfil"><option>FUNCIONARIO</option><option>ADMINISTRADOR</option></select></label></>}
      <div className="modal-actions"><button type="button" className="button button-ghost" onClick={()=>setForm(false)}>Cancelar</button><button className="button button-primary">Salvar cadastro</button></div>
    </form></section></div>:null}
  </div>
}
