import { lazy, Suspense, useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { Carregando } from './components/EstadoPagina'
import { Layout } from './components/Layout'
import { RotaAdministrador, RotaProtegida } from './components/RotasProtegidas'
import { removerDadosDemoLegados } from './legacyStorage'

const Login=lazy(()=>import('./auth/LoginPage'))
const Dashboard=lazy(()=>import('./DashboardPage'))
const Contas=lazy(()=>import('./financeiro/ContasReceberPage'))
const Lancamentos=lazy(()=>import('./financeiro/LancamentosPage'))
const Despesas=lazy(()=>import('./financeiro/DespesasPage'))
const Quilometragem=lazy(()=>import('./frota/QuilometragemPage'))
const Turno=lazy(()=>import('./socorrista/TurnoPage'))
const KmDosServicos=lazy(()=>import('./socorrista/ServicosPage'))
const Aprovacoes=lazy(()=>import('./aprovacoes/AprovacoesPage'))
const Frotas=lazy(()=>import('./frota/FrotasPage'))
const Manutencao=lazy(()=>import('./frota/ManutencaoPage'))
const Documentos=lazy(()=>import('./frota/DocumentosPage'))
const Dre=lazy(()=>import('./financeiro/DrePage'))
const Equipe=lazy(()=>import('./equipe/EquipePage'))
const EquipeDetalhe=lazy(()=>import('./equipe/EquipeDetalhePage'))
const MinhaComissao=lazy(()=>import('./comissao/MinhaComissaoPage'))
const Comissoes=lazy(()=>import('./comissao/ComissoesPage'))
const Desempenho=lazy(()=>import('./desempenho/DesempenhoPage'))
const PortoImportacoes=lazy(()=>import('./porto/PortoImportacoesPage'))
const PortoDiario=lazy(()=>import('./porto/PortoDiarioPage'))
const PortoDashboard=lazy(()=>import('./porto/PortoDashboardPage'))
const PortoOps=lazy(()=>import('./porto/PortoOrdensPagamentoPage'))
const PortoOss=lazy(()=>import('./porto/PortoOrdensServicoPage'))
const PortoPendenciasOs=lazy(()=>import('./porto/PortoPendenciasOsPage'))
const PortoDevolvidos=lazy(()=>import('./porto/PortoPendenciasPage'))
const PortoRelatorios=lazy(()=>import('./porto/PortoRelatoriosPage'))
const PortoContestacoes=lazy(()=>import('./porto/PortoContestacoesPage'))
const Configuracoes=lazy(()=>import('./configuracoes/ConfiguracoesPage'))
const TrocarSenha=lazy(()=>import('./configuracoes/TrocarSenhaPage'))
const NaoEncontrado=lazy(()=>import('./NaoEncontradoPage'))

function MedirTransicaoDeRota(){
  const { pathname, search, hash } = useLocation()
  const inicioPendente=useRef<{rota:string;marca:string}|null>(null)

  useEffect(()=>{
    const iniciarNavegacao=(event:MouseEvent)=>{
      if(event.button!==0||event.metaKey||event.altKey||event.ctrlKey||event.shiftKey)return
      const alvo=event.target
      if(!(alvo instanceof Element))return
      const link=alvo.closest('a[href]')
      if(!(link instanceof HTMLAnchorElement)||(link.target&&link.target!=='_self')||link.hasAttribute('download'))return
      const destino=new URL(link.href,window.location.href)
      if(destino.origin!==window.location.origin)return
      const rota=`${destino.pathname}${destino.search}${destino.hash}`
      const rotaAtual=`${window.location.pathname}${window.location.search}${window.location.hash}`
      if(rota===rotaAtual)return
      const marca=`route:${rota}:start:${crypto.randomUUID()}`
      performance.mark(marca)
      inicioPendente.current={rota,marca}
    }
    document.addEventListener('click',iniciarNavegacao,true)
    return()=>document.removeEventListener('click',iniciarNavegacao,true)
  },[])

  useEffect(()=>{
    const rota=`${pathname}${search}${hash}`
    const nome=`route:${rota}`
    const pendente=inicioPendente.current
    const inicio=pendente?.rota===rota?pendente.marca:`${nome}:start:${crypto.randomUUID()}`
    const fim=`${nome}:end:${crypto.randomUUID()}`
    if(!pendente||pendente.rota!==rota)performance.mark(inicio)
    performance.mark(fim)
    performance.measure(nome,inicio,fim)
    inicioPendente.current=null
  },[pathname,search,hash])
  return null
}

export default function App(){
  useEffect(()=>removerDadosDemoLegados(),[])
  return <BrowserRouter><MedirTransicaoDeRota/><AuthProvider><Suspense fallback={<Carregando/>}><Routes>
    <Route path="/login" element={<Login/>}/>
    <Route element={<RotaProtegida/>}>
      <Route path="/trocar-senha" element={<TrocarSenha/>}/>
      <Route element={<Layout/>}>
      <Route path="/turno" element={<Turno/>}/>
      <Route path="/km-dos-servicos" element={<KmDosServicos/>}/>
      <Route path="/despesas" element={<Despesas/>}/>
      <Route path="/minha-comissao" element={<MinhaComissao/>}/>
      <Route element={<RotaAdministrador/>}>
        <Route index element={<Dashboard/>}/>
        <Route path="/lancamentos" element={<Lancamentos/>}/>
        <Route path="/contas-receber" element={<Contas/>}/>
        <Route path="/creditos" element={<Navigate to="/lancamentos" replace/>}/>
        <Route path="/receitas" element={<Navigate to="/lancamentos" replace/>}/>
        <Route path="/fluxo-caixa" element={<Navigate to="/lancamentos" replace/>}/>
        <Route path="/dre" element={<Dre/>}/>
        <Route path="/quilometragem" element={<Quilometragem/>}/>
        <Route path="/veiculos" element={<Frotas/>}/>
        <Route path="/manutencao" element={<Manutencao/>}/>
        <Route path="/documentos" element={<Documentos/>}/>
        <Route path="/motoristas" element={<Equipe/>}/>
        <Route path="/equipe" element={<Equipe/>}/>
        <Route path="/equipe/:id" element={<EquipeDetalhe/>}/>
        <Route path="/comissoes" element={<Comissoes/>}/>
        <Route path="/desempenho" element={<Desempenho/>}/>
        <Route path="/aprovacoes" element={<Aprovacoes/>}/>
        <Route path="/porto/importacoes" element={<PortoImportacoes/>}/>
        <Route path="/porto/diario" element={<PortoDiario/>}/>
        <Route path="/graficos" element={<PortoDashboard/>}/>
        {/* O Painel Porto virou a aba Graficos da Visao geral (Kawa, 23/09/2026). */}
        <Route path="/porto/dashboard" element={<Navigate to="/graficos" replace/>}/>
        <Route path="/porto/ordens-pagamento" element={<PortoOps/>}/>
        <Route path="/porto/ordens-servico" element={<PortoOss/>}/>
        <Route path="/porto/pendencias" element={<PortoPendenciasOs/>}/>
        <Route path="/porto/devolvidos" element={<PortoDevolvidos/>}/>
        <Route path="/porto/relatorios" element={<PortoRelatorios/>}/>
        <Route path="/porto/contestacoes" element={<PortoContestacoes/>}/>
        <Route path="/usuarios" element={<Equipe/>}/>
        <Route path="/configuracoes" element={<Configuracoes/>}/>
      </Route>
      <Route path="*" element={<NaoEncontrado/>}/>
    </Route></Route>
  </Routes></Suspense></AuthProvider></BrowserRouter>
}
