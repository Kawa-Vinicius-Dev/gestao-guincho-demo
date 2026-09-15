import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

import { limparCacheCurto } from '../dados/cacheCurto'
import { restaurarEstadoTeste, servidor } from './servidor'

// O padrao do findBy* e 1s. Com dezoito arquivos em paralelo a maquina fica carregada e testes
// corretos falhavam por tempo, cada rodada num arquivo diferente. Esperar mais nao esconde erro:
// asserção errada continua falhando, so demora mais para desistir.
configure({ asyncUtilTimeout: 5000 })

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  servidor.resetHandlers()
  restaurarEstadoTeste()
  // O cache de cadastros vive no modulo e sobreviveria de um caso para o outro,
  // servindo a um teste a resposta que outro montou.
  limparCacheCurto()
})
afterAll(() => servidor.close())
