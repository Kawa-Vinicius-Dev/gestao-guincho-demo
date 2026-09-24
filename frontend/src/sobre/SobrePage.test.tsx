import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import SobrePage from './SobrePage'

test('o suporte abre o WhatsApp e o e-mail da ANAIV', () => {
  render(<MemoryRouter><SobrePage /></MemoryRouter>)

  expect(screen.getByRole('heading', { name: 'Sobre e suporte' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Falar no WhatsApp/ }))
    .toHaveAttribute('href', expect.stringMatching(/^https:\/\/wa\.me\/5581996073018\?text=/))
  expect(screen.getByRole('link', { name: /Mandar e-mail/ }))
    .toHaveAttribute('href', expect.stringMatching(/^mailto:kawa\.vinicius\.dev@gmail\.com/))
  expect(screen.getByRole('heading', { name: 'O que mudou' })).toBeInTheDocument()
})
