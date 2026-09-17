import ExcelJS from 'exceljs'
import { expect, test } from 'vitest'
import { montarExcel, type Relatorio } from './exportar'

const RELATORIO: Relatorio = {
  titulo: 'Ordens de serviço',
  subtitulo: 'Período: 23/06/2026 a 14/07/2026',
  resumo: [['Valor total', 'R$ 385,50']],
  colunas: [{ titulo: 'OS' }, { titulo: 'Atendimento', tipo: 'data' }, { titulo: 'Valor', tipo: 'moeda' }],
  linhas: [['01/4312215-26', '2026-06-30', 181], ['01/4363017-26', '2026-07-02', 204.5]],
  totais: ['Total', null, 385.5],
  nomeArquivo: 'teste',
}

// Excel de verdade, e nao CSV: valor como numero com formato de reais (soma e
// ordena no Excel), data como data, titulo e total.
test('Excel sai com título, cabeçalho, valores em reais e total', async () => {
  const livro = new ExcelJS.Workbook()
  await livro.xlsx.load(await montarExcel(RELATORIO))
  const folha = livro.worksheets[0]

  expect(folha.getRow(1).getCell(1).value).toBe('Ordens de serviço')
  let cabecalho = 0
  folha.eachRow((linha, numero) => { if (linha.getCell(1).value === 'OS') cabecalho = numero })
  expect(cabecalho).toBeGreaterThan(2)
  expect([1, 2, 3].map(c => folha.getRow(cabecalho).getCell(c).value)).toEqual(['OS', 'Atendimento', 'Valor'])

  const primeira = folha.getRow(cabecalho + 1)
  expect(primeira.getCell(3).value).toBe(181)
  expect(primeira.getCell(3).numFmt).toContain('R$')
  expect(primeira.getCell(2).value).toBeInstanceOf(Date)
  expect(folha.getRow(cabecalho + 3).getCell(1).value).toBe('Total')
  expect(folha.getRow(cabecalho + 3).getCell(3).value).toBe(385.5)
})
