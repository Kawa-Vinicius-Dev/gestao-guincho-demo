/**
 * Estado minimo do cache financeiro, separado do carregador do dashboard.
 *
 * A sessao importa este arquivo no login/logout. Mantê-lo sem dependencias evita
 * puxar o modulo Porto e as consultas do dashboard para o pacote inicial.
 */
type Entrada = { em: number; dados: unknown }

const cache = new Map<string, Entrada>()
let geracao = 0

export function entradaDoCacheFinanceiro<T>(chave: string): { em: number; dados: T } | undefined {
  return cache.get(chave) as { em: number; dados: T } | undefined
}

export function geracaoDoCacheFinanceiro(): number {
  return geracao
}

export function guardarNoCacheFinanceiro<T>(chave: string, dados: T, geracaoDoPedido: number): void {
  if (geracaoDoPedido === geracao) cache.set(chave, { em: Date.now(), dados })
}

export function invalidarCacheFinanceiro(): void {
  geracao++
  cache.clear()
}
