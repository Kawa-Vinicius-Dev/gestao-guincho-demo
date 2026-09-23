import { api } from '../api/http'
import type { Motorista } from '../types/modelos'
import { comCacheCurto, invalidarCadastro } from './cacheCurto'
import { excluirRegistro } from './cliente'
import { ou, supabase } from './cliente'
import { moduloNoSupabase } from './modo'

/**
 * Socorristas.
 *
 * Nem tudo desta tela migra junto: criar o acesso de um socorrista (que cria uma
 * conta de login) continua no backend antigo. Criar usuario exige privilegio
 * administrativo, e esse privilegio nao pode existir no browser — e trabalho para
 * uma Edge Function, na fase dela. Ate la, o botao "Criar acesso" segue pelo
 * Render e o resto da tela ja vem do Supabase.
 */

/**
 * `veiculos(identificacao)` e um join embutido do PostgREST: vem na mesma ida ao
 * banco. A alternativa seria listar motoristas e depois buscar o nome de cada
 * viatura — o N+1 classico, uma consulta por linha da lista.
 */
const COLUNAS = 'id,nome,telefone,documento,qra,codigos_porto,ativo,veiculo_id,perfil_id,percentual_comissao,veiculos(identificacao)'

type LinhaMotorista = {
  id: number
  nome: string
  telefone: string | null
  documento: string | null
  qra: string | null
  codigos_porto?: string[] | null
  ativo: boolean
  veiculo_id: number | null
  perfil_id: string | null
  percentual_comissao?: number | string | null
  veiculos: { identificacao: string } | { identificacao: string }[] | null
}

function identificacaoDaViatura(veiculos: LinhaMotorista['veiculos']) {
  if (!veiculos) return undefined
  return Array.isArray(veiculos) ? veiculos[0]?.identificacao : veiculos.identificacao
}

function paraModelo(linha: LinhaMotorista): Motorista {
  return {
    id: linha.id,
    nome: linha.nome,
    telefone: linha.telefone ?? undefined,
    documento: linha.documento ?? undefined,
    qra: linha.qra ?? undefined,
    codigosPorto: linha.codigos_porto ?? [],
    ativo: linha.ativo,
    veiculoId: linha.veiculo_id ?? undefined,
    veiculo: identificacaoDaViatura(linha.veiculos),
    // A tela so pergunta se existe vinculo ("Vinculado" / "Nao vinculado"); o
    // valor em si nunca e exibido. Por isso o uuid do perfil cabe aqui sem
    // mudar nada do que a pessoa ve.
    usuarioId: linha.perfil_id ?? undefined,
    // numeric do Postgres chega como string no PostgREST.
    percentualComissao: linha.percentual_comissao == null ? undefined : Number(linha.percentual_comissao),
  }
}

export interface DadosMotorista {
  nome: string
  telefone?: string | null
  documento?: string | null
  qra?: string | null
  /** Codigos que a Porto usa no lugar do QRA para esta pessoa. */
  codigosPorto?: string[]
  veiculoId?: number | null
}

function paraBanco(dados: DadosMotorista) {
  return {
    nome: dados.nome,
    telefone: dados.telefone || null,
    documento: dados.documento || null,
    qra: dados.qra || null,
    ...(dados.codigosPorto ? { codigos_porto: dados.codigosPorto } : {}),
    veiculo_id: dados.veiculoId || null,
  }
}

export async function listarMotoristas(): Promise<Motorista[]> {
  return comCacheCurto('motoristas', async () => {
    if (!moduloNoSupabase('motoristas')) return api<Motorista[]>('/api/motoristas')

    const linhas = ou(
      await supabase().from('motoristas').select(COLUNAS).order('nome'),
      'Não foi possível carregar os socorristas.',
    ) as unknown as LinhaMotorista[]
    return linhas.map(paraModelo)
  })
}

export async function criarMotorista(dados: DadosMotorista): Promise<Motorista> {
  invalidarCadastro('motoristas')
  if (!moduloNoSupabase('motoristas')) {
    return api<Motorista>('/api/motoristas', { method: 'POST', body: JSON.stringify(dados) })
  }
  const linha = ou(
    await supabase().from('motoristas').insert(paraBanco(dados)).select(COLUNAS).single(),
    'Não foi possível cadastrar o socorrista.',
  ) as unknown as LinhaMotorista
  return paraModelo(linha)
}

export async function atualizarMotorista(id: number, dados: DadosMotorista): Promise<Motorista> {
  invalidarCadastro('motoristas')
  if (!moduloNoSupabase('motoristas')) {
    return api<Motorista>(`/api/motoristas/${id}`, { method: 'PUT', body: JSON.stringify(dados) })
  }
  const linha = ou(
    await supabase().from('motoristas').update(paraBanco(dados)).eq('id', id)
      .select(COLUNAS).single(),
    'Não foi possível salvar o socorrista.',
  ) as unknown as LinhaMotorista
  return paraModelo(linha)
}

/**
 * Desativar nao apaga: o socorrista sai dos vinculos novos e o historico dele
 * continua de pe. Era essa a regra do backend e continua sendo aqui.
 */
/**
 * A comissao deste socorrista, de 0 a 0,20.
 *
 * Vale para o que ainda nao fechou. OP que ja fechou comissao guarda a taxa
 * dela e nao se move — mudar a porcentagem hoje nao reescreve o que a pessoa
 * ja recebeu.
 */
export async function definirPercentualDoSocorrista(
  motoristaId: number, percentual: number | null,
): Promise<void> {
  invalidarCadastro('motoristas')
  ou(
    await supabase().rpc('definir_percentual_do_socorrista', {
      p_motorista_id: motoristaId, p_percentual: percentual,
    }),
    'Não foi possível salvar a comissão deste socorrista.',
  )
}

export async function alternarAtivoMotorista(motorista: Motorista): Promise<Motorista> {
  invalidarCadastro('motoristas')
  if (!moduloNoSupabase('motoristas')) {
    return api<Motorista>(
      `/api/motoristas/${motorista.id}/${motorista.ativo ? 'desativar' : 'reativar'}`,
      { method: 'PATCH' },
    )
  }
  const linha = ou(
    await supabase().from('motoristas').update({ ativo: !motorista.ativo })
      .eq('id', motorista.id).select(COLUNAS).single(),
    'Não foi possível alterar a situação do socorrista.',
  ) as unknown as LinhaMotorista
  return paraModelo(linha)
}

/** Socorrista com OS ou comissao nao sai: o banco recusa e a tela sugere desativar. */
export async function excluirMotorista(id: number): Promise<void> {
  invalidarCadastro('motoristas')
  await excluirRegistro('motoristas', id, 'Não foi possível excluir o socorrista.')
}

/**
 * Liga uma conta de socorrista que ja existe ao cadastro dele. Sem a ligacao a
 * pessoa entra no sistema mas nao ve os proprios servicos, turnos e comissao
 * (foi o que aconteceu com a conta do Anderson, criada em Acessos em 23/09/2026).
 */
export async function ligarAcessoAoSocorrista(motoristaId: number, perfilId: string): Promise<void> {
  invalidarCadastro('motoristas')
  ou(
    await supabase().from('motoristas').update({ perfil_id: perfilId }).eq('id', motoristaId),
    'Não foi possível ligar a conta ao socorrista.',
  )
}
