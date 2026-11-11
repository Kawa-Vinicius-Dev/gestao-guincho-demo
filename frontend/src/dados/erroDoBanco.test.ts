import { expect, test } from 'vitest'
import { erroDoBanco, ehFalhaDeRede, SEM_REDE } from './cliente'

// As frases abaixo sao o que o socorrista le na rua. O texto cru do navegador
// ("Failed to fetch") nao diz o que fazer.
test('falha de rede vira frase com o que fazer, em qualquer navegador', () => {
  for (const message of ['TypeError: Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', 'Network request failed']) {
    const e = erroDoBanco({ message, code: '' }, 'x')
    expect(e.message).toBe(SEM_REDE)
    expect(e.status).toBe(503)
  }
  expect(ehFalhaDeRede({ name: 'AuthRetryableFetchError', message: '{}', status: 0 })).toBe(true)
  // 503 do servidor tem o mesmo nome, mas nao e falta de sinal.
  expect(ehFalhaDeRede({ name: 'AuthRetryableFetchError', message: '{}', status: 503 })).toBe(false)
})

test('sessao vencida pede para entrar de novo', () => {
  expect(erroDoBanco({ message: 'JWT expired', code: 'PGRST303' }, 'x').status).toBe(401)
  expect(erroDoBanco({ message: 'JWT expired', code: 'PGRST303' }, 'x').message).toBe('Sessão expirada. Entre novamente.')
})

test('mensagem escrita pelo banco (raise exception) passa como esta', () => {
  expect(erroDoBanco({ code: 'P0001', message: 'Informe o número da OS.' }, 'x').message).toBe('Informe o número da OS.')
})

test('erro comum nao e confundido com falta de rede', () => {
  expect(ehFalhaDeRede({ message: 'duplicate key value', code: '23505' })).toBe(false)
  expect(ehFalhaDeRede(null)).toBe(false)
})

test('erros do Storage (tamanho e tipo de arquivo) saem em portugues', () => {
  expect(erroDoBanco({ message: 'The object exceeded the maximum allowed size' }, 'x').status).toBe(413)
  expect(erroDoBanco({ message: 'mime type image/heic is not supported' }, 'x').message).toContain('JPG, PNG ou WEBP')
  expect(erroDoBanco({ message: 'new row violates row-level security policy' }, 'x').status).toBe(403)
})
