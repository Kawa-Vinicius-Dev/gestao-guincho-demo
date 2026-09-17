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

/**
 * Recorte da exportacao real da quinzena 16/03 a 31/03/2026, com os quatro casos
 * que a colagem traz de verdade: o registro quebrado entre viatura e nome, o
 * servico cancelado, a OS que vem sem viatura e sem socorrista, e a
 * especialidade com pontos ("R.P.T.").
 */
const QUINZENA = `PORTO SEGURO	2400947/26	SOCORRO	L168	MATEUS ARAUJO CRUZ	16/03/2026	07:40	07:40	ACIONADO/FINAL	FINALIZADO	Não
PORTO SEGURO	2410629/26	SOCORRO	K85	NATANAEL JOSE DE FRE	16/03/2026	13:00	13:00	CANCELADO	FINALIZADO	Não
AZUL SEGUROS	2487557/26	SOCORRO	L845
ANDERSON JORGE RIBEI	19/03/2026	19:18	19:18	ACIONADO/FINAL	FINALIZADO	Não
PORTO SEGURO	2563506/26	SOCORRO	
25/03/2026	00:00	00:00	ACIONADO/FINAL	FINALIZADO	Não
AZUL SEGUROS	2634575/26	R.P.T.	L25
QEBSON RAMOS DA SILV	31/03/2026	09:00	09:00	ACIONADO/FINAL	FINALIZADO	Não`

test('le a quinzena real da Porto, com registro quebrado, cancelado e OS sem viatura', async () => {
  const { linhas, erros } = await lerPainelDiarioPorto(QUINZENA)

  expect(erros).toEqual([])
  expect(linhas).toHaveLength(5)

  // Registro partido: a viatura fecha uma linha e o nome abre a seguinte.
  expect(linhas[2].dados).toMatchObject({
    numero_os: '2487557/26', sigla_viatura: 'L845',
    socorrista: 'ANDERSON JORGE RIBEI', data_atendimento: '2026-03-19',
  })
  // Cancelado na Porto continua entrando, marcado como cancelado.
  expect(linhas[1].dados).toMatchObject({ numero_os: '2410629/26', cancelado: 'true' })
  // Sem viatura e sem socorrista: fica pendente, e nao inventa vinculo.
  expect(linhas[3].dados).toMatchObject({
    numero_os: '2563506/26', sigla_viatura: '', socorrista: '', data_atendimento: '2026-03-25',
  })
  // Especialidade com pontos nao e confundida com viatura nem com nome.
  expect(linhas[4].dados).toMatchObject({
    numero_os: '2634575/26', especialidade: 'R.P.T.', sigla_viatura: 'L25',
    socorrista: 'QEBSON RAMOS DA SILV',
  })
})
