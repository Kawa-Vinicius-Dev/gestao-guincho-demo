import { api } from '../api/http'
import type { Veiculo } from '../types/modelos'
import { ou, supabase } from './cliente'
import { moduloNoSupabase } from './modo'

/**
 * Veiculos — o cadastro da frota.
 *
 * Duas implementacoes lado a lado. As telas chamam so as funcoes exportadas
 * daqui e nao sabem de onde o dado vem; trocar de origem e mudar a variavel de
 * ambiente. O caminho pelo Render continua inteiro, para rollback.
 */

/**
 * As colunas que as telas realmente usam, nomeadas uma a uma.
 *
 * `select('*')` traria junto criado_em e atualizado_em, que nenhuma tela mostra,
 * em toda listagem de toda pagina que abre um seletor de viatura. Sao bytes de
 * egress pagos a cada carregamento para preencher campos que ninguem le.
 */
const COLUNAS = 'id,identificacao,placa,modelo,custo_por_km,sigla_porto,ativo'

type LinhaVeiculo = {
  id: number
  identificacao: string
  placa: string
  modelo: string | null
  custo_por_km: number | string
  sigla_porto: string | null
  ativo: boolean
}

/**
 * O banco fala snake_case e devolve numeric como string (para nao perder
 * precisao no JSON); a tela fala camelCase e faz conta. A traducao fica aqui,
 * num lugar so, em vez de espalhada por cada componente.
 */
function paraModelo(linha: LinhaVeiculo): Veiculo {
  return {
    id: linha.id,
    identificacao: linha.identificacao,
    placa: linha.placa,
    modelo: linha.modelo ?? undefined,
    custoPorKm: Number(linha.custo_por_km),
    siglaPorto: linha.sigla_porto ?? undefined,
    ativo: linha.ativo,
  }
}

export interface DadosVeiculo {
  identificacao: string
  placa: string
  modelo?: string | null
  custoPorKm: number
  siglaPorto?: string | null
}

function paraBanco(dados: DadosVeiculo) {
  return {
    identificacao: dados.identificacao,
    placa: dados.placa,
    modelo: dados.modelo || null,
    custo_por_km: dados.custoPorKm,
    sigla_porto: dados.siglaPorto || null,
  }
}

export async function listarVeiculos(): Promise<Veiculo[]> {
  if (!moduloNoSupabase('veiculos')) return api<Veiculo[]>('/api/veiculos')

  // A ordem importa para a tela: a lista lateral da pagina de Veiculos e os
  // seletores de viatura aparecem em ordem de identificacao, como antes.
  const linhas = ou(
    await supabase().from('veiculos').select(COLUNAS).order('identificacao'),
    'Não foi possível carregar os veículos.',
  ) as LinhaVeiculo[]
  return linhas.map(paraModelo)
}

export async function criarVeiculo(dados: DadosVeiculo): Promise<Veiculo> {
  if (!moduloNoSupabase('veiculos')) {
    return api<Veiculo>('/api/veiculos', { method: 'POST', body: JSON.stringify(dados) })
  }
  const linha = ou(
    await supabase().from('veiculos').insert(paraBanco(dados)).select(COLUNAS).single(),
    'Não foi possível cadastrar o veículo.',
  ) as LinhaVeiculo
  return paraModelo(linha)
}

export async function atualizarVeiculo(id: number, dados: DadosVeiculo): Promise<Veiculo> {
  if (!moduloNoSupabase('veiculos')) {
    return api<Veiculo>(`/api/veiculos/${id}`, { method: 'PUT', body: JSON.stringify(dados) })
  }
  const linha = ou(
    await supabase().from('veiculos').update(paraBanco(dados)).eq('id', id)
      .select(COLUNAS).single(),
    'Não foi possível salvar o veículo.',
  ) as LinhaVeiculo
  return paraModelo(linha)
}
