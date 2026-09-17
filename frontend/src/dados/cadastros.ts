import { api } from '../api/http'
import type { Categoria, Contratante } from '../types/modelos'
import { comCacheCurto, invalidarCadastro } from './cacheCurto'
import { excluirRegistro, ou, supabase } from './cliente'
import { moduloNoSupabase } from './modo'

/**
 * Categorias e contratantes — as duas listas curtas que quase toda tela abre.
 *
 * Sao os cadastros mais lidos do sistema: aparecem em cada seletor de lancamento.
 * Por isso o select nomeia as colunas e o filtro por tipo vai para o banco, em
 * vez de trazer tudo e filtrar no browser.
 */

const COLUNAS_CATEGORIA = 'id,nome,tipo,ativo'
const COLUNAS_CONTRATANTE = 'id,nome,documento,ativo'

type LinhaCategoria = { id: number; nome: string; tipo: 'RECEITA' | 'DESPESA'; ativo: boolean }
type LinhaContratante = { id: number; nome: string; documento: string | null; ativo: boolean }

export type TipoCategoria = 'RECEITA' | 'DESPESA'

/**
 * O backend aceitava `/api/categorias?tipo=DESPESA`; aqui o mesmo recorte vira um
 * `eq` na consulta. A tela de despesas so quer categorias de despesa — trazer as
 * de receita para descartar no browser seria egress gasto a toa.
 */
export async function listarCategorias(tipo?: TipoCategoria): Promise<Categoria[]> {
 return comCacheCurto(`categorias:${tipo ?? 'todas'}`, async () => {
  if (!moduloNoSupabase('categorias')) {
    return api<Categoria[]>(tipo ? `/api/categorias?tipo=${tipo}` : '/api/categorias')
  }
  let consulta = supabase().from('categorias').select(COLUNAS_CATEGORIA)
  if (tipo) consulta = consulta.eq('tipo', tipo)
  const linhas = ou(
    await consulta.order('nome'),
    'Não foi possível carregar as categorias.',
  ) as LinhaCategoria[]
  return linhas
 })
}

export async function criarCategoria(nome: string, tipo: TipoCategoria): Promise<Categoria> {
  invalidarCadastro(`categorias:${tipo}`)
  invalidarCadastro('categorias:todas')
  if (!moduloNoSupabase('categorias')) {
    return api<Categoria>('/api/categorias', { method: 'POST', body: JSON.stringify({ nome, tipo }) })
  }
  return ou(
    await supabase().from('categorias').insert({ nome, tipo })
      .select(COLUNAS_CATEGORIA).single(),
    'Não foi possível cadastrar a categoria.',
  ) as LinhaCategoria
}

export async function listarContratantes(): Promise<Contratante[]> {
  return comCacheCurto('contratantes', async () => {
    if (!moduloNoSupabase('contratantes')) return api<Contratante[]>('/api/contratantes')

    const linhas = ou(
      await supabase().from('contratantes').select(COLUNAS_CONTRATANTE).order('nome'),
      'Não foi possível carregar os contratantes.',
    ) as LinhaContratante[]
    return linhas.map(l => ({ id: l.id, nome: l.nome, documento: l.documento ?? undefined, ativo: l.ativo }))
  })
}

export async function criarContratante(nome: string, documento?: string | null): Promise<Contratante> {
  invalidarCadastro('contratantes')
  if (!moduloNoSupabase('contratantes')) {
    return api<Contratante>('/api/contratantes', {
      method: 'POST', body: JSON.stringify({ nome, documento: documento || null }),
    })
  }
  const linha = ou(
    await supabase().from('contratantes').insert({ nome, documento: documento || null })
      .select(COLUNAS_CONTRATANTE).single(),
    'Não foi possível cadastrar o contratante.',
  ) as LinhaContratante
  return { id: linha.id, nome: linha.nome, documento: linha.documento ?? undefined, ativo: linha.ativo }
}

function esquecerCategorias() {
  invalidarCadastro('categorias:RECEITA'); invalidarCadastro('categorias:DESPESA'); invalidarCadastro('categorias:todas')
}

export async function atualizarCategoria(id: number, nome: string): Promise<void> {
  esquecerCategorias()
  ou(await supabase().from('categorias').update({ nome }).eq('id', id).select('id').single(),
    'Não foi possível salvar a categoria.')
}

export async function excluirCategoria(id: number): Promise<void> {
  esquecerCategorias()
  await excluirRegistro('categorias', id, 'Não foi possível excluir a categoria.')
}

export async function atualizarContratante(id: number, nome: string, documento?: string | null): Promise<void> {
  invalidarCadastro('contratantes')
  ou(await supabase().from('contratantes').update({ nome, documento: documento || null }).eq('id', id).select('id').single(),
    'Não foi possível salvar o contratante.')
}

export async function excluirContratante(id: number): Promise<void> {
  invalidarCadastro('contratantes')
  await excluirRegistro('contratantes', id, 'Não foi possível excluir o contratante.')
}
