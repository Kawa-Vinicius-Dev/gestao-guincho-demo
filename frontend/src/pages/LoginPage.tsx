import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const credencialLocal = import.meta.env.DEV
  ? { email: 'admin@fluxogestao.local', senha: 'Admin@123' }
  : null

export default function LoginPage(){
  const {usuario,login}=useAuth()
  const [erro,setErro]=useState('')
  const [enviando,setEnviando]=useState(false)
  if(usuario)return <Navigate to="/" replace/>
  async function entrar(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setErro('');setEnviando(true)
    const dados=new FormData(event.currentTarget)
    try{await login(String(dados.get('email')),String(dados.get('senha')))}
    catch(e){setErro(e instanceof Error?e.message:'Não foi possível entrar.')}
    finally{setEnviando(false)}
  }
  return <main className="login-page">
    <section className="login-brand">
      <div className="login-road" aria-hidden="true"><i/><i/><i/></div>
      <span className="eyebrow">Gestão Guincho · visão do dono</span>
      <h1>Da estrada ao lucro, sem perder nenhum custo.</h1>
      <p>Receitas, despesas, frota e km morto no mesmo fluxo financeiro.</p>
      <small>Gestão Guincho · demo profissional por ANAIV</small>
    </section>
    <section className="login-panel">
      <form onSubmit={entrar}>
        <span className="eyebrow">Acesso seguro</span><h2>Entre na sua conta</h2>
        <p>{credencialLocal?'Use o acesso administrativo do ambiente local.':'Informe suas credenciais para acessar o sistema.'}</p>
        {erro?<div className="form-alert" role="alert">{erro}</div>:null}
        <label className="field"><span>E-mail</span><input name="email" type="email" autoComplete="username" required defaultValue={credencialLocal?.email}/></label>
        <label className="field"><span>Senha</span><input name="senha" type="password" autoComplete="current-password" required defaultValue={credencialLocal?.senha}/></label>
        <button className="button button-primary button-block" disabled={enviando}>{enviando?'Entrando…':'Entrar no sistema'}</button>
        {credencialLocal?<div className="demo-credentials"><span><strong>Administrador local</strong>{credencialLocal.email} · {credencialLocal.senha}</span></div>:null}
      </form>
    </section>
  </main>
}
