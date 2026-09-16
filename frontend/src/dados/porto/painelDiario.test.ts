import { expect, test } from 'vitest'
import { lerPainelDiarioPorto } from './painelDiario'

/**
 * Colagem real do painel do dia: a quebra de linha cai no meio do registro,
 * entre a viatura e o nome do socorrista, e o servico cancelado vem sem os dois.
 */
const COLADO = `PORTO SEGURO	5673329/26	SOCORRO	L168
LUIZ FELIPE DA SILVA	14/09/2026	06:34	06:34	ACIONADO/FINAL	EM PROCESSAMENTO	Não
AZUL SEGUROS	5673528/26	SOCORRO	L25
QEBSON RAMOS DA SILV	14/09/2026	06:57	06:57	ACIONADO/FINAL	EM PROCESSAMENTO	Não
PORTO SEGURO	5677129/26	SOCORRO
14/09/2026	09:02	09:02	CANCELADO	SERVIÇO CANCELADO	Não
ITAU FROTA E RESIDE.	3207473/26	SOCORRO	L25	QEBSON RAMOS DA SILV	29/04/2026	06:49	06:49	ACIONADO/FINAL	FINALIZADO	Não`

test('le o painel do dia mesmo com o registro quebrado em duas linhas', async () => {
  const previa = await lerPainelDiarioPorto(COLADO)

  expect(previa.tipo).toBe('PAINEL_DIARIO')
  expect(previa.linhas).toHaveLength(4)

  const primeira = previa.linhas[0].dados
  expect(primeira).toMatchObject({
    seguradora: 'PORTO SEGURO', numero_os: '5673329/26', especialidade: 'SOCORRO',
    sigla_viatura: 'L168', socorrista: 'LUIZ FELIPE DA SILVA',
    data_atendimento: '2026-09-14', cancelado: 'false',
  })
})

test('registro numa linha so tambem e lido, e a seguradora acompanha', async () => {
  const { linhas } = await lerPainelDiarioPorto(COLADO)
  expect(linhas[3].dados).toMatchObject({
    seguradora: 'ITAU FROTA E RESIDE.', numero_os: '3207473/26',
    sigla_viatura: 'L25', socorrista: 'QEBSON RAMOS DA SILV',
    data_atendimento: '2026-04-29',
  })
})

test('servico cancelado entra marcado, sem viatura nem socorrista', async () => {
  const { linhas } = await lerPainelDiarioPorto(COLADO)
  const cancelado = linhas.find(l => l.dados.numero_os === '5677129/26')!

  expect(cancelado.dados.cancelado).toBe('true')
  expect(cancelado.dados.sigla_viatura).toBe('')
  expect(cancelado.dados.socorrista).toBe('')
  expect(cancelado.dados.situacao_porto).toContain('CANCELADO')
})

test('o mesmo painel colado duas vezes nao muda o hash de cada registro', async () => {
  const [a, b] = await Promise.all([lerPainelDiarioPorto(COLADO), lerPainelDiarioPorto(COLADO)])
  expect(a.linhas.map(l => l.hashRegistro)).toEqual(b.linhas.map(l => l.hashRegistro))
})

test('conteudo que nao e o painel do dia e recusado', async () => {
  await expect(lerPainelDiarioPorto('qualquer coisa colada')).rejects.toThrow(/painel do dia/i)
})
