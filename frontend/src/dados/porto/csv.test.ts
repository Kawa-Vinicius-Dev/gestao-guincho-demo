import { expect, test } from 'vitest'
import { lerCsvPorto, lerServicosGeraisPorto } from './csv'
import { data, decimal, texto } from './linha'
import devolvidosCsv from './fixtures/servicos-devolvidos.csv?raw'
import osVinculadasCsv from './fixtures/os-vinculadas.csv?raw'
import previsaoCsv from './fixtures/previsao-receber-utf8.csv?raw'

/**
 * O port do parser e conferido contra os MESMOS arquivos que os testes do
 * backend usam. E a unica forma honesta de dizer que a leitura continua igual:
 * comparar o resultado com o do Java, no mesmo insumo.
 */
// `?raw` faz o Vite embutir o arquivo como texto na compilacao: nao depende do
// sistema de arquivos em tempo de execucao, que o jsdom nao expoe.
const fixtures: Record<string, string> = {
  'previsao-receber-utf8.csv': previsaoCsv,
  'os-vinculadas.csv': osVinculadasCsv,
  'servicos-devolvidos.csv': devolvidosCsv,
}
const fixture = (nome: string) => fixtures[nome]

test('previsao de recebimento: detecta o tipo e le os campos', async () => {
  const previa = await lerCsvPorto(fixture('previsao-receber-utf8.csv'))

  expect(previa.tipo).toBe('PREVISAO_RECEBER')
  expect(previa.erros).toEqual([])
  const [primeira] = previa.linhas
  // O CSV traz <b>OP-100</b>: o HTML colado pela Porto sai na limpeza.
  expect(texto(primeira, 'numero_op')).toBe('OP-100')
  // "1.234,56" em formato brasileiro.
  expect(decimal(primeira, 'valor_total')).toBe(1234.56)
  expect(texto(primeira, 'nome_codigo')).toBe('Porto: 001')
  expect(data(primeira, 'data_pagamento')).toBe('2026-07-31')
})

test('OS vinculadas: detecta o tipo', async () => {
  const previa = await lerCsvPorto(fixture('os-vinculadas.csv'))
  expect(previa.tipo).toBe('OS_VINCULADAS')
  expect(previa.linhas.length).toBeGreaterThan(0)
})

test('servicos devolvidos: detecta o tipo', async () => {
  const previa = await lerCsvPorto(fixture('servicos-devolvidos.csv'))
  expect(previa.tipo).toBe('SERVICOS_DEVOLVIDOS')
})

test('a colagem de servicos gerais reusa os cabecalhos da OS vinculada', async () => {
  const previa = await lerServicosGeraisPorto(fixture('os-vinculadas.csv'))
  expect(previa.tipo).toBe('SERVICOS_GERAIS')
})

test('cabecalho desconhecido nao vira importacao silenciosa', async () => {
  await expect(lerCsvPorto('coluna a;coluna b\n1;2'))
    .rejects.toThrow(/detectar um relatório Porto/)
})

test('CSV sem registros e recusado', async () => {
  await expect(lerCsvPorto('Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento'))
    .rejects.toThrow(/não contém registros/)
})

// A linha com erro entra na previa marcada, em vez de derrubar o arquivo
// inteiro: quem importa precisa ver o que entrou e o que ficou de fora.
test('linha invalida vira ERRO na previa, sem perder as validas', async () => {
  const csv = [
    'Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento',
    'OP-1;100,00;Porto: 1;01/08/2026',
    'OP-2;;Porto: 2;01/08/2026',
    'OP-3;50,00;Porto: 3;31/02/2026',
  ].join('\n')

  const previa = await lerCsvPorto(csv)

  expect(previa.linhas).toHaveLength(3)
  expect(previa.linhas.map(l => l.acao)).toEqual(['IMPORTAR', 'ERRO', 'ERRO'])
  expect(previa.erros[0]).toMatch(/valor total vazio/)
  expect(previa.erros[1]).toMatch(/data de pagamento programada inválida/)
})

test('o mesmo registro sempre gera o mesmo hash, e registros diferentes nao colidem', async () => {
  const csv = (op: string) =>
    `Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento\n${op};10,00;Porto: 1;01/08/2026`
  const a = await lerCsvPorto(csv('OP-1'))
  const b = await lerCsvPorto(csv('OP-1'))
  const c = await lerCsvPorto(csv('OP-2'))

  expect(a.linhas[0].hashRegistro).toBe(b.linhas[0].hashRegistro)
  expect(a.linhas[0].hashRegistro).not.toBe(c.linhas[0].hashRegistro)
  expect(a.linhas[0].hashRegistro).toHaveLength(64)
})

test('separador e detectado: ponto e virgula, tabulacao ou virgula', async () => {
  const comTab = await lerCsvPorto(
    'Número da Ordem de Pagamento\tValor Total do Serviço\tNome: Código\tData de Pagamento\nOP-9\t10,00\tPorto: 9\t01/08/2026')
  expect(texto(comTab.linhas[0], 'numero_op')).toBe('OP-9')
})

// Campo entre aspas pode conter o separador; sem isso as colunas escorregam.
test('aspas protegem o separador dentro do campo', async () => {
  const previa = await lerCsvPorto(
    'Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento\n' +
    'OP-7;10,00;"Porto; Filial 2";01/08/2026')
  expect(texto(previa.linhas[0], 'nome_codigo')).toBe('Porto; Filial 2')
})
