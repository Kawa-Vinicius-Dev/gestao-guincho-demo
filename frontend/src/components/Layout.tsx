import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const itens = [
  ['/', 'Visão geral', true, 'financeiro'],
  ['/lancamentos', 'Entradas e saídas', true, 'financeiro'],
  ['/contas-receber', 'Contas a receber', true, 'financeiro'],
  ['/dre', 'DRE mensal', true, 'financeiro'],
  ['/despesas', 'Registrar despesas', false, 'operacao'],
  ['/quilometragem', 'Km rodado e morto', false, 'operacao'],
  ['/veiculos', 'Veículos e custos', true, 'operacao'],
  ['/equipe', 'Funcionários', true, 'equipe'],
  ['/porto/dashboard', 'Dashboard Porto', true, 'porto'],
  ['/porto/importacoes', 'Importar relatórios', true, 'porto'],
  ['/porto/ordens-pagamento', 'Ordens de pagamento', true, 'porto'],
  ['/porto/ordens-servico', 'Ordens de serviço', true, 'porto'],
  ['/porto/pendencias', 'Pendências financeiras', true, 'porto'],
] as const
const grupos = { financeiro: 'Financeiro', operacao: 'Operação', equipe: 'Equipe', porto: 'Porto Seguro' } as const

export function Layout() {
  const { usuario, logout } = useAuth()
  const [aberto,setAberto]=useState(false)
  const admin=usuario?.perfil==='ADMINISTRADOR'
  return <div className="app-shell">
    <aside className={`sidebar ${aberto?'sidebar-open':''}`}>
      <div className="brand">
        <span className="brand-road" aria-hidden="true"><i/><i/></span>
        <div><strong>Gestão</strong><span>Guincho</span></div>
      </div>
      <nav className="primary-nav" aria-label="Navegação principal">
        {(Object.keys(grupos) as Array<keyof typeof grupos>).map(grupo => {
          const disponiveis=itens.filter(([, ,somenteAdmin,itemGrupo])=>itemGrupo===grupo&&(admin||!somenteAdmin))
          return disponiveis.length?<div className="nav-group" key={grupo}><span>{grupos[grupo]}</span>{disponiveis.map(([to,label])=>
            <NavLink key={to} to={to} end={to==='/'} onClick={()=>setAberto(false)}>
              <span className="nav-dot" aria-hidden="true"/><span>{label}</span>
            </NavLink>)}</div>:null
        })}
      </nav>
      <div className="sidebar-foot"><span>Gestão financeira para guinchos</span><small>Demo profissional · por ANAIV</small></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <button className="menu-button" aria-label="Abrir menu" onClick={()=>setAberto(v=>!v)}>☰</button>
        <div className="period-signal"><i/> Dados da demo sincronizados</div>
        <div className="operator">
          <span className="operator-avatar">{usuario?.nome.slice(0,2).toUpperCase()}</span>
          <span><strong>{usuario?.nome}</strong><small>{usuario?.perfil==='ADMINISTRADOR'?'Administrador':'Funcionário'}</small></span>
          <button className="logout-button" onClick={logout}>Sair</button>
        </div>
      </header>
      <main className="content"><Outlet/></main>
    </div>
    {aberto?<button className="sidebar-scrim" aria-label="Fechar menu" onClick={()=>setAberto(false)}/>:null}
  </div>
}
