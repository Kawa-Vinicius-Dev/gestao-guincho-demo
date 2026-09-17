import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { servidor } from '../test/servidor'

/**
 * Turno do dia, a tela do celular.
 *
 * O que estes testes protegem nao e o desenho, e a regra: o socorrista aponta e
 * o administrador confirma. Fechar sem foto e o unico caminho que nao pode
 * existir, porque e a foto que sustenta o km que vira custo da empresa.
 */
const SUPA = 'https://projeto-teste.supabase.co'

const turno = {
  socorrista: { id: 1, nome: 'JEFERSON MARTINS DA SILVA', qra: 'JM-12' },
  hoje: '2026-09-17',
  turnoAberto: null as unknown,
  turnosDevolvidos: [] as unknown[],
  ultimosTurnos: [] as unknown[],
  viaturas: [{ id: 2, identificacao: 'L168', ultimoHodometro: 148320 }],
  veiculoSugerido: 2,
}

async function abrir(resposta: Record<string, unknown>) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', SUPA)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
  vi.stubEnv('VITE_SUPABASE_MODULOS', 'tudo')
  const { esquecerCliente } = await import('../dados/cliente')
  esquecerCliente()
  const { default: Pagina } = await import('./TurnoPage')
  render(<MemoryRouter><Pagina/></MemoryRouter>)
  return resposta
}

afterEach(() => vi.unstubAllEnvs())

test('sem turno aberto, a tela pede a viatura e o odometro da saida', async () => {
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/meu_turno_do_dia`, () => HttpResponse.json(turno)))
  await abrir(turno)

  expect(await screen.findByRole('heading', { name: 'Abrir turno' })).toBeInTheDocument()
  // A viatura da ultima vez ja vem marcada: um toque no caso normal.
  expect(screen.getByRole('radio', { name: /L168/ })).toBeChecked()
  expect(screen.getByRole('button', { name: 'Abrir turno' })).toBeDisabled()
})

test('o botao de abrir so libera depois do odometro', async () => {
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/meu_turno_do_dia`, () => HttpResponse.json(turno)))
  const user = userEvent.setup()
  await abrir(turno)

  await user.type(await screen.findByLabelText('Odômetro na saída'), '148502')
  expect(screen.getByRole('button', { name: 'Abrir turno' })).toBeEnabled()

  // Toda acao importante diz antes o que vai acontecer.
  await user.click(screen.getByRole('button', { name: 'Abrir turno' }))
  expect(await screen.findByRole('heading', { name: 'Abrir o turno?' })).toBeInTheDocument()
  expect(screen.getByText('148.502 km')).toBeInTheDocument()
})

test('com turno aberto, fechar exige a foto do odometro', async () => {
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/meu_turno_do_dia`, () => HttpResponse.json({
    ...turno,
    turnoAberto: {
      id: 9, data: '2026-09-17', abertoEm: '2026-09-17T07:00:00Z', veiculoId: 2,
      veiculo: 'L168', hodometroInicial: 148320, temFotoAbertura: false,
      deDiaAnterior: false, observacoes: null,
    },
  })))
  const user = userEvent.setup()
  await abrir(turno)

  await user.type(await screen.findByLabelText('Odômetro na chegada'), '148502')
  // Km rodado e conta do sistema: ninguem digita "rodei 182 km".
  expect(screen.getByText(/Você rodou 182 km neste turno/)).toBeInTheDocument()
  // Sem foto o fechamento nao sai daqui, nem chega ao banco.
  expect(screen.getByRole('button', { name: 'Fechar turno' })).toBeDisabled()
})

test('turno de dia anterior avisa que precisa ser fechado antes', async () => {
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/meu_turno_do_dia`, () => HttpResponse.json({
    ...turno,
    turnoAberto: {
      id: 9, data: '2026-09-15', abertoEm: '2026-09-15T07:00:00Z', veiculoId: 2,
      veiculo: 'L168', hodometroInicial: 148320, temFotoAbertura: false,
      deDiaAnterior: true, observacoes: null,
    },
  })))
  await abrir(turno)

  expect(await screen.findByRole('alert')).toHaveTextContent(/continua aberto/)
})

test('turno devolvido mostra o motivo escrito pelo administrador', async () => {
  servidor.use(http.post(`${SUPA}/rest/v1/rpc/meu_turno_do_dia`, () => HttpResponse.json({
    ...turno,
    turnosDevolvidos: [{
      id: 7, data: '2026-09-16', veiculo: 'L168', hodometroInicial: 148138,
      hodometroFinal: 148320, motivo: 'A foto não mostra o odômetro.',
    }],
  })))
  await abrir(turno)

  expect(await screen.findByRole('heading', { name: 'Turno devolvido' })).toBeInTheDocument()
  expect(screen.getByText('A foto não mostra o odômetro.')).toBeInTheDocument()
})
