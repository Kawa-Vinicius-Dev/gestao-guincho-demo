import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { listarFavoritos, salvarFavoritos } from '../dados/favoritos'
import { useAuth } from '../auth/AuthContext'
import { MarcaJms } from './MarcaJms'
import { ConfirmarSaida } from './ConfirmarSaida'
import { AbasDaTela } from './navegacao/AbasDaTela'
import { ondeEstou } from './navegacao/grupos'
import { useContadoresDoMenu } from './contadoresDoMenu'

// Menu enxuto (Kawa, 23/09/2026): o administrador ve so o item principal de
// cada grupo; as demais telas viram abas no topo (components/navegacao/grupos).
const itens = [
  ['/', 'Visão geral', true, 'financeiro'],
  ['/lancamentos', 'Extrato', true, 'financeiro'],
  ['/turno', 'Turno do dia', false, 'operacao'],
  ['/aprovacoes', 'Aprovações', true, 'operacao'],
  ['/despesas', 'Despesas', false, 'operacao'],
  ['/veiculos', 'Viaturas', true, 'operacao'],
  ['/equipe', 'Socorristas', true, 'equipe'],
  ['/minha-comissao', 'Meus serviços', false, 'equipe'],
  ['/porto/ordens-servico', 'Serviços', true, 'porto'],
  ['/porto/ordens-pagamento', 'OPs', true, 'porto'],
  // A importacao e a porta de entrada dos dados da Porto: tem item proprio
  // (Kawa, 23/09/2026: "importar tem por obrigacao ter uma tela so para ela").
  ['/porto/importacoes', 'Importar', true, 'porto'],
  ['/configuracoes', 'Configurações', true, 'sistema'],
] as const
/** Mesmo teto do backend (FavoritoMenuController.MAXIMO): o topo do menu tem de continuar curto. */
const LIMITE_FAVORITOS = 8

const grupos = { financeiro: 'Financeiro', operacao: 'Operação', equipe: 'Equipe', porto: 'Porto Seguro', sistema: 'Sistema' } as const

/**
 * Um traco por tela, em SVG inline - sem pacote de icones. Os 18 itens do menu
 * usavam o mesmo ponto generico, entao nada distinguia "Ordens de pagamento" de
 * "Ordens de servico" sem parar para ler o texto. Cada string e um unico path com
 * varios subcaminhos (M...), que o stroke desenha como se fossem varios tracos.
 */
/**
 * Telas que so fazem sentido para o socorrista: sao sobre o turno e os servicos
 * DELE. No menu do administrador apareciam vazias (Kawa, 23/09/2026: "se nao
 * aparecer nada pode tirar"); o que o administrador precisa delas esta em
 * Aprovacoes e na ficha de cada socorrista.
 */
const SO_DO_SOCORRISTA = new Set(['/turno', '/minha-comissao', '/despesas'])
const vePeloPerfil = (rota: string, somenteAdmin: boolean, admin: boolean) =>
  admin ? !SO_DO_SOCORRISTA.has(rota) : !somenteAdmin

