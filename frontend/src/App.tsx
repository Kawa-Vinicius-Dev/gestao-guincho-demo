import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { Carregando } from './components/EstadoPagina'
import { Layout } from './components/Layout'
import { RotaAdministrador, RotaProtegida } from './components/RotasProtegidas'
import { DemoProvider } from './demo/DemoContext'

const Login=lazy(()=>import('./pages/LoginPage'))
const Dashboard=lazy(()=>import('./pages/DashboardPage'))
const Importacoes=lazy(()=>import('./pages/ImportacoesPage'))
const Contas=lazy(()=>import('./pages/RecebiveisPage'))
const Lancamentos=lazy(()=>import('./pages/LancamentosPage'))
const Quilometragem=lazy(()=>import('./pages/QuilometragemPage'))
const Frotas=lazy(()=>import('./pages/FrotasPage'))
const Dre=lazy(()=>import('./pages/DrePage'))
const Equipe=lazy(()=>import('./pages/EquipePage'))
const Escala=lazy(()=>import('./pages/EscalaPage'))
const Metas=lazy(()=>import('./pages/MetasPage'))
const Integracoes=lazy(()=>import('./pages/IntegracoesPage'))
const Relatorios=lazy(()=>import('./pages/RelatoriosPage'))
const NaoEncontrado=lazy(()=>import('./pages/NaoEncontradoPage'))

export default function App(){
  return <BrowserRouter><AuthProvider><DemoProvider><Suspense fallback={<Carregando/>}><Routes>
    <Route path="/login" element={<Login/>}/>
    <Route element={<RotaProtegida/>}><Route element={<Layout/>}>
      <Route path="/despesas" element={<Lancamentos filtroInicial="DESPESA"/>}/>
      <Route path="/quilometragem" element={<Quilometragem/>}/>
      <Route element={<RotaAdministrador/>}>
        <Route index element={<Dashboard/>}/>
        <Route path="/lancamentos" element={<Lancamentos/>}/>
        <Route path="/importacoes" element={<Importacoes/>}/>
        <Route path="/contas-receber" element={<Contas/>}/>
        <Route path="/receitas" element={<Lancamentos filtroInicial="RECEITA"/>}/>
        <Route path="/fluxo-caixa" element={<Lancamentos/>}/>
        <Route path="/dre" element={<Dre/>}/>
        <Route path="/veiculos" element={<Frotas/>}/>
        <Route path="/motoristas" element={<Equipe/>}/>
        <Route path="/equipe" element={<Equipe/>}/>
        <Route path="/escala" element={<Escala/>}/>
        <Route path="/metas" element={<Metas/>}/>
        <Route path="/relatorios" element={<Relatorios/>}/>
        <Route path="/integracoes" element={<Integracoes/>}/>
        <Route path="/usuarios" element={<Equipe/>}/>
        <Route path="/configuracoes" element={<Integracoes/>}/>
      </Route>
      <Route path="*" element={<NaoEncontrado/>}/>
    </Route></Route>
  </Routes></Suspense></DemoProvider></AuthProvider></BrowserRouter>
}
