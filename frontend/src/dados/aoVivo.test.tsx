import { act, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import DashboardPage from '../DashboardPage'
import { URL_SUPABASE, servidor } from '../test/servidor'
import { JANELA_MS, mudancaRecebida, ouvirMudancas } from './aoVivo'
import { geracaoDoCacheFinanceiro } from './cacheFinanceiro'

afterEach(() => { vi.useRealTimers(); sessionStorage.clear() })

// Uma importacao da Porto grava centenas de linhas: os avisos que chegam juntos
// viram uma recarga so, e o cache financeiro cai antes dela.
test('rajada de avisos vira uma recarga só, com o cache limpo', () => {
  vi.useFakeTimers()
  const ouvinte = vi.fn()
  const cancelar = ouvirMudancas(ouvinte)
  const geracaoAntes = geracaoDoCacheFinanceiro()

  mudancaRecebida(); mudancaRecebida(); mudancaRecebida()
  expect(ouvinte).not.toHaveBeenCalled()
  vi.advanceTimersByTime(JANELA_MS)

  expect(ouvinte).toHaveBeenCalledTimes(1)
  expect(geracaoDoCacheFinanceiro()).toBeGreaterThan(geracaoAntes)
  cancelar()
})

test('quem saiu da tela não recebe mais aviso', () => {
  vi.useFakeTimers()
  const ouvinte = vi.fn()
  ouvirMudancas(ouvinte)()

  mudancaRecebida()
  vi.advanceTimersByTime(JANELA_MS)

  expect(ouvinte).not.toHaveBeenCalled()
})

// Kawa: "eu adiciono uma despesa, ela tem que automaticamente entrar na minha
// operacao". Outra pessoa lanca; a Visao geral aberta atualiza sozinha, sem
// piscar o carregamento no meio.
test('a Visão geral aberta mostra a despesa nova sem recarregar a página', async () => {
  let despesas = 0
  servidor.use(http.post(`${URL_SUPABASE}/rest/v1/rpc/dashboard_resumo`, () => HttpResponse.json({ financeiro: {
    receitaRecebida: 1000, receitaPrevista: 0, totalAtrasado: 0,
    despesasPagas: despesas, despesasPrevistas: 0, saldoRealizado: 1000 - despesas,
    saldoProjetado: 1000 - despesas, registrosImportados: 0, quilometragemTotal: 0,
    kmRemunerado: 0, kmMorto: 0, custoKmMorto: 0, resultadoPorVeiculo: [],
  } })))
  render(<MemoryRouter><DashboardPage/></MemoryRouter>)
  expect(await screen.findByText('R$ 1.000,00', { selector: '.destaque-numero strong' })).toBeInTheDocument()

  despesas = 200
  await act(async () => { mudancaRecebida(); await new Promise(r => setTimeout(r, JANELA_MS + 50)) })

  expect(await screen.findByText('R$ 800,00', { selector: '.destaque-numero strong' })).toBeInTheDocument()
  expect(screen.queryByText(/carregando indicadores/i)).not.toBeInTheDocument()
})
