import { ApiError, api } from '../api/http'
import type { SenhaRedefinida, Usuario } from '../types/modelos'
import { ou, supabase } from './cliente'
import { invalidarCadastro } from './cacheCurto'
import { moduloNoSupabase } from './modo'

/**
 * Contas de acesso.
 *
 * Listar e leitura comum de `perfis`, filtrada pelas policies. Criar conta,
 * redefinir senha e dar acesso a um socorrista passam pela Edge Function
 * `admin-usuarios`: exigem a service_role, que nao pode existir no navegador.
 * E o unico lugar desta migracao que precisa de servidor.
 */

const COLUNAS = 'id,nome,email,perfil,ativo,senha_provisoria'

type Linha = {
  id: string; nome: string; email: string
  perfil: Usuario['perfil']; ativo: boolean; senha_provisoria: boolean
}

const paraModelo = (l: Linha): Usuario => ({
  id: l.id, nome: l.nome, email: l.email, perfil: l.perfil,
  ativo: l.ativo, senhaProvisoria: l.senha_provisoria,
})

export async function listarUsuarios(): Promise<Usuario[]> {
  if (!moduloNoSupabase('usuarios')) return api<Usuario[]>('/api/usuarios')

  const linhas = ou(
    await supabase().from('perfis').select(COLUNAS).order('nome'),
    'Não foi possível carregar os usuários.',
  ) as Linha[]
  return linhas.map(paraModelo)
}

/** Chama a Edge Function com o JWT da sessao; ela confere o perfil antes de agir. */
async function admin<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke('admin-usuarios', { body: corpo })
  if (error) {
    const detalhe = await (error as { context?: Response }).context?.json?.()
      .then((c: { detalhe?: string }) => c?.detalhe).catch(() => undefined)
    throw new ApiError(detalhe ?? 'Não foi possível concluir a operação.', 400)
  }
  return data as T
}

export async function criarUsuario(
  nome: string, email: string, perfil: Usuario['perfil'],
): Promise<SenhaRedefinida> {
  if (!moduloNoSupabase('usuarios')) {
    return api<SenhaRedefinida>('/api/usuarios', {
      method: 'POST', body: JSON.stringify({ nome, email, perfil }),
    })
  }
  return admin<SenhaRedefinida>({ acao: 'criar', nome, email, perfil })
}

export async function redefinirSenha(usuario: Usuario): Promise<SenhaRedefinida> {
  if (!moduloNoSupabase('usuarios')) {
    return api<SenhaRedefinida>(`/api/usuarios/${usuario.id}/redefinir-senha`, { method: 'PATCH' })
  }
  return admin<SenhaRedefinida>({ acao: 'redefinir', perfilId: usuario.id })
}

/**
 * Liga ou desliga o acesso de uma conta sem apagar nada.
 *
 * Socorrista que saiu de ferias, foi afastado ou deixou a empresa perde a
 * entrada, mas o cadastro, as comissoes e o historico dele continuam de pe — e
 * o acesso volta com um clique quando ele voltar.
 */
export async function definirAcessoAtivo(perfilId: string, ativo: boolean): Promise<void> {
  ou(
    await supabase().from('perfis').update({ ativo }).eq('id', perfilId),
    ativo ? 'Não foi possível reativar o acesso.' : 'Não foi possível bloquear o acesso.',
  )
  invalidarCadastro('motoristas')
}

/**
 * Encerra o acesso de alguem, para sempre.
 *
 * Nao apaga nada: o login e banido e a conta fica desligada. Apagar a linha o
 * banco recusa de proposito — `despesas.criado_por` e `pagamentos_comissao`
 * sao `on delete restrict`, para o registro de quem fez o que nunca sumir.
 * O cadastro do socorrista se solta da conta e continua de pe, com servicos,
 * comissoes e historico.
 */
export async function encerrarAcesso(perfilId: string): Promise<void> {
  await admin<{ encerrado: boolean }>({ acao: 'encerrar', perfilId })
  invalidarCadastro('motoristas')
}

/**
 * Apaga a conta de vez. So funciona para quem nao deixou rastro no sistema:
 * conta criada errada, que e o caso de uso. Quem ja lancou algo o banco recusa,
 * e a Edge Function devolve a explicacao apontando para o encerramento.
 */
export async function excluirAcesso(perfilId: string): Promise<void> {
  await admin<{ excluido: boolean }>({ acao: 'excluir', perfilId })
  invalidarCadastro('motoristas')
}

/** Desfaz um encerramento: o login volta a valer e a conta religa. */
export async function reativarAcesso(perfilId: string): Promise<void> {
  await admin<{ reativado: boolean }>({ acao: 'reativar', perfilId })
}

/** Dar acesso cria a conta e a liga ao cadastro do socorrista, no mesmo passo. */
export async function criarAcessoSocorrista(
  motoristaId: number, email: string,
): Promise<SenhaRedefinida> {
  if (!moduloNoSupabase('usuarios')) {
    return api<SenhaRedefinida>(`/api/motoristas/${motoristaId}/acesso`, {
      method: 'POST', body: JSON.stringify({ email }),
    })
  }
  const r = await admin<SenhaRedefinida>({ acao: 'acesso', motoristaId, email })
  invalidarCadastro('motoristas')
  return r
}
