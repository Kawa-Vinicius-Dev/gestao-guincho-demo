import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { URL_SUPABASE, servidor } from '../test/servidor'

/**
 * Registro do atendimento no celular (Kawa, 24/09/2026): numero da OS, chegada e
 * uma foto de antes sao o minimo; o numero vai normalizado para juntar com a OS.
 */
URL.createObjectURL = vi.fn(() => 'blob:previa')
URL.revokeObjectURL = vi.fn()

test('só salva com OS, chegada e uma foto de antes; o número vai normalizado', async () => {
  let registrado: Record<string, unknown> = {}
  let anexado: Record<string, unknown> = {}
  servidor.use(
    http.post(`${URL_SUPABASE}/rest/v1/rpc/registrar_atendimento`, async ({ request }) => {
      registrado = await request.json() as Record<string, unknown>; return HttpResponse.json(41)
    }),
    http.post(`${URL_SUPABASE}/storage/v1/object/comprovantes/*`, () => HttpResponse.json({ Key: 'ok' })),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/anexar_arquivos_atendimento`, async ({ request }) => {
      anexado = await request.json() as Record<string, unknown>; return HttpResponse.json(null)
    }),
  )
  const { default: Pagina } = await import('./AtendimentoPage')
  const user = userEvent.setup({ delay: null })
  render(<MemoryRouter><Pagina /></MemoryRouter>)

  const salvar = await screen.findByRole('button', { name: 'Salvar atendimento' })
  expect(salvar).toBeDisabled()
  expect(screen.getByText('Digite o número da OS.')).toBeInTheDocument()

  await user.type(screen.getByLabelText('Número da OS'), '5673329/26')
  await user.click(screen.getByRole('button', { name: 'Cheguei agora' }))
  expect(screen.getByText('Tire pelo menos uma foto do veículo antes.')).toBeInTheDocument()
  await user.upload(screen.getAllByLabelText('Tirar foto')[0], new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
  await user.type(screen.getByLabelText('Placa do veículo do segurado opcional'), 'abc1d23')

  expect(salvar).toBeEnabled()
  await user.click(salvar)

  expect(await screen.findByText('✓ Atendimento da OS 5673329/26 salvo')).toBeInTheDocument()
  expect(registrado).toMatchObject({ p_numero_os: '5673329/26', p_numero_normalizado: '567332926', p_placa: 'ABC1D23' })
  expect((anexado.p_fotos as { antes: string[] }).antes[0]).toMatch(/^atendimentos\/41\/antes-1-/)
})
