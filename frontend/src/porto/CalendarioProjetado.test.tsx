import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import PortoCalendarioPage from '../pages/PortoCalendarioPage'
import { servidor } from '../test/servidor'

const informado = {
  id: 1, dataPagamento: '2026-12-14', competenciaInicio: '2026-11-16', competenciaFim: '2026-11-30',
  descricao: '1º ciclo de dezembro de 2026', ativo: true, estimado: false, criadoEm: '', atualizadoEm: '',
}
const projetado = {
  id: 2, dataPagamento: '2027-01-15', competenciaInicio: '2026-12-16', competenciaFim: '2026-12-31',
  descricao: '1º ciclo de janeiro de 2027', ativo: true, estimado: true, criadoEm: '', atualizadoEm: '',
}

test('separa o ciclo projetado do que a Porto informou', async () => {
  servidor.use(http.get('/api/porto/calendario', () => HttpResponse.json([informado, projetado])))
  render(<PortoCalendarioPage />)

  const linhaProjetada = (await screen.findByText('1º ciclo de janeiro de 2027')).closest('tr')!
  expect(within(linhaProjetada).getByText('estimado')).toBeInTheDocument()

  const linhaInformada = screen.getByText('1º ciclo de dezembro de 2026').closest('tr')!
  expect(within(linhaInformada).queryByText('estimado')).not.toBeInTheDocument()

  expect(screen.getByText(/projetados pelo padrão da porto/i)).toBeInTheDocument()
})

test('corrigir a data do ciclo projetado o confirma', async () => {
  let enviado: Record<string, unknown> | null = null
  servidor.use(
    http.get('/api/porto/calendario', () => HttpResponse.json([projetado])),
    http.put('/api/porto/calendario/2', async ({ request }) => {
      enviado = await request.json() as Record<string, unknown>
      return HttpResponse.json({ ...projetado, ...enviado, estimado: false })
    }),
  )
  const user = userEvent.setup()
  render(<PortoCalendarioPage />)

  await user.click(await screen.findByRole('button', { name: /editar 1º ciclo de janeiro de 2027/i }))
  const dialogo = screen.getByRole('dialog')
  const dataPagamento = within(dialogo).getByLabelText(/data de pagamento/i)
  await user.clear(dataPagamento); await user.type(dataPagamento, '2027-01-13')
  await user.click(within(dialogo).getByRole('button', { name: /salvar alterações/i }))

  expect(enviado).toMatchObject({ dataPagamento: '2027-01-13', competenciaInicio: '2026-12-16' })
})

test('sem ciclo projetado o aviso não aparece', async () => {
  servidor.use(http.get('/api/porto/calendario', () => HttpResponse.json([informado])))
  render(<PortoCalendarioPage />)

  expect(await screen.findByText('1º ciclo de dezembro de 2026')).toBeInTheDocument()
  expect(screen.queryByText(/projetados pelo padrão da porto/i)).not.toBeInTheDocument()
})
