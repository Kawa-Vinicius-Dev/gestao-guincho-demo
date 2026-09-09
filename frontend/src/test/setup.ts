import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

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
})
afterAll(() => servidor.close())
