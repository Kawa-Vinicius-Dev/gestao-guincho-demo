import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Carregando } from './EstadoPagina'

export function RotaProtegida(){
  const {usuario,carregando}=useAuth()
  const {pathname}=useLocation()
  if(carregando)return <Carregando/>
  if(!usuario)return <Navigate to="/login" replace/>
  // senha provisoria so leva a um lugar: a troca. A API tambem recusa o resto, isto e so a tela.
  if(usuario.senhaProvisoria&&pathname!=='/trocar-senha')return <Navigate to="/trocar-senha" replace/>
  // O desenvolvedor nao pertence a empresa nenhuma: a unica tela dele e o painel.
  if(usuario.perfil==='DESENVOLVEDOR'&&pathname!=='/plataforma')return <Navigate to="/plataforma" replace/>
  return <Outlet/>
}
/** O painel da ANAIV. O banco recusa as chamadas de qualquer outro; isto e so a tela. */
export function RotaDesenvolvedor(){
  const {usuario}=useAuth()
  return usuario?.perfil==='DESENVOLVEDOR'?<Outlet/>:<Navigate to="/" replace/>
}
// Quem nao e administrador cai no turno do dia: e por ele que o dia do
// socorrista comeca, e e a unica tela que ele abre em pe, na rua.
export function RotaAdministrador(){
  const {usuario}=useAuth()
  return usuario?.perfil==='ADMINISTRADOR'?<Outlet/>:<Navigate to="/turno" replace/>
}
