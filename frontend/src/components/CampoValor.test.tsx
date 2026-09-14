import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { CampoValor, centavosDe, formatarCentavos, valorEnviado } from './CampoValor'

test('os digitos entram pela direita, como numa maquina de somar', () => {
  expect(formatarCentavos(centavosDe('1'))).toBe('0,01')
  expect(formatarCentavos(centavosDe('14'))).toBe('0,14')
  expect(formatarCentavos(centavosDe('148'))).toBe('1,48')
  expect(formatarCentavos(centavosDe('148090'))).toBe('1.480,90')
})

test('o que a pessoa ve tem separador brasileiro e o que vai ao backend nao tem', () => {
  expect(formatarCentavos(148090)).toBe('1.480,90')
  expect(valorEnviado(148090)).toBe('1480.90')
})

test('ponto, virgula e letra digitados no meio sao ignorados', () => {
  expect(formatarCentavos(centavosDe('1.480,90'))).toBe('1.480,90')
  expect(formatarCentavos(centavosDe('R$ 96,40'))).toBe('96,40')
})

test('digitar so numero preenche a tela e o campo enviado', async () => {
  const user = userEvent.setup()
  render(<form><CampoValor rotulo="Valor" name="valor"/></form>)
  const visivel = screen.getByLabelText('Valor')
  await user.type(visivel, '148090')
  expect(visivel).toHaveValue('1.480,90')
  expect(document.querySelector('input[name=valor]')).toHaveValue('1480.90')
})

test('comeca vazio, e nao com 0,00, para o campo nao parecer preenchido', () => {
  render(<form><CampoValor rotulo="Valor" name="valor"/></form>)
  expect(screen.getByLabelText('Valor')).toHaveValue('')
  expect(document.querySelector('input[name=valor]')).toHaveValue('')
})

test('valor que vem do backend aparece formatado', () => {
  render(<form><CampoValor rotulo="Valor" name="valor" defaultValue={1480.9}/></form>)
  expect(screen.getByLabelText('Valor')).toHaveValue('1.480,90')
})
