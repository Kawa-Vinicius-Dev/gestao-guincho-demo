import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { entrar, limparCachesDaSessao, observarSessao, sair, usuarioAtual } from '../dados/sessao'
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
  const [carregando,setCarregando]=useState(true)

  const limpar=useCallback(()=>{
    limparCachesDaSessao();setUsuario(null);setCarregando(false)
  },[])

  useEffect(()=>{
    let valeu=true
    usuarioAtual()
      .then(u=>{if(valeu)setUsuario(u)})
      .catch(()=>{if(valeu)limpar()})
      .finally(()=>{if(valeu)setCarregando(false)})
    return()=>{valeu=false}
  },[limpar])

  // Duas origens para a mesma perda de sessao: o 401 da API antiga e o
  // SIGNED_OUT do Supabase (expirou, saiu em outra aba, o refresh falhou).
  useEffect(()=>{
    window.addEventListener('auth:expired',limpar)
    const parar=observarSessao(limpar)
    return()=>{window.removeEventListener('auth:expired',limpar);parar()}
  },[limpar])

  const login=useCallback(async(email:string,senha:string)=>{
    setUsuario(await entrar(email,senha))
  },[])
  const logout=useCallback(async()=>{
    try{await sair()}finally{limpar()}
  },[limpar])

  const valor=useMemo(()=>({usuario,carregando,login,logout}),[usuario,carregando,login,logout])
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}
export function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error('AuthProvider ausente');return value}
/** A sessao, quando existe: telas que so mostram quem esta logado nao quebram fora do provedor. */
export function useSessaoOpcional(){return useContext(AuthContext)?.usuario??null}
