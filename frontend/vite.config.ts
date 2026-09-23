import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:5173',
      },
    },
    setupFiles: './src/test/setup.ts',
    // O sistema so fala com o Supabase: todo teste tem um projeto de mentira
    // configurado, e as respostas vem do MSW.
    env: {
      VITE_SUPABASE_URL: 'https://projeto-teste.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'chave-anon-de-teste',
    },
    css: true,
    // Os testes de integracao (login, navegacao, modal, salvar) levam ~2s
    // sozinhos e passam de 10s quando 59 arquivos disputam a maquina — falhavam
    // por tempo, a cada rodada num arquivo diferente, sem erro nenhum.
    // Folga de ~10x sobre o tempo real: teste travado ainda aborta, so demora
    // mais para desistir.
    testTimeout: 20_000,
  },
})
