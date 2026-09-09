import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/http'
import type { Categoria, Contratante } from '../types/modelos'

export default function ConfiguracoesPage(){
  const [categorias,setCategorias]=useState<Categoria[]>([]),[contratantes,setContratantes]=useState<Contratante[]>([])
  const [mensagem,setMensagem]=useState(''),[erro,setErro]=useState('')
  const carregar=()=>Promise.all([api<Categoria[]>('/api/categorias'),api<Contratante[]>('/api/contratantes')])
    .then(([c,o])=>{setCategorias(c);setContratantes(o)}).catch(x=>setErro((x as Error).message))
  useEffect(()=>{void carregar()},[])
  async function cadastrar(e:FormEvent<HTMLFormElement>,alvo:'categorias'|'contratantes'){e.preventDefault();const formulario=e.currentTarget;const f=new FormData(formulario)
    const body=alvo==='categorias'?{nome:f.get('nome'),tipo:f.get('tipo')}:{nome:f.get('nome'),documento:f.get('documento')||null}
    setErro('');setMensagem('')
    try{await api(`/api/${alvo}`,{method:'POST',body:JSON.stringify(body)});formulario.reset();await carregar()}catch(x){setErro((x as Error).message)}
  }
  async function senha(e:FormEvent<HTMLFormElement>){e.preventDefault();const formulario=e.currentTarget;const f=new FormData(formulario)
    setErro('');setMensagem('')
    try{await api('/api/auth/senha',{method:'PUT',body:JSON.stringify({senhaAtual:f.get('senhaAtual'),novaSenha:f.get('novaSenha')})})
      formulario.reset();setMensagem('Senha alterada. Os acessos abertos em outros dispositivos foram encerrados.')}
    catch(x){setErro((x as Error).message)}
  }
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Base financeira</span><h1>Configurações</h1><p>Contratantes, categorias e segurança da conta.</p></div></header>
    {erro?<div className="form-alert">{erro}</div>:null}{mensagem?<div className="success-notice">{mensagem}</div>:null}<div className="settings-grid">
      <section className="panel settings-card"><header><h2>Contratantes</h2><p>Porto Seguro e demais clientes pagadores.</p></header><ul className="simple-list">{contratantes.map(c=><li key={c.id}><strong>{c.nome}</strong><small>{c.documento||'Sem documento'}</small></li>)}</ul>
        <form onSubmit={e=>cadastrar(e,'contratantes')} className="inline-form"><input name="nome" aria-label="Nome do contratante" placeholder="Nome do contratante" required/><input name="documento" aria-label="CNPJ ou CPF" placeholder="CNPJ/CPF"/><button className="button button-ghost">Adicionar</button></form></section>
      <section className="panel settings-card"><header><h2>Categorias</h2><p>Classifique para entender para onde o dinheiro vai.</p></header><ul className="simple-list">{categorias.map(c=><li key={c.id}><strong>{c.nome}</strong><small>{c.tipo}</small></li>)}</ul>
        <form onSubmit={e=>cadastrar(e,'categorias')} className="inline-form"><input name="nome" aria-label="Nome da categoria" placeholder="Nome da categoria" required/><select name="tipo" aria-label="Tipo da categoria"><option>DESPESA</option><option>RECEITA</option></select><button className="button button-ghost">Adicionar</button></form></section>
      <section className="panel settings-card"><header><h2>Trocar senha</h2><p>A nova senha deve ter pelo menos oito caracteres.</p></header><form onSubmit={senha} className="form-grid"><label className="field"><span>Senha atual</span><input name="senhaAtual" type="password" autoComplete="current-password" required/></label><label className="field"><span>Nova senha</span><input name="novaSenha" type="password" autoComplete="new-password" minLength={8} required/></label><button className="button button-primary">Alterar senha</button></form></section>
      <section className="panel settings-card"><header><h2>Custos da frota</h2><p>O custo por km é configurado em cada veículo e aplicado ao km morto no momento do registro.</p></header><a className="button button-ghost" href="/veiculos">Configurar veículos</a></section>
    </div></div>
}
