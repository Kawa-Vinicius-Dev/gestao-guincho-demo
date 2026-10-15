import { describe, expect, it } from 'vitest'
import { resumoKmDoTurno, type ServicoComKm } from './kmDosTurnos'

const servico = (id: number, kmInicial: number | null, kmFinal: number | null, km = kmInicial != null && kmFinal != null ? kmFinal - kmInicial : null): ServicoComKm => ({
  id, numeroOs: `${id}00-26`, km, kmInicial, kmFinal,
  iniciadoEm: null, finalizadoEm: kmFinal == null ? null : '2026-10-15T12:00:00Z',
  fotoInicio: null, fotoFim: null, localInicio: null, localFim: null,
})

describe('resumoKmDoTurno', () => {
  it('fecha o exemplo do pedido: 120 rodados, 100 em serviço, 20 de km morto', () => {
    const r = resumoKmDoTurno({
      kmInicial: 10_000, kmFinal: 10_120,
      servicos: [servico(1, 10_000, 10_015), servico(2, 10_015, 10_045), servico(3, 10_045, 10_100)],
    })
    expect(r).toMatchObject({
      kmInicial: 10_000, kmFinal: 10_120, kmTotal: 120, kmEmServico: 100, kmMorto: 20,
      servicosConcluidos: 3, incompleto: false, inconsistente: false, avisos: [],
    })
  })

  it('não soma o mesmo serviço duas vezes', () => {
    const s = servico(1, 10_000, 10_015)
    expect(resumoKmDoTurno({ kmInicial: 10_000, kmFinal: 10_100, servicos: [s, s] }).kmEmServico).toBe(15)
  })

  it('serviço em andamento não entra na soma e deixa o cálculo incompleto', () => {
    const r = resumoKmDoTurno({ kmInicial: 10_000, kmFinal: 10_100, servicos: [servico(1, 10_000, 10_015), servico(2, 10_020, null)] })
    expect(r).toMatchObject({ kmEmServico: 15, kmMorto: 85, servicosEmAndamento: 1, incompleto: true })
    expect(r.avisos).toContain('O serviço da OS 200-26 não foi finalizado.')
  })

  it('turno sem fechar não tem km total nem km morto', () => {
    const r = resumoKmDoTurno({ kmInicial: 10_000, kmFinal: null, servicos: [servico(1, 10_000, 10_015)] })
    expect(r).toMatchObject({ kmTotal: null, kmMorto: null, kmEmServico: 15, incompleto: true })
  })

  it('km morto negativo é sinalizado como inconsistência', () => {
    const r = resumoKmDoTurno({ kmInicial: 10_000, kmFinal: 10_010, servicos: [servico(1, 10_000, 10_015)] })
    expect(r).toMatchObject({ kmMorto: -5, inconsistente: true })
    expect(r.avisos.join(' ')).toMatch(/Confira as fotos/)
  })

  it('lançamento antigo pelo GPS (só o km) continua contando', () => {
    const r = resumoKmDoTurno({ kmInicial: 10_000, kmFinal: 10_100, servicos: [servico(1, null, null, 12)] })
    expect(r).toMatchObject({ kmEmServico: 12, kmMorto: 88, incompleto: false, inconsistente: false })
  })
})
