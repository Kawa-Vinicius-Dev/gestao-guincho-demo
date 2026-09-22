import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:5173',
      },
    },
    setupFiles: './src/test/setup.ts',
    css: true,
    // Os testes de integracao (login, navegacao, modal, salvar) levam ~2s
    // sozinhos e passam de 10s quando 59 arquivos disputam a maquina — falhavam
    // por tempo, a cada rodada num arquivo diferente, sem erro nenhum.
    // Folga de ~10x sobre o tempo real: teste travado ainda aborta, so demora
    // mais para desistir.
    testTimeout: 20_000,
  },
})
