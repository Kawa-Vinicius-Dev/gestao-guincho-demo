import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { CampoDocumento, CampoPlaca, CampoTelefone, formatarDocumento, formatarTelefone } from './CamposMascarados'

/**
 * A tela mostra formatado, o backend recebe cru. Guardar o formatado faria o
 * mesmo documento existir de duas formas no banco.
 */
test('documento formata CPF e CNPJ enquanto digita', () => {
  expect(formatarDocumento('12345678901')).toBe('123.456.789-01')
  expect(formatarDocumento('12345678000190')).toBe('12.345.678/0001-90')
  // Digitacao pela metade nao pode travar nem inventar pontuacao sobrando.
  expect(formatarDocumento('123')).toBe('123')
  expect(formatarDocumento('1234')).toBe('123.4')
  // Ja formatado, nao duplica.
  expect(formatarDocumento('12.345.678/0001-90')).toBe('12.345.678/0001-90')
})

test('telefone aceita fixo e celular', () => {
  expect(formatarTelefone('8532223333')).toBe('(85) 3222-3333')
  expect(formatarTelefone('85999998888')).toBe('(85) 99999-8888')
})

test('documento envia so os digitos, nunca o formatado', async () => {
  const user = userEvent.setup()
  render(<form aria-label="f"><CampoDocumento rotulo="Documento" name="documento"/></form>)

  await user.type(screen.getByLabelText('Documento'), '12345678000190')

  expect(screen.getByLabelText('Documento')).toHaveValue('12.345.678/0001-90')
  const oculto = screen.getByRole('form').querySelector('input[name="documento"]')
  expect(oculto).toHaveValue('12345678000190')
})

test('telefone envia so os digitos', async () => {
  const user = userEvent.setup()
  render(<form aria-label="f"><CampoTelefone rotulo="Telefone" name="telefone"/></form>)

  await user.type(screen.getByLabelText('Telefone'), '85999998888')

  expect(screen.getByLabelText('Telefone')).toHaveValue('(85) 99999-8888')
  expect(screen.getByRole('form').querySelector('input[name="telefone"]')).toHaveValue('85999998888')
})

// A Porto escreve a placa em maiuscula; minuscula criava um segundo veiculo
// para o mesmo carro.
test('placa sobe para maiuscula e recusa pontuacao', async () => {
  const user = userEvent.setup()
  render(<CampoPlaca rotulo="Placa" name="placa"/>)

  await user.type(screen.getByLabelText('Placa'), 'abc-1d23')

  expect(screen.getByLabelText('Placa')).toHaveValue('ABC1D23')
})

// Teclado numerico no celular: e o que evita caçar digito num teclado de letras.
test('campos numericos pedem teclado numerico', () => {
  render(<>
    <CampoDocumento rotulo="Documento" name="d"/>
    <CampoTelefone rotulo="Telefone" name="t"/>
  </>)
  expect(screen.getByLabelText('Documento')).toHaveAttribute('inputmode', 'numeric')
  expect(screen.getByLabelText('Telefone')).toHaveAttribute('inputmode', 'tel')
})
