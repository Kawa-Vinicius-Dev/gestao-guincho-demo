import { ou, supabase } from './cliente'
import type { Localizacao, SituacaoTurno } from './turnos'

/**
 * Km de cada turno, para o administrador (Kawa, 15/10/2026).
 *
 * Tres contas, cada uma com o seu odometro:
 *   km total do turno = odometro do fim do turno - do inicio do turno
 *   km em servico     = soma do km dos servicos concluidos do turno
 *   km morto          = km total do turno - km em servico
 *
 * Km morto aqui e o que a viatura rodou e nao ficou registrado em servico — nao
 * quer dizer, por si so, deslocamento sem motivo.
 */

export interface ServicoComKm {
  id: number
  numeroOs: string
  /** Km do servico: final - inicial, ou o digitado do GPS nos lancamentos antigos. Nulo em andamento. */
  km: number | null
  kmInicial: number | null
  kmFinal: number | null
  iniciadoEm: string | null
  finalizadoEm: string | null
  fotoInicio: string | null
  fotoFim: string | null
  localInicio: Localizacao | null
  localFim: Localizacao | null
}

export interface TurnoComKm {
  id: number
  dataTurno: string
  situacao: SituacaoTurno
  motoristaId: number
  socorrista: string
  veiculoId: number
  viatura: string
  abertoEm: string
  fechadoEm: string | null
  kmInicial: number
  kmFinal: number | null
  servicos: ServicoComKm[]
}

export interface ResumoKm {
  kmInicial: number
  kmFinal: number | null
  /** Nulo enquanto o turno nao fecha. */
  kmTotal: number | null
  kmEmServico: number
  /** Nulo enquanto falta o fim do turno. */
  kmMorto: number | null
  servicosConcluidos: number
  servicosEmAndamento: number
  /** Falta dado: o km morto ainda nao e definitivo. */
  incompleto: boolean
  /** Os numeros nao fecham entre si: alguem digitou errado. */
  inconsistente: boolean
  avisos: string[]
}

const umaCasa = (n: number) => Math.round(n * 10) / 10

export function resumoKmDoTurno(turno: Pick<TurnoComKm, 'kmInicial' | 'kmFinal' | 'servicos'>): ResumoKm {
  // Cada servico conta uma vez so, mesmo que a lista venha repetida.
  const servicos = [...new Map(turno.servicos.map(s => [s.id, s])).values()]
  const concluidos = servicos.filter(s => s.km != null)
  const emAndamento = servicos.filter(s => s.km == null)
  const kmEmServico = umaCasa(concluidos.reduce((soma, s) => soma + (s.km ?? 0), 0))
  const kmTotal = turno.kmFinal == null ? null : umaCasa(turno.kmFinal - turno.kmInicial)
  const kmMorto = kmTotal == null ? null : umaCasa(kmTotal - kmEmServico)

  const avisos: string[] = []
  if (turno.kmFinal == null) avisos.push('O turno ainda não foi fechado.')
  if (emAndamento.length) {
    avisos.push(emAndamento.length === 1
      ? `O serviço da OS ${emAndamento[0].numeroOs} não foi finalizado.`
      : `${emAndamento.length} serviços não foram finalizados.`)
  }

  const fora = servicos.filter(s =>
    (s.kmInicial != null && s.kmInicial < turno.kmInicial)
    || (turno.kmFinal != null && s.kmFinal != null && s.kmFinal > turno.kmFinal))
  if (fora.length) {
    avisos.push(`Quilometragem fora do turno na OS ${fora.map(s => s.numeroOs).join(', ')}. Confira as fotos.`)
  }
  if (kmMorto != null && kmMorto < 0) {
    avisos.push('Os serviços somam mais do que a viatura rodou no turno. Confira as fotos.')
  }

  return {
    kmInicial: turno.kmInicial,
    kmFinal: turno.kmFinal,
    kmTotal,
    kmEmServico,
    kmMorto,
    servicosConcluidos: concluidos.length,
    servicosEmAndamento: emAndamento.length,
    incompleto: turno.kmFinal == null || emAndamento.length > 0,
    inconsistente: fora.length > 0 || (kmMorto != null && kmMorto < 0),
    avisos,
  }
}

type Bruto = Record<string, unknown>
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const texto = (v: unknown) => (v === null || v === undefined ? null : String(v))

function local(lat: unknown, lng: unknown, precisao: unknown, motivo: unknown): Localizacao | null {
  if (lat != null && lng != null) return { latitude: Number(lat), longitude: Number(lng), precisaoM: num(precisao) }
  if (motivo === 'NEGADA' || motivo === 'INDISPONIVEL') return { semLocal: motivo }
  return null
}

export async function kmDosTurnos(filtro: {
  inicio: string; fim: string; motoristaId?: number | null; veiculoId?: number | null
}): Promise<TurnoComKm[]> {
  const linhas = ou(
    await supabase().rpc('km_dos_turnos', {
      p_inicio: filtro.inicio, p_fim: filtro.fim,
      p_motorista_id: filtro.motoristaId || null, p_veiculo_id: filtro.veiculoId || null,
    }),
    'Não foi possível carregar o km dos turnos.',
  ) as Bruto[] | null
  return (linhas ?? []).map(t => ({
    id: Number(t.id), dataTurno: String(t.dataTurno), situacao: t.situacao as SituacaoTurno,
    motoristaId: Number(t.motoristaId), socorrista: String(t.socorrista),
    veiculoId: Number(t.veiculoId), viatura: String(t.viatura),
    abertoEm: String(t.abertoEm), fechadoEm: texto(t.fechadoEm),
    kmInicial: Number(t.kmInicial), kmFinal: num(t.kmFinal),
    servicos: ((t.servicos ?? []) as Bruto[]).map(s => ({
      id: Number(s.id), numeroOs: String(s.numeroOs), km: num(s.km),
      kmInicial: num(s.kmInicial), kmFinal: num(s.kmFinal),
      iniciadoEm: texto(s.iniciadoEm), finalizadoEm: texto(s.finalizadoEm),
      fotoInicio: texto(s.fotoInicio), fotoFim: texto(s.fotoFim),
      localInicio: local(s.inicioLatitude, s.inicioLongitude, s.inicioPrecisaoM, s.inicioSemLocal),
      localFim: local(s.fimLatitude, s.fimLongitude, s.fimPrecisaoM, s.fimSemLocal),
    })),
  }))
}