const icones: Record<string,string> = {
  '/':'M3 3h7v7H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 14h7v7H3z',
  '/lancamentos':'M4 8h12M12 4l4 4-4 4M20 16H8M12 12l-4 4 4 4',
  '/contas-receber':'M12 3v9M9 9l3 3 3-3M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  '/dre':'M4 4v16h16M8 16v-5M12 16V7M16 16v-3',
  '/turno':'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  '/aprovacoes':'M4 6h10M4 12h10M4 18h7M16 16l2 2 4-4',
  '/despesas':'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h4',
  '/quilometragem':'M3 17a9 9 0 0 1 18 0M12 17l5-6M3 17h18',
  '/veiculos':'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  '/desempenho':'M4 20V10M10 20V4M16 20v-7M22 20H2',
  '/equipe':'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a8 8 0 0 1 16 0v1',
  '/minha-comissao':'M3 8h16a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 8V7a2 2 0 0 1 2-2h11M17 14h2',
  '/comissoes':'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20v-1a7 7 0 0 1 14 0v1M16 5a3.5 3.5 0 0 1 0 7M18 13a6 6 0 0 1 4 6v1',
  '/porto/dashboard':'M3 12h4l2.5-7 4 14L16 12h5',
  '/porto/diario':'M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1M8 12h3M8 16h6',
  '/porto/importacoes':'M12 15V3M8 7l4-4 4 4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  '/porto/ordens-pagamento':'M3 6h18v12H3zM3 10h18M7 14h4',
  '/porto/ordens-servico':'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 16h4',
  '/porto/pendencias':'M12 4 21 20H3zM12 10v4M12 17.5h.01',
  '/porto/devolvidos':'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10H9',
  '/porto/contestacoes':'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM12 8v5M12 16h.01',
  '/porto/relatorios':'M6 3h8l4 4v14H6zM14 3v4h4M9 17v-3M12 17v-6M15 17v-2',
  '/configuracoes':'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1',
}
/** Estrela de fixar: cheia quando o atalho esta na lista, contorno quando nao. */
function Estrela({fixado}:{fixado:boolean}){
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"
      fill={fixado?'currentColor':'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
  </svg>
}

/**
 * Uma linha do menu: o link e, colada nele, a estrela que fixa ou solta o atalho.
 * A estrela e um botao separado de proposito - dentro do link, clicar nela
 * navegaria junto.
 */
/** O que pede acao naquela tela: o contador aparece so quando ha algo. */
const DICA_DO_CONTADOR: Record<string, string> = {
  '/aprovacoes': 'aguardando aprovação',
  '/porto/ordens-servico': 'OS do período com pendência (sem valor, socorrista ou viatura)',
}

function ItemDoMenu({rota,titulo,fixado,aoFixar,aoNavegar,contador=0}:{
  rota:string; titulo:string; fixado:boolean;
  aoFixar:(rota:string)=>void; aoNavegar:()=>void; contador?:number
}){
  // Fica aceso em qualquer aba do grupo: em Quilometragem, o item e Viaturas.
  const { pathname, search } = useLocation()
  const doGrupo=ondeEstou(pathname,search)?.grupo.menu===rota
  return <span className="nav-item">
    <NavLink to={rota} end={rota==='/'} onClick={aoNavegar}
      className={({isActive})=>(isActive||doGrupo)?'active':undefined}>
      <Icone rota={rota}/><span>{titulo}</span>
      {contador>0?<span className="nav-contador" title={`${contador} ${DICA_DO_CONTADOR[rota]??'pendentes'}`}
        aria-label={`${contador} ${DICA_DO_CONTADOR[rota]??'pendentes'}`}>{contador>99?'99+':contador}</span>:null}
    </NavLink>
    <button type="button" className={fixado?'nav-estrela fixada':'nav-estrela'}
      aria-pressed={fixado}
      aria-label={fixado?`Tirar ${titulo} dos atalhos`:`Fixar ${titulo} nos atalhos`}
      onClick={()=>aoFixar(rota)}>
      <Estrela fixado={fixado}/>
    </button>
  </span>
}

function Icone({rota}:{rota:string}){
  return <svg className="nav-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={icones[rota]??''}/>
  </svg>
}

/**
 * Grupos recolhiveis na barra lateral, um aberto por vez.
 *
 * Com os dezoito itens abertos o menu ocupa 947px, e a barra so tem 888px numa
 * tela de 1080 — 708px numa de 900, 576px num notebook de 768, 448px num
 * 1366x768 com a barra do navegador. A lista nao cabia em tela nenhuma, e a
 * rolagem interna era o sintoma. Encolher os itens nao resolvia: para caber em
 * 768 cada um teria de ir de 41px para 25px.
 *
 * E um aberto por vez, e nao varios, porque com dois abertos a conta volta a
 * estourar: Financeiro (4 itens) mais Porto (7) dao 676px, 100 a mais do que
 * cabe num 768. Acordeao e o unico arranjo que garante que nunca ha o que rolar.
 *
 * O grupo aberto acompanha a rota: chegando numa tela do Porto, o grupo do Porto
 * abre sozinho. Esconder de onde a pessoa esta desorienta.
 */

export function Layout() {
  const { usuario, logout } = useAuth()
  const { pathname, search } = useLocation()
  const [aberto,setAberto]=useState(false)
  // Menu aberto no celular fecha no Esc, como o fundo escuro ja fecha no toque.
  useEffect(()=>{
    if(!aberto)return
    const aoTeclar=(evento:KeyboardEvent)=>{if(evento.key==='Escape')setAberto(false)}
    document.addEventListener('keydown',aoTeclar)
    return()=>document.removeEventListener('keydown',aoTeclar)
  },[aberto])
  const [saindo,setSaindo]=useState(false)
  const admin=usuario?.perfil==='ADMINISTRADOR'
  const contadores=useContadoresDoMenu(admin)

  // Qual grupo contem a tela atual. E ele que abre quando nao ha escolha guardada,
  // e ele nunca fica fechado — esconder de onde a pessoa esta desorienta.
  // A tela pode ser uma aba (Quilometragem e aba de Viaturas): vale o item do grupo dela.
  const menuAtual=ondeEstou(pathname,search)?.grupo.menu
  const grupoAtual=(itens.find(([rota])=>menuAtual?rota===menuAtual:rota==='/'?pathname==='/':pathname.startsWith(rota))?.[3]
    ?? 'financeiro') as keyof typeof grupos

  /**
   * Atalhos da pessoa, vindos do backend. Enquanto nao chegam a lista e nula, e o
   * bloco nao aparece: piscar uma secao vazia e depois preenche-la e pior do que
   * ela chegar pronta um instante depois.
   */
  const [favoritos,setFavoritos]=useState<string[]|null>(null)
  useEffect(()=>{listarFavoritos().then(setFavoritos).catch(()=>setFavoritos([]))},[])

  function alternarFavorito(rota:string){
    const atuais=favoritos??[]
    const novos=atuais.includes(rota)?atuais.filter(r=>r!==rota):[...atuais,rota].slice(0,LIMITE_FAVORITOS)
    // Pinta na hora e manda depois: fixar um atalho nao deve esperar a rede. Se o
    // servidor recusar, volta ao que estava em vez de mentir que salvou.
    setFavoritos(novos)
    salvarFavoritos(novos).then(setFavoritos).catch(()=>setFavoritos(atuais))
  }

  // Favorito de um item que o perfil nao enxerga, ou de uma rota que saiu do
  // sistema, e ignorado aqui em vez de virar um link quebrado no topo do menu.
  const permitidos=itens.filter(([rota, ,somenteAdmin])=>vePeloPerfil(rota,somenteAdmin,admin))
  const fixados=new Set(favoritos??[])
  const atalhos=(favoritos??[])
    .map(rota=>permitidos.find(([to])=>to===rota))
    .filter((item):item is typeof permitidos[number] => item!==undefined)

  const [grupoAberto,setGrupoAberto]=useState<string>(grupoAtual)
  const [rotaVista,setRotaVista]=useState(pathname)
  // Navegou para outra area: o grupo dela assume. Durante a renderizacao mesmo,
  // sem efeito, para a barra nunca aparecer um quadro com o grupo errado aberto.
  if(rotaVista!==pathname){ setRotaVista(pathname); setGrupoAberto(grupoAtual) }

  const alternarGrupo=(grupo: string)=>setGrupoAberto(atual=>atual===grupo?'':grupo)
  return <div className="app-shell">
    <aside className={`sidebar ${aberto?'sidebar-open':''}`}>
      {/* A marca leva ao inicio: a Visao geral do dono, o turno do socorrista. */}
      <Link className="brand" to={admin?'/':'/turno'} onClick={()=>setAberto(false)}
        aria-label={admin?'JMS, ir para a Visão geral':'JMS, ir para o início'} title={admin?'Visão geral':'Início'}>
        <MarcaJms className="brand-mark"/>
        <span className="brand-texto"><strong>JMS</strong><small>Sistema de gestão</small></span>
      </Link>
      <nav className="primary-nav" aria-label="Navegação principal">
        {atalhos.length
          ? <div className="nav-group nav-atalhos">
              <span className="nav-atalhos-titulo">Atalhos</span>
              <div className="nav-group-itens">
                {atalhos.map(([to,label])=>
                  <ItemDoMenu key={to} rota={to} titulo={label} fixado contador={contadores[to]}
                    aoFixar={alternarFavorito} aoNavegar={()=>setAberto(false)}/>)}
              </div>
            </div>
          : null}
        {(Object.keys(grupos) as Array<keyof typeof grupos>).map(grupo => {
          const disponiveis=itens.filter(([rota, ,somenteAdmin,itemGrupo])=>itemGrupo===grupo&&vePeloPerfil(rota,somenteAdmin,admin))
          if(!disponiveis.length)return null
          const expandido=grupoAberto===grupo
          return <div className="nav-group" key={grupo}>
            <button type="button" className="nav-group-titulo" aria-expanded={expandido}
              onClick={()=>alternarGrupo(grupo)}>
              <span>{grupos[grupo]}</span>
              {!expandido&&disponiveis.some(([to])=>(contadores[to]??0)>0)?<i className="nav-grupo-ponto" aria-label="Há pendências neste grupo"/>:null}
              <i className="nav-seta" aria-hidden="true"/>
            </button>
            <div className="nav-group-itens" hidden={!expandido}>
              {disponiveis.map(([to,label])=>
                <ItemDoMenu key={to} rota={to} titulo={label} fixado={fixados.has(to)} contador={contadores[to]}
                  aoFixar={alternarFavorito} aoNavegar={()=>setAberto(false)}/>)}
            </div>
          </div>
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
          <button className="logout-button" onClick={()=>setSaindo(true)}>Sair</button>
        </div>
      </header>
      <main className="content">{admin?<AbasDaTela/>:null}<Outlet/></main>
    </div>
    {aberto?<button className="sidebar-scrim" aria-label="Fechar menu" onClick={()=>setAberto(false)}/>:null}
    {saindo?<ConfirmarSaida nome={usuario?.nome} aoCancelar={()=>setSaindo(false)} aoConfirmar={logout}/>:null}
  </div>
}
