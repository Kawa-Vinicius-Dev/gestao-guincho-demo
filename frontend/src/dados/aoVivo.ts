import { useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { invalidarCacheFinanceiro } from './cacheFinanceiro'
import { supabase } from './cliente'

/**
 * Dados em tempo real.
 *
 * Kawa: "eu adiciono uma despesa, ela tem que automaticamente entrar na minha
 * operacao". A tela aberta precisa ver a mudanca sem recarregar — venha ela
 * desta aba, de outra aba ou de outra pessoa.
 *
 * Um canal so, compartilhado por todas as telas, ouvindo as tabelas que mudam os
 * numeros. O aviso nao carrega dado nenhum que a tela use: ele so diz "mudou",
 * o cache financeiro cai e cada tela aberta consulta de novo pelo mesmo caminho
 * de sempre. Assim nenhuma regra de soma vive em dois lugares.
 *
 * Uma importacao da Porto grava centenas de linhas de uma vez; os avisos que
 * chegam juntos viram uma recarga so.
 */

const TABELAS = [
  'despesas', 'receitas', 'contas_receber', 'ordens_servico_porto',
  'ordens_pagamento_porto', 'pagamentos_comissao', 'quilometragens',
] as const

/** Espera curta para juntar a rajada de avisos de uma importacao. */
export const JANELA_MS = 400

type Ouvinte = () => void
const ouvintes = new Set<Ouvinte>()
let canal: RealtimeChannel | null = null
let espera: ReturnType<typeof setTimeout> | null = null

function avisarTodos() {
  espera = null
  invalidarCacheFinanceiro()
  for (const ouvinte of ouvintes) ouvinte()
}

/** Um aviso de mudanca: junta com os que chegarem logo depois. */
export function mudancaRecebida() {
  if (espera) clearTimeout(espera)
  espera = setTimeout(avisarTodos, JANELA_MS)
}

function abrirCanal() {
  if (canal || import.meta.env.MODE === 'test') return
  try {
    let novo = supabase().channel('financeiro-ao-vivo')
    for (const tabela of TABELAS) {
      novo = novo.on('postgres_changes', { event: '*', schema: 'public', table: tabela }, mudancaRecebida)
    }
    canal = novo.subscribe()
  } catch {
    // Sem Supabase configurado (build antigo, testes): a tela segue funcionando,
    // so sem o aviso ao vivo.
    canal = null
  }
}

function fecharCanalSeNinguemOuve() {
  if (ouvintes.size || !canal) return
  const aberto = canal
  canal = null
  void supabase().removeChannel(aberto).catch(() => {})
}

/** Registra quem quer saber que os numeros mudaram. Devolve o cancelamento. */
export function ouvirMudancas(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte)
  abrirCanal()
  return () => {
    ouvintes.delete(ouvinte)
    fecharCanalSeNinguemOuve()
  }
}

/**
 * Recarrega a tela quando os numeros mudarem em qualquer lugar.
 *
 * `recarregar` pode mudar a cada render; a inscricao nao: guardar a versao mais
 * recente numa ref evita abrir e fechar o canal a cada digitacao num filtro.
 */
export function useAoVivo(recarregar: () => void, ativo = true) {
  const atual = useRef(recarregar)
  useEffect(() => { atual.current = recarregar })
  useEffect(() => {
    if (!ativo) return
    return ouvirMudancas(() => atual.current())
  }, [ativo])
}
