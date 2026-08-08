import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, test, vi } from 'vitest'
import App from '../App'
import { dadosIniciais } from '../demo/dadosIniciais'
import { servidor } from '../test/servidor'

const TOKEN_KEY = 'fluxo-gestao:token:v1'

function abrir(path: string) {
  sessionStorage.setItem(TOKEN_KEY, 'token-admin-teste')
  window.history.replaceState({}, '', path)
  return render(<App />)
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

test('PostgreSQL vazio ignora lançamentos financeiros antigos do localStorage', async () => {
  localStorage.setItem('gestao-guincho:demo:v4', JSON.stringify({
    ...dadosIniciais,
    lancamentos: [
      { id: 901, tipo: 'DESPESA', categoria: 'Combustível', descricao: 'Gasolina', valor: 100, data: '2026-07-10', status: 'PAGO', origem: 'Demo' },
      { id: 902, tipo: 'RECEITA', categoria: 'Serviço', descricao: 'Atendimento', valor: 300, data: '2026-07-11', status: 'RECEBIDO', origem: 'Demo' },
      { id: 903, tipo: 'RECEITA', categoria: 'Serviço', descricao: 'Atendimento', valor: 250, data: '2026-07-12', status: 'RECEBIDO', origem: 'Demo' },
    ],
  }))
  localStorage.setItem('configuracao-legitima', 'preservar')
  servidor.use(http.get('/api/lancamentos', () => HttpResponse.json([])))

  abrir('/lancamentos')

  expect(await screen.findByRole('heading', { name: /entradas e saídas/i })).toBeInTheDocument()
  expect(screen.queryByText('Gasolina')).not.toBeInTheDocument()
  expect(screen.queryByText('Atendimento')).not.toBeInTheDocument()
  expect(localStorage.getItem('gestao-guincho:demo:v4')).toBeNull()
  expect(localStorage.getItem('configuracao-legitima')).toBe('preservar')
})

test('/despesas consulta o backend real', async () => {
  const consultou = vi.fn()
  servidor.use(http.get('/api/despesas', () => { consultou(); return HttpResponse.json([]) }))

  abrir('/despesas')

  expect(await screen.findByRole('heading', { name: /^despesas$/i })).toBeInTheDocument()
  expect(consultou).toHaveBeenCalledOnce()
})

test('/lancamentos consulta o extrato financeiro real', async () => {
  const consultou = vi.fn()
  servidor.use(http.get('/api/lancamentos', () => { consultou(); return HttpResponse.json([]) }))

  abrir('/lancamentos')

  expect(await screen.findByRole('heading', { name: /entradas e saídas/i })).toBeInTheDocument()
  expect(consultou).toHaveBeenCalledOnce()
})

test('/fluxo-caixa reutiliza o extrato financeiro real', async () => {
  const consultou = vi.fn()
  servidor.use(http.get('/api/lancamentos', () => { consultou(); return HttpResponse.json([]) }))

  abrir('/fluxo-caixa')

  expect(await screen.findByRole('heading', { name: /fluxo de caixa/i })).toBeInTheDocument()
  expect(consultou).toHaveBeenCalledOnce()
})

test('/veiculos consulta cadastro e resultado reais', async () => {
  const consultou = vi.fn()
  servidor.use(http.get('/api/veiculos', () => { consultou(); return HttpResponse.json([]) }))

  abrir('/veiculos')

  expect(await screen.findByRole('heading', { name: /veículos e custos/i })).toBeInTheDocument()
  expect(consultou).toHaveBeenCalledOnce()
})

test('/quilometragem consulta os registros reais', async () => {
  const consultou = vi.fn()
  servidor.use(http.get('/api/quilometragens', () => { consultou(); return HttpResponse.json([]) }))

  abrir('/quilometragem')

  expect(await screen.findByRole('heading', { name: /km rodado e km morto/i })).toBeInTheDocument()
  expect(consultou).toHaveBeenCalledOnce()
})
