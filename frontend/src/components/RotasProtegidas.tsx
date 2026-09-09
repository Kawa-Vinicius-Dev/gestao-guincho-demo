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
  return <Outlet/>
}
export function RotaAdministrador(){
  const {usuario}=useAuth()
  return usuario?.perfil==='ADMINISTRADOR'?<Outlet/>:<Navigate to="/despesas" replace/>
}
