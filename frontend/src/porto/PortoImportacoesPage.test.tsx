import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import PortoImportacoesPage from '../pages/PortoImportacoesPage'
import { servidor } from '../test/servidor'

test('envia CSV, exige OP para relatório de OS e confirma a prévia', async () => {
  let ordemSelecionada: number | null = null
  servidor.use(
    http.get('/api/porto/ordens-pagamento', () => HttpResponse.json([{ id: 9, numero: 'OP-900', valorTotal: 1500, situacao: 'PROGRAMADO' }])),
    http.post('/api/porto/importacoes/previa', () => HttpResponse.json({
      id: 12, nomeArquivo: 'os.csv', tipo: 'OS_VINCULADAS', status: 'AGUARDANDO_CONFERENCIA', totalLinhas: 1,
      requerOrdemPagamento: true, erros: [], linhas: [{ hashRegistro: 'hash', dados: { numero_os: 'OS-901', valor_total: '700.00', especialidade: 'REMOÇÃO' } }],
    }, { status: 201 })),
    http.post('/api/porto/importacoes/12/confirmar', async ({ request }) => {
      ordemSelecionada = Number((await request.json() as { ordemPagamentoId: number }).ordemPagamentoId)
      return HttpResponse.json({ importacaoId: 12, tipo: 'OS_VINCULADAS', importados: 1, ignorados: 0 })
    }),
  )
  const user=userEvent.setup()
  render(<PortoImportacoesPage />)
  const arquivo=new File(['Número da Ordem de Serviço;Valor Total\nOS-901;700'], 'os.csv', { type: 'text/csv' })
  await user.upload(screen.getByLabelText(/arquivo csv/i),arquivo)
  await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  expect(await screen.findByText('OS-901')).toBeInTheDocument()
  expect(screen.getByText(/OS vinculadas à OP/i)).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText(/ordem de pagamento/i),'9')
  await user.click(screen.getByRole('button',{name:/confirmar importação/i}))
  expect(await screen.findByText(/1 registro importado/i)).toBeInTheDocument()
  expect(ordemSelecionada).toBe(9)
})
