import type { Veiculo } from '../types/modelos'
import { comCacheCurto, invalidarCadastro } from './cacheCurto'
import { excluirRegistro } from './cliente'
import { ou, supabase } from './cliente'

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
  placa: string | null
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
    placa: linha.placa ?? undefined,
    modelo: linha.modelo ?? undefined,
    custoPorKm: Number(linha.custo_por_km),
    siglaPorto: linha.sigla_porto ?? undefined,
    ativo: linha.ativo,
  }
}

export interface DadosVeiculo {
  identificacao: string
  /** Viatura cadastrada pela importacao da Porto nasce sem placa. */
  placa?: string | null
  modelo?: string | null
  custoPorKm: number
  siglaPorto?: string | null
}

function paraBanco(dados: DadosVeiculo) {
  return {
    identificacao: dados.identificacao,
    placa: dados.placa?.trim() || null,
    modelo: dados.modelo || null,
    custo_por_km: dados.custoPorKm,
    sigla_porto: dados.siglaPorto || null,
  }
}

export async function listarVeiculos(): Promise<Veiculo[]> {
  return comCacheCurto('veiculos', async () => {

    // A ordem importa para a tela: a lista lateral da pagina de Veiculos e os
    // seletores de viatura aparecem em ordem de identificacao, como antes.
    const linhas = ou(
      await supabase().from('veiculos').select(COLUNAS).order('identificacao'),
      'Não foi possível carregar os veículos.',
    ) as LinhaVeiculo[]
    return linhas.map(paraModelo)
  })
}

export async function criarVeiculo(dados: DadosVeiculo): Promise<Veiculo> {
  invalidarCadastro('veiculos')
  const linha = ou(
    await supabase().from('veiculos').insert(paraBanco(dados)).select(COLUNAS).single(),
    'Não foi possível cadastrar o veículo.',
  ) as LinhaVeiculo
  return paraModelo(linha)
}

export async function atualizarVeiculo(id: number, dados: DadosVeiculo): Promise<Veiculo> {
  invalidarCadastro('veiculos')
  const linha = ou(
    await supabase().from('veiculos').update(paraBanco(dados)).eq('id', id)
      .select(COLUNAS).single(),
    'Não foi possível salvar o veículo.',
  ) as LinhaVeiculo
  return paraModelo(linha)
}

/** Viatura com despesa, km ou receita ligada nao sai: o banco recusa e a tela explica. */
export async function excluirVeiculo(id: number): Promise<void> {
  invalidarCadastro('veiculos')
  await excluirRegistro('veiculos', id, 'Não foi possível excluir a viatura.')
}
