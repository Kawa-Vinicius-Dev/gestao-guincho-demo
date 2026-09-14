import { api } from '../api/http'
import type { Motorista } from '../types/modelos'
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
const COLUNAS = 'id,nome,telefone,documento,qra,ativo,veiculo_id,perfil_id,veiculos(identificacao)'

type LinhaMotorista = {
  id: number
  nome: string
  telefone: string | null
  documento: string | null
  qra: string | null
  ativo: boolean
  veiculo_id: number | null
  perfil_id: string | null
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
    ativo: linha.ativo,
    veiculoId: linha.veiculo_id ?? undefined,
    veiculo: identificacaoDaViatura(linha.veiculos),
    // A tela so pergunta se existe vinculo ("Vinculado" / "Nao vinculado"); o
    // valor em si nunca e exibido. Por isso o uuid do perfil cabe aqui sem
    // mudar nada do que a pessoa ve.
    usuarioId: linha.perfil_id ?? undefined,
  }
}

export interface DadosMotorista {
  nome: string
  telefone?: string | null
  documento?: string | null
  qra?: string | null
  veiculoId?: number | null
}

function paraBanco(dados: DadosMotorista) {
  return {
    nome: dados.nome,
    telefone: dados.telefone || null,
    documento: dados.documento || null,
    qra: dados.qra || null,
    veiculo_id: dados.veiculoId || null,
  }
}

export async function listarMotoristas(): Promise<Motorista[]> {
  if (!moduloNoSupabase('motoristas')) return api<Motorista[]>('/api/motoristas')

  const linhas = ou(
    await supabase().from('motoristas').select(COLUNAS).order('nome'),
    'Não foi possível carregar os socorristas.',
  ) as unknown as LinhaMotorista[]
  return linhas.map(paraModelo)
}

export async function criarMotorista(dados: DadosMotorista): Promise<Motorista> {
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
export async function alternarAtivoMotorista(motorista: Motorista): Promise<Motorista> {
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
