import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { Carregando } from './components/EstadoPagina'
import { Layout } from './components/Layout'
import { RotaAdministrador, RotaProtegida } from './components/RotasProtegidas'
import { removerDadosDemoLegados } from './legacyStorage'

const Login=lazy(()=>import('./pages/LoginPage'))
const Dashboard=lazy(()=>import('./pages/DashboardPage'))
const Contas=lazy(()=>import('./pages/ContasReceberPage'))
const Lancamentos=lazy(()=>import('./pages/LancamentosPage'))
const Despesas=lazy(()=>import('./pages/DespesasPage'))
const Quilometragem=lazy(()=>import('./pages/QuilometragemPage'))
const Frotas=lazy(()=>import('./pages/FrotasPage'))
const FluxoCaixa=lazy(()=>import('./pages/FluxoCaixaPage'))
const Dre=lazy(()=>import('./pages/DrePage'))
const Equipe=lazy(()=>import('./pages/EquipePage'))
const EquipeDetalhe=lazy(()=>import('./pages/EquipeDetalhePage'))
const Receitas=lazy(()=>import('./pages/ReceitasPage'))
const MinhaComissao=lazy(()=>import('./pages/MinhaComissaoPage'))
const Comissoes=lazy(()=>import('./pages/ComissoesPage'))
const PortoImportacoes=lazy(()=>import('./pages/PortoImportacoesPage'))
const PortoDashboard=lazy(()=>import('./pages/PortoDashboardPage'))
const PortoOps=lazy(()=>import('./pages/PortoOrdensPagamentoPage'))
const PortoOss=lazy(()=>import('./pages/PortoOrdensServicoPage'))
const PortoPendencias=lazy(()=>import('./pages/PortoPendenciasPage'))
const PortoCalendario=lazy(()=>import('./pages/PortoCalendarioPage'))
const PortoRelatorios=lazy(()=>import('./pages/PortoRelatoriosPage'))
const NaoEncontrado=lazy(()=>import('./pages/NaoEncontradoPage'))

export default function App(){
  useEffect(()=>removerDadosDemoLegados(),[])
  return <BrowserRouter><AuthProvider><Suspense fallback={<Carregando/>}><Routes>
    <Route path="/login" element={<Login/>}/>
    <Route element={<RotaProtegida/>}><Route element={<Layout/>}>
      <Route path="/despesas" element={<Despesas/>}/>
      <Route path="/quilometragem" element={<Quilometragem/>}/>
      <Route path="/minha-comissao" element={<MinhaComissao/>}/>
      <Route element={<RotaAdministrador/>}>
        <Route index element={<Dashboard/>}/>
        <Route path="/lancamentos" element={<Lancamentos/>}/>
        <Route path="/contas-receber" element={<Contas/>}/>
        <Route path="/receitas" element={<Receitas/>}/>
        <Route path="/fluxo-caixa" element={<FluxoCaixa/>}/>
        <Route path="/dre" element={<Dre/>}/>
        <Route path="/veiculos" element={<Frotas/>}/>
        <Route path="/motoristas" element={<Equipe/>}/>
        <Route path="/equipe" element={<Equipe/>}/>
        <Route path="/equipe/:id" element={<EquipeDetalhe/>}/>
        <Route path="/comissoes" element={<Comissoes/>}/>
        <Route path="/porto/importacoes" element={<PortoImportacoes/>}/>
        <Route path="/porto/dashboard" element={<PortoDashboard/>}/>
        <Route path="/porto/ordens-pagamento" element={<PortoOps/>}/>
        <Route path="/porto/ordens-servico" element={<PortoOss/>}/>
        <Route path="/porto/pendencias" element={<PortoPendencias/>}/>
        <Route path="/porto/calendario" element={<PortoCalendario/>}/>
        <Route path="/porto/relatorios" element={<PortoRelatorios/>}/>
        <Route path="/usuarios" element={<Equipe/>}/>
      </Route>
      <Route path="*" element={<NaoEncontrado/>}/>
    </Route></Route>
  </Routes></Suspense></AuthProvider></BrowserRouter>
}
