import { expect, test } from 'vitest'
import { mascararOs, normalizarNumero, osCompleta } from './importacao'

test('o socorrista digita so os numeros e a OS sai no formato da Porto', () => {
  expect(mascararOs('01')).toBe('01')
  expect(mascararOs('014312')).toBe('01/4312')
  expect(mascararOs('0143122152')).toBe('01/4312215-2')
  expect(mascararOs('01431221526')).toBe('01/4312215-26')
  expect(mascararOs('01/4312215-26999')).toBe('01/4312215-26')
  expect(mascararOs('ab01 43x12215-26')).toBe('01/4312215-26')
})

test('so a OS completa libera o registro', () => {
  expect(osCompleta('01/4312215-2')).toBe(false)
  expect(osCompleta('01/4312215-26')).toBe(true)
})

test('a OS com mascara se liga a mesma OS que a importacao da Porto grava', () => {
  expect(normalizarNumero(mascararOs('01431221526'))).toBe(normalizarNumero('4312215/26'))
})
