import { useState, type FormEvent } from 'react'
import { trocarSenha } from '../dados/sessao'
import { useAuth } from '../auth/AuthContext'
import { MarcaJms } from '../components/MarcaJms'

export default function TrocarSenhaPage(){
  const {usuario,logout}=useAuth()
  const [erro,setErro]=useState(''),[trocada,setTrocada]=useState(false),[enviando,setEnviando]=useState(false)
  async function trocar(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget);setErro('')
    const nova=String(f.get('novaSenha')),repetida=String(f.get('repetirSenha'))
    // A senha nova ninguem ve enquanto digita, e errar aqui tranca a pessoa para
    // fora: ela sairia desta tela sem saber que senha acabou de gravar.
    if(nova!==repetida){setErro('As duas senhas novas não são iguais. Digite de novo.');return}
    setEnviando(true)
    try{await trocarSenha(String(f.get('senhaAtual')),nova);setTrocada(true)}
    catch(x){setErro((x as Error).message)}finally{setEnviando(false)}
  }
  return <main className="login-page">
    <section className="login-brand">
      <MarcaJms className="login-mark"/>
      <span className="eyebrow">J M S · acesso</span>
      <h1>Escolha uma senha só sua.</h1>
      <p>A senha provisória serve apenas para este primeiro acesso.</p>
      <small>Sistema de gestão · ANAIV</small>
    </section>
    <section className="login-panel">
      {trocada
        ? <div className="form-grid"><span className="eyebrow">Pronto</span><h2>Senha alterada</h2>
            <div className="success-notice">Sua senha foi trocada e os acessos abertos foram encerrados. Entre de novo com a senha nova.</div>
            <button className="button button-primary button-block" onClick={()=>void logout()}>Ir para o login</button></div>
        : <form onSubmit={trocar}>
            <span className="eyebrow">{usuario?.senhaProvisoria?'Senha provisória':'Segurança'}</span><h2>Troque sua senha</h2>
            <p>{usuario?.senhaProvisoria
              ? 'A senha que você recebeu é temporária. Escolha a sua para liberar o sistema.'
              : 'Informe a senha atual e a nova senha.'}</p>
            {erro?<div className="form-alert" role="alert">{erro}</div>:null}
            <label className="field"><span>{usuario?.senhaProvisoria?'Senha provisória que você recebeu':'Senha atual'}</span><input name="senhaAtual" type="password" autoComplete="current-password" required/></label>
            <label className="field"><span>Nova senha</span><input name="novaSenha" type="password" autoComplete="new-password" minLength={8} required onInput={()=>setErro('')}/><small>Pelo menos 8 caracteres.</small></label>
            <label className="field"><span>Repita a nova senha</span><input name="repetirSenha" type="password" autoComplete="new-password" minLength={8} required onInput={()=>setErro('')}/></label>
            <button className="button button-primary button-block" disabled={enviando}>{enviando?'Salvando…':'Salvar nova senha'}</button>
          </form>}
    </section>
  </main>
}
