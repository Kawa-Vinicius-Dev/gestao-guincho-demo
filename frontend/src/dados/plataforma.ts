import { ApiError } from './erros'
import type { Perfil, SenhaRedefinida } from '../types/modelos'
import { ou, supabase } from './cliente'

/**
 * Painel da ANAIV (multiempresa, 14/11/2026).
 *
 * O desenvolvedor cria empresas, ve quantas pessoas cada uma tem e bloqueia ou
 * reativa. Nao ha aqui receita, despesa, OS nem cliente de ninguem: as funcoes
 * `plataforma_*` do banco so devolvem dados de conta e contagens, e recusam
 * quem nao esta na tabela `desenvolvedores`.
 */

export interface EmpresaDaPlataforma {
  id: string
  nome: string
  codigo: string
  ativa: boolean
  criadoEm: string
  bloqueadaEm: string | null
  motivoBloqueio: string | null
  gestores: number
  usuariosAtivos: number
  usuariosTotal: number
  socorristas: number
  viaturas: number
  ultimoAcesso: string | null
}

export interface UsuarioDaPlataforma {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo: boolean
  senhaProvisoria: boolean
  criadoEm: string
  ultimoAcesso: string | null
}

type LinhaEmpresa = {
  id: string; nome: string; codigo: string; ativa: boolean
  criado_em: string; bloqueada_em: string | null; motivo_bloqueio: string | null
  gestores: number; usuarios_ativos: number; usuarios_total: number
  socorristas: number; viaturas: number; ultimo_acesso: string | null
}

const paraEmpresa = (l: LinhaEmpresa): EmpresaDaPlataforma => ({
  id: l.id, nome: l.nome, codigo: l.codigo, ativa: l.ativa,
  criadoEm: l.criado_em, bloqueadaEm: l.bloqueada_em, motivoBloqueio: l.motivo_bloqueio,
  gestores: Number(l.gestores), usuariosAtivos: Number(l.usuarios_ativos),
  usuariosTotal: Number(l.usuarios_total), socorristas: Number(l.socorristas),
  viaturas: Number(l.viaturas), ultimoAcesso: l.ultimo_acesso,
})

export async function listarEmpresas(): Promise<EmpresaDaPlataforma[]> {
  const linhas = ou(
    await supabase().rpc('plataforma_empresas'),
    'Não foi possível carregar as empresas.',
  ) as LinhaEmpresa[] | null
  return (linhas ?? []).map(paraEmpresa)
}

export async function listarUsuariosDaEmpresa(empresaId: string): Promise<UsuarioDaPlataforma[]> {
  const linhas = ou(
    await supabase().rpc('plataforma_usuarios', { p_empresa: empresaId }),
    'Não foi possível carregar os usuários.',
  ) as {
    id: string; nome: string; email: string; perfil: Perfil; ativo: boolean
    senha_provisoria: boolean; criado_em: string; ultimo_acesso: string | null
  }[] | null
  return (linhas ?? []).map(l => ({
    id: l.id, nome: l.nome, email: l.email, perfil: l.perfil, ativo: l.ativo,
    senhaProvisoria: l.senha_provisoria, criadoEm: l.criado_em, ultimoAcesso: l.ultimo_acesso,
  }))
}

/** Cria a empresa ja com categorias, contratante e comissao padrao. Devolve o id. */
export async function criarEmpresa(nome: string): Promise<string> {
  const empresa = ou(
    await supabase().rpc('plataforma_criar_empresa', { p_nome: nome }),
    'Não foi possível criar a empresa.',
  ) as { id: string }
  return empresa.id
}

export async function definirEmpresaAtiva(empresaId: string, ativa: boolean, motivo?: string): Promise<void> {
  ou(
    await supabase().rpc('plataforma_definir_empresa_ativa', {
      p_empresa: empresaId, p_ativa: ativa, p_motivo: motivo ?? null,
    }),
    ativa ? 'Não foi possível reativar a empresa.' : 'Não foi possível bloquear a empresa.',
  )
}

/** Criar login exige a service_role: passa pela Edge Function, que confere quem chama. */
async function admin<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke('admin-usuarios', { body: corpo })
  if (error) {
    const detalhe = await (error as { context?: Response }).context?.json?.()
      .then((c: { detalhe?: string }) => c?.detalhe).catch(() => undefined)
    throw new ApiError(detalhe ?? 'Não foi possível concluir a operação.', 400)
  }
  return data as T
}

/** O gestor nasce com senha provisoria, que o desenvolvedor repassa a ele. */
export async function criarGestor(empresaId: string, nome: string, email: string): Promise<SenhaRedefinida> {
  return admin<SenhaRedefinida>({ acao: 'criar_gestor', empresaId, nome, email })
}

/** Suporte: o gestor que esqueceu a senha nao tem a quem pedir dentro da empresa. */
export async function redefinirSenhaDoGestor(perfilId: string): Promise<SenhaRedefinida> {
  return admin<SenhaRedefinida>({ acao: 'redefinir', perfilId })
}
