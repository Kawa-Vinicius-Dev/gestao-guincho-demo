import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test } from 'vitest'
import App from '../App'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})

test('rota Porto sem token redireciona para o login', async () => {
  window.history.replaceState({}, '', '/porto/importacoes')
  render(<App />)

  expect(await screen.findByRole('heading', { name: /entre na sua conta/i })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/login')
})
