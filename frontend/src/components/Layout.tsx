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
  ['/equipe', 'Socorristas', true, 'equipe'],
  ['/minha-comissao', 'Minha comissão', false, 'equipe'],
  ['/comissoes', 'Comissões', true, 'equipe'],
  ['/porto/dashboard', 'Dashboard Porto', true, 'porto'],
  ['/porto/importacoes', 'Importar relatórios', true, 'porto'],
  ['/porto/ordens-pagamento', 'Ordens de pagamento', true, 'porto'],
  ['/porto/ordens-servico', 'Ordens de serviço', true, 'porto'],
  ['/porto/pendencias', 'Pendências e devolvidos', true, 'porto'],
  ['/porto/calendario', 'Calendário de pagamentos', true, 'porto'],
  ['/porto/relatorios', 'Relatórios Porto', true, 'porto'],
  ['/configuracoes', 'Configurações', true, 'sistema'],
] as const
const grupos = { financeiro: 'Financeiro', operacao: 'Operação', equipe: 'Equipe', porto: 'Porto Seguro', sistema: 'Sistema' } as const

/**
 * Um traco por tela, em SVG inline - sem pacote de icones. Os 18 itens do menu
 * usavam o mesmo ponto generico, entao nada distinguia "Ordens de pagamento" de
 * "Ordens de servico" sem parar para ler o texto. Cada string e um unico path com
 * varios subcaminhos (M...), que o stroke desenha como se fossem varios tracos.
 */
const icones: Record<string,string> = {
  '/':'M3 3h7v7H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 14h7v7H3z',
  '/lancamentos':'M4 8h12M12 4l4 4-4 4M20 16H8M12 12l-4 4 4 4',
  '/contas-receber':'M12 3v9M9 9l3 3 3-3M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  '/dre':'M4 4v16h16M8 16v-5M12 16V7M16 16v-3',
  '/despesas':'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h4',
  '/quilometragem':'M3 17a9 9 0 0 1 18 0M12 17l5-6M3 17h18',
  '/veiculos':'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  '/equipe':'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a8 8 0 0 1 16 0v1',
  '/minha-comissao':'M3 8h16a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 8V7a2 2 0 0 1 2-2h11M17 14h2',
  '/comissoes':'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20v-1a7 7 0 0 1 14 0v1M16 5a3.5 3.5 0 0 1 0 7M18 13a6 6 0 0 1 4 6v1',
  '/porto/dashboard':'M3 12h4l2.5-7 4 14L16 12h5',
  '/porto/importacoes':'M12 15V3M8 7l4-4 4 4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  '/porto/ordens-pagamento':'M3 6h18v12H3zM3 10h18M7 14h4',
  '/porto/ordens-servico':'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 16h4',
  '/porto/pendencias':'M12 4 21 20H3zM12 10v4M12 17.5h.01',
  '/porto/calendario':'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
  '/porto/relatorios':'M6 3h8l4 4v14H6zM14 3v4h4M9 17v-3M12 17v-6M15 17v-2',
  '/configuracoes':'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1',
}
function Icone({rota}:{rota:string}){
  return <svg className="nav-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={icones[rota]??''}/>
  </svg>
}

export function Layout() {
  const { usuario, logout } = useAuth()
  const [aberto,setAberto]=useState(false)
  const admin=usuario?.perfil==='ADMINISTRADOR'
  return <div className="app-shell">
    <aside className={`sidebar ${aberto?'sidebar-open':''}`}>
      <div className="brand">
        <span className="brand-road" aria-hidden="true"><i/><i/></span>
        <div><strong>J M S</strong></div>
      </div>
      <nav className="primary-nav" aria-label="Navegação principal">
        {(Object.keys(grupos) as Array<keyof typeof grupos>).map(grupo => {
          const disponiveis=itens.filter(([, ,somenteAdmin,itemGrupo])=>itemGrupo===grupo&&(admin||!somenteAdmin))
          return disponiveis.length?<div className="nav-group" key={grupo}><span>{grupos[grupo]}</span>{disponiveis.map(([to,label])=>
            <NavLink key={to} to={to} end={to==='/'} onClick={()=>setAberto(false)}>
              <Icone rota={to}/><span>{label}</span>
            </NavLink>)}</div>:null
        })}
      </nav>
      <div className="sidebar-foot"><span>Gestão financeira para guinchos</span><small>Sistema de gestão · ANAIV</small></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <button className="menu-button" aria-label="Abrir menu" onClick={()=>setAberto(v=>!v)}>☰</button>
        <div className="period-signal"><i/> Dados financeiros sincronizados</div>
        <div className="operator">
          <span className="operator-avatar">{usuario?.nome.slice(0,2).toUpperCase()}</span>
          <span><strong>{usuario?.nome}</strong><small>{usuario?.perfil==='ADMINISTRADOR'?'Administrador':'Socorrista'}</small></span>
          <button className="logout-button" onClick={logout}>Sair</button>
        </div>
      </header>
      <main className="content"><Outlet/></main>
    </div>
    {aberto?<button className="sidebar-scrim" aria-label="Fechar menu" onClick={()=>setAberto(false)}/>:null}
  </div>
}
