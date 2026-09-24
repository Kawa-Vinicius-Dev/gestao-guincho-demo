import { expect, test } from 'vitest'
import { finalDaPlaca, vistoriaDaViatura, type RegistroVistoria } from './vistorias'

/**
 * Manual de Frota da Porto (abril/2026, item 5): impar em jan/abr/jul/out, par em
 * fev/mai/ago/nov; reprovada, 5 dias corridos para corrigir.
 */
const registro = (referencia: string, extra: Partial<RegistroVistoria> = {}): RegistroVistoria => ({
  id: 1, veiculoId: 1, referencia, feitaEm: referencia.replace(/01$/, '03'), resultado: 'APROVADA', observacao: null, ...extra,
})

test('o final da placa vem do ultimo digito, na placa antiga e na Mercosul', () => {
  expect(finalDaPlaca('ABC1D23')).toBe(3)
  expect(finalDaPlaca('abc-1234')).toBe(4)
  expect(finalDaPlaca('ABC1D2X')).toBeNull()
  expect(finalDaPlaca(null)).toBeNull()
})

test('placa impar em outubro: pendente ate registrar, depois feita', () => {
  expect(vistoriaDaViatura('ABC1D23', [], '2026-10-06')).toMatchObject({ situacao: 'PENDENTE', referencia: '2026-10-01', proximoMes: '2027-01-01' })
  expect(vistoriaDaViatura('ABC1D23', [registro('2026-10-01')], '2026-10-06')).toMatchObject({ situacao: 'FEITA' })
})

test('placa par em setembro: aguarda novembro se agosto foi feita, e aponta agosto se nao foi', () => {
  expect(vistoriaDaViatura('ABC1D24', [registro('2026-08-01')], '2026-09-24')).toMatchObject({ situacao: 'AGUARDANDO', proximoMes: '2026-11-01' })
  expect(vistoriaDaViatura('ABC1D24', [], '2026-09-24')).toMatchObject({ situacao: 'SEM_REGISTRO', referencia: '2026-08-01' })
})

test('reprovada da 5 dias corridos para corrigir, e refazer aprovada resolve', () => {
  const reprovada = registro('2026-10-01', { feitaEm: '2026-10-03', resultado: 'REPROVADA' })
  expect(vistoriaDaViatura('ABC1D23', [reprovada], '2026-10-04')).toMatchObject({ situacao: 'REPROVADA', corrigirAte: '2026-10-08' })
  expect(vistoriaDaViatura('ABC1D23', [{ ...reprovada, resultado: 'APROVADA' }], '2026-10-06')).toMatchObject({ situacao: 'FEITA' })
})

test('em janeiro, a placa par olha a vistoria de novembro do ano anterior', () => {
  expect(vistoriaDaViatura('ABC1D20', [], '2027-01-10')).toMatchObject({ situacao: 'SEM_REGISTRO', referencia: '2026-11-01', proximoMes: '2027-02-01' })
})

test('sem placa, sem calendario', () => {
  expect(vistoriaDaViatura(null, [], '2026-10-06').situacao).toBe('SEM_PLACA')
})
