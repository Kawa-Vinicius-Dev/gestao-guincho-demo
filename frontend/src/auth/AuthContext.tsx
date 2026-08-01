import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, tokenStorage } from '../api/http'
import type { Usuario } from '../types/modelos'

interface AuthValue {
  usuario: Usuario | null
  carregando: boolean
  login(email:string,senha:string): Promise<void>
  logout(): Promise<void>
}
const AuthContext=createContext<AuthValue|null>(null)

export function AuthProvider({children}:{children:ReactNode}) {
  const [usuario,setUsuario]=useState<Usuario|null>(null)
  const [carregando,setCarregando]=useState(() => Boolean(tokenStorage.get()))

  const limpar=useCallback(()=>{tokenStorage.clear();setUsuario(null);setCarregando(false)},[])
  useEffect(()=>{
    const token=tokenStorage.get()
    if(!token){setCarregando(false);return}
    api<Usuario>('/api/auth/me').then(setUsuario).catch(limpar).finally(()=>setCarregando(false))
  },[limpar])
  useEffect(()=>{window.addEventListener('auth:expired',limpar);return()=>window.removeEventListener('auth:expired',limpar)},[limpar])
  const login=useCallback(async(email:string,senha:string)=>{
    const emailNormalizado=email.trim().toLowerCase()
    const resposta=await api<{token:string;usuario:Usuario}>('/api/auth/login',{method:'POST',body:JSON.stringify({email:emailNormalizado,senha})})
    if(!resposta.token||resposta.token.startsWith('demo:'))throw new Error('Resposta de autenticação inválida.')
    tokenStorage.set(resposta.token);setUsuario(resposta.usuario)
  },[])
  const logout=useCallback(async()=>{
    try{if(tokenStorage.get())await api('/api/auth/logout',{method:'POST'})}finally{limpar()}
  },[limpar])
  const valor=useMemo(()=>({usuario,carregando,login,logout}),[usuario,carregando,login,logout])
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}
export function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error('AuthProvider ausente');return value}
