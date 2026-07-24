import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Carregando } from './EstadoPagina'

export function RotaProtegida(){
  const {usuario,carregando}=useAuth()
  if(carregando)return <Carregando/>
  return usuario?<Outlet/>:<Navigate to="/login" replace/>
}
export function RotaAdministrador(){
  const {usuario}=useAuth()
  return usuario?.perfil==='ADMINISTRADOR'?<Outlet/>:<Navigate to="/despesas" replace/>
}
