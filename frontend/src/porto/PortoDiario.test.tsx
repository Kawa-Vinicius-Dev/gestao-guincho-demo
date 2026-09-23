import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { expect, test, vi, beforeEach } from 'vitest'
import PortoDiarioPage from './PortoDiarioPage'
import { confirmarNaJanela } from '../test/confirmar'
import * as diario from '../dados/porto/diario'
import * as porto from '../dados/porto'
import type { PreviaPorto } from '../types/modelos'

vi.mock('../dados/porto/diario', async importOriginal => ({
  ...await importOriginal<typeof diario>(),
  mapaDoDiario: vi.fn(),
}))

vi.mock('../dados/porto', async importOriginal => ({
  ...await importOriginal<typeof porto>(),
  criarPreviaConteudoPorto: vi.fn(),
  confirmarImportacaoPorto: vi.fn(),
}))

const mapa = vi.mocked(diario.mapaDoDiario)
const criarPrevia = vi.mocked(porto.criarPreviaConteudoPorto)
const confirmar = vi.mocked(porto.confirmarImportacaoPorto)

const registro = (numero: string, dia: string) =>
  `PORTO SEGURO\t${numero}/26\tSOCORRO\tL25\tQEBSON RAMOS DA SILV\t${dia}\t06:49\t06:49\tACIONADO/FINAL\tFINALIZADO\tNão`

const previaDe = (numeros: string[]) => ({
  id: 9, nomeArquivo: 'Conteúdo colado', tipo: 'PAINEL_DIARIO', status: 'AGUARDANDO_CONFERENCIA',
  totalLinhas: numeros.length, requerOrdemPagamento: false, erros: [], orfas: [],
  linhas: numeros.map(n => ({
    hashRegistro: n, acao: 'IMPORTAR',
    dados: { numero_os: `${n}/26`, especialidade: 'SOCORRO', sigla_viatura: 'L25',
      socorrista: 'QEBSON RAMOS DA SILV', data_atendimento: '2026-09-01', situacao_porto: 'FINALIZADO' },
  })),
}) as unknown as PreviaPorto

beforeEach(() => {
  vi.clearAllMocks()
  mapa.mockResolvedValue([
    { dia: '2026-09-01', importado: true, os: 3, semValor: 3 },
    { dia: '2026-09-02', importado: false, os: 0, semValor: 0 },
  ])
})

async function colar(user: ReturnType<typeof userEvent.setup>, texto: string) {
  const campo = screen.getByLabelText(/consulta de serviços copiada da porto/i)
  await user.click(campo)
  await user.paste(texto)
  await user.click(screen.getByRole('button', { name: /analisar diário/i }))
}

test('colagem de mais de uma quinzena é recusada antes de virar prévia', async () => {
  const user = userEvent.setup({ delay: null })
  render(<MemoryRouter><PortoDiarioPage /></MemoryRouter>)

  await colar(user, [registro('5673329', '01/09/2026'), registro('5677129', '20/09/2026')].join('\n'))

  expect(await screen.findByRole('alert')).toHaveTextContent(/no máximo 16 dias/i)
  expect(criarPrevia).not.toHaveBeenCalled()
})

test('importa o Diário depois da confirmação e recarrega o mapa', async () => {
  criarPrevia.mockResolvedValue(previaDe(['5673329', '5677129']))
  confirmar.mockResolvedValue({ importados: 2, ignorados: 0 } as Awaited<ReturnType<typeof porto.confirmarImportacaoPorto>>)
  const user = userEvent.setup({ delay: null })
  render(<MemoryRouter><PortoDiarioPage /></MemoryRouter>)

  await colar(user, [registro('5673329', '01/09/2026'), registro('5677129', '03/09/2026')].join('\n'))

  expect(await screen.findByText('5673329/26')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /importar diário/i }))
  const janela = await screen.findByRole('dialog')
  expect(within(janela).getByText(/sem valor/i)).toBeInTheDocument()
  await confirmarNaJanela()

  expect(await screen.findByText(/2 serviços importados/i)).toBeInTheDocument()
  expect(confirmar).toHaveBeenCalledOnce()
  // O mapa recarrega para o dia importado deixar de aparecer como falta.
  expect(mapa).toHaveBeenCalledTimes(2)
})

test('o mapa mostra quantos dias ainda estão sem Diário', async () => {
  render(<MemoryRouter><PortoDiarioPage /></MemoryRouter>)

  expect(await screen.findByText(/1 dia ainda sem diário importado/i)).toBeInTheDocument()
})
