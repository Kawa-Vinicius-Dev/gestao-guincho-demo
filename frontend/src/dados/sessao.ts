import { ApiError, api, tokenStorage } from '../api/http'
import type { Usuario } from '../types/modelos'
import { erroDoBanco, ou, supabase } from './cliente'
import { autenticacaoNoSupabase } from './modo'

/**
 * Sessao.
 *
 * O backend antigo emitia um token opaco de 32 bytes, guardava o hash numa
 * tabela `sessoes` e expirava em 12 horas. Quem faz isso agora e o Supabase
 * Auth: ele emite o JWT, renova sozinho antes de vencer e e esse JWT que as
 * policies do banco leem para saber quem esta pedindo.
 *
 * O que o Auth nao sabe — nome exibido, perfil de acesso, se a senha ainda e
 * provisoria — vem de `perfis`, na mesma chave. Sao dois lugares porque sao
 * duas coisas: credencial e cadastro.
 */

const COLUNAS_PERFIL = 'id,nome,email,perfil,ativo,senha_provisoria'

type LinhaPerfil = {
  id: string
  nome: string
  email: string
  perfil: Usuario['perfil']
  ativo: boolean
  senha_provisoria: boolean
}

function paraUsuario(linha: LinhaPerfil): Usuario {
  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    perfil: linha.perfil,
    ativo: linha.ativo,
    senhaProvisoria: linha.senha_provisoria,
  }
}

/**
 * Le o perfil de quem esta na sessao.
 *
 * O perfil NAO sai do JWT nem de nada que o browser possa escrever: sai de uma
 * consulta a `perfis`, filtrada pelas policies. Guardar "sou administrador" em
 * algo que o cliente controla seria autorizar pelo frontend — e quem decide o
 * que cada um alcanca e o banco, a cada consulta.
 */
async function perfilDaSessao(): Promise<Usuario | null> {
  const { data: sessao } = await supabase().auth.getSession()
  if (!sessao.session) return null

  const linha = ou(
    await supabase().from('perfis').select(COLUNAS_PERFIL)
      .eq('id', sessao.session.user.id).maybeSingle(),
    'Não foi possível carregar seu perfil.',
  ) as LinhaPerfil | null

  // Conta existe no Auth mas nao tem perfil, ou foi desativada: sem perfil ativo
  // nenhuma policy libera nada, e ficar "logado" numa tela vazia e pior do que
  // nao entrar. Encerra a sessao.
  if (!linha || !linha.ativo) {
    await supabase().auth.signOut()
    return null
  }
  return paraUsuario(linha)
}

export async function usuarioAtual(): Promise<Usuario | null> {
  if (!autenticacaoNoSupabase()) {
    if (!tokenStorage.get()) return null
    return api<Usuario>('/api/auth/me')
  }
  return perfilDaSessao()
}

export async function entrar(email: string, senha: string): Promise<Usuario> {
  const emailNormalizado = email.trim().toLowerCase()

  if (!autenticacaoNoSupabase()) {
    const resposta = await api<{ token: string; usuario: Usuario }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email: emailNormalizado, senha }),
    })
    if (!resposta.token || resposta.token.startsWith('demo:')) {
      throw new ApiError('Resposta de autenticação inválida.', 401)
    }
    tokenStorage.set(resposta.token)
    return resposta.usuario
  }

  const { error } = await supabase().auth.signInWithPassword({
    email: emailNormalizado, password: senha,
  })
  if (error) {
    // O Auth responde "Invalid login credentials" em ingles e de proposito nao
    // diz se o que errou foi o email ou a senha — dizer entregaria a lista de
    // quem tem conta. A frase muda de idioma, a discricao continua.
    throw new ApiError('E-mail ou senha incorretos.', 401)
  }

  const usuario = await perfilDaSessao()
  if (!usuario) throw new ApiError('Seu acesso está inativo. Procure o administrador.', 403)
  return usuario
}

export async function sair(): Promise<void> {
  if (!autenticacaoNoSupabase()) {
    try {
      if (tokenStorage.get()) await api('/api/auth/logout', { method: 'POST' })
    } finally {
      tokenStorage.clear()
    }
    return
  }
  await supabase().auth.signOut()
}

/**
 * Troca de senha.
 *
 * Dois passos que precisam acontecer nesta ordem: o Auth grava a senha nova, e
 * so depois a marca de "senha provisoria" cai. A RPC recusa baixar a marca se a
 * senha nao tiver sido trocada ha pouco — sem isso, bastaria chamar a funcao
 * para sair da tela de troca sem trocar nada.
 */
export async function trocarSenha(senhaAtual: string, novaSenha: string): Promise<void> {
  if (!autenticacaoNoSupabase()) {
    await api('/api/auth/senha', {
      method: 'PUT', body: JSON.stringify({ senhaAtual, novaSenha }),
    })
    return
  }

  const { data: sessao } = await supabase().auth.getSession()
  const email = sessao.session?.user?.email
  if (!email) throw new ApiError('Sessão expirada. Entre novamente.', 401)

  // O Supabase nao pede a senha atual no updateUser. Sem conferir, quem
  // encontrasse uma aba aberta trocaria a senha sem saber a antiga e tomaria a
  // conta. A conferencia e um login com a senha informada.
  const { error: conferencia } = await supabase().auth.signInWithPassword({
    email, password: senhaAtual,
  })
  if (conferencia) throw new ApiError('A senha atual não confere.', 400)

  const { error } = await supabase().auth.updateUser({ password: novaSenha })
  if (error) throw erroDoBanco({ message: error.message }, 'Não foi possível trocar a senha.')

  ou(
    await supabase().rpc('concluir_troca_de_senha'),
    'Não foi possível concluir a troca de senha.',
  )
}

/**
 * Avisa quando a sessao cai — por expirar, por logout em outra aba ou porque o
 * refresh falhou. A tela ja ouvia `auth:expired`; aqui so muda quem dispara.
 */
export function observarSessao(aoPerder: () => void): () => void {
  if (!autenticacaoNoSupabase()) return () => {}
  const { data } = supabase().auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') aoPerder()
  })
  return () => data.subscription.unsubscribe()
}
