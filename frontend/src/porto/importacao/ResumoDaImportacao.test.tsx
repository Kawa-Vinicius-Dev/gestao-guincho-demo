import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import type { ConfirmacaoPorto } from '../../types/modelos'
import { ResumoDaImportacao } from './ResumoDaImportacao'

// Kawa, 23/09/2026: o resumo diz o que mudou e leva direto ao que pede acao.
test('o resumo da OP leva às OS dela e ao que pede ação', () => {
  const r = {
    importacaoId: 1, tipo: 'SERVICOS_GERAIS', importados: 55, ignorados: 0, novos: 43, atualizados: 12,
    receitasCriadas: 55, receitasAtualizadas: 0, valorTotalRecebido: 12000, erros: [],
    osSemSocorrista: ['A', 'B', 'C'], naoEncontradas: [{} as never], viaturasNovas: ['TF250'],
  } as ConfirmacaoPorto
  render(<MemoryRouter><ResumoDaImportacao r={r} numeroOp="06438807"/></MemoryRouter>)

  expect(screen.getByText('55 OS nesta OP')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /ver as OS da OP/ })).toHaveAttribute('href', '/porto/ordens-servico?op=06438807')
  expect(screen.getByText('43 novas')).toBeInTheDocument()
  expect(screen.getByText(/12 já estavam no Diário/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /resolver nas pendências/ })).toHaveAttribute('href', '/porto/pendencias?filtro=SOCORRISTA')
  expect(screen.getByRole('link', { name: /aguardam a próxima OP/ })).toHaveAttribute('href', expect.stringContaining('AGUARDANDO_PROXIMA_OP'))
  expect(screen.getByText(/TF250/)).toBeInTheDocument()
})
