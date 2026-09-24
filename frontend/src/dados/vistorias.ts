import { ou, supabase } from './cliente'

/**
 * Vistoria periodica obrigatoria da Porto (Manual de Frota, abril/2026, item 5).
 *
 * O mes sai do final da placa: impar em janeiro, abril, julho e outubro; par em
 * fevereiro, maio, agosto e novembro. Fora do mes ou reprovada, a Porto pede nova
 * vistoria e pode bloquear a viatura (falta de item: 5 dias corridos para
 * corrigir). Aqui so se registra a vistoria feita; o calendario e conta da placa.
 */

export const MESES_PLACA_IMPAR = [1, 4, 7, 10]
export const MESES_PLACA_PAR = [2, 5, 8, 11]
/** Reprovada por falta de item obrigatorio: prazo para corrigir e refazer. */
export const DIAS_PARA_CORRIGIR = 5

const NOMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const nomeDoMes = (m: number) => NOMES[m - 1] ?? ''

/** O ultimo digito da placa (Mercosul ou antiga); sem ele, nao ha calendario. */
export function finalDaPlaca(placa?: string | null): number | null {
  const limpa = (placa ?? '').replace(/[^0-9A-Za-z]/g, '')
  const ultimo = limpa.at(-1)
  return ultimo && /\d/.test(ultimo) ? Number(ultimo) : null
}

export function mesesDaVistoria(finalPlaca: number): number[] {
  return finalPlaca % 2 === 1 ? MESES_PLACA_IMPAR : MESES_PLACA_PAR
}

export interface RegistroVistoria {
  id: number
  veiculoId: number
  /** 'AAAA-MM-01' */
  referencia: string
  feitaEm: string
  resultado: 'APROVADA' | 'REPROVADA'
  observacao: string | null
}

export type SituacaoVistoria = 'PENDENTE' | 'REPROVADA' | 'FEITA' | 'SEM_REGISTRO' | 'AGUARDANDO' | 'SEM_PLACA'

export interface VistoriaDaViatura {
  situacao: SituacaoVistoria
  /** Mes que a proxima acao responde: o de agora, o anterior sem registro, ou o proximo. */
  referencia: string | null
  proximoMes: string | null
  registro: RegistroVistoria | null
  /** Reprovada: ate quando corrigir. */
  corrigirAte: string | null
}

const primeiroDia = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}-01`

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * A situacao da vistoria de uma viatura hoje.
 *  - mes de vistoria agora: pendente ate registrar; reprovada ate refazer;
 *  - fora do mes: a ultima vistoria que devia ter sido feita, se ficou sem
 *    registro ou reprovada; senao, aguardando a proxima.
 */
export function vistoriaDaViatura(placa: string | null | undefined, registros: RegistroVistoria[], hoje: string): VistoriaDaViatura {
  const final = finalDaPlaca(placa)
  if (final === null) return { situacao: 'SEM_PLACA', referencia: null, proximoMes: null, registro: null, corrigirAte: null }
  const meses = mesesDaVistoria(final)
  const ano = Number(hoje.slice(0, 4)), mes = Number(hoje.slice(5, 7))
  const proximo = meses.find(m => m > mes)
  const proximoMes = proximo ? primeiroDia(ano, proximo) : primeiroDia(ano + 1, meses[0])
  const doMes = (ref: string) => registros.find(r => r.referencia === ref) ?? null
  const reprovada = (r: RegistroVistoria) => ({ corrigirAte: somarDias(r.feitaEm, DIAS_PARA_CORRIGIR) })

  if (meses.includes(mes)) {
    const referencia = primeiroDia(ano, mes)
    const registro = doMes(referencia)
    if (!registro) return { situacao: 'PENDENTE', referencia, proximoMes, registro: null, corrigirAte: null }
    if (registro.resultado === 'REPROVADA') return { situacao: 'REPROVADA', referencia, proximoMes, registro, ...reprovada(registro) }
    return { situacao: 'FEITA', referencia, proximoMes, registro, corrigirAte: null }
  }

  const anterior = [...meses].reverse().find(m => m < mes)
  const referencia = anterior ? primeiroDia(ano, anterior) : primeiroDia(ano - 1, meses[meses.length - 1])
  const registro = doMes(referencia)
  if (!registro) return { situacao: 'SEM_REGISTRO', referencia, proximoMes, registro: null, corrigirAte: null }
  if (registro.resultado === 'REPROVADA') return { situacao: 'REPROVADA', referencia, proximoMes, registro, ...reprovada(registro) }
  return { situacao: 'AGUARDANDO', referencia: proximoMes, proximoMes, registro, corrigirAte: null }
}

export async function listarVistorias(): Promise<RegistroVistoria[]> {
  const linhas = ou(
    await supabase().from('vistorias_periodicas').select('id,veiculo_id,referencia,feita_em,resultado,observacao')
      .order('referencia', { ascending: false }),
    'Não foi possível carregar as vistorias.',
  ) as { id: number; veiculo_id: number; referencia: string; feita_em: string; resultado: 'APROVADA' | 'REPROVADA'; observacao: string | null }[]
  return (linhas ?? []).map(l => ({
    id: l.id, veiculoId: l.veiculo_id, referencia: l.referencia, feitaEm: l.feita_em, resultado: l.resultado, observacao: l.observacao,
  }))
}

/** Registra (ou refaz) a vistoria de um mes: uma por viatura por mes. */
export async function registrarVistoria(dados: {
  veiculoId: number; referencia: string; feitaEm: string; resultado: 'APROVADA' | 'REPROVADA'; observacao?: string | null
}): Promise<void> {
  ou(
    await supabase().from('vistorias_periodicas').upsert({
      veiculo_id: dados.veiculoId, referencia: dados.referencia, feita_em: dados.feitaEm,
      resultado: dados.resultado, observacao: dados.observacao?.trim() || null,
    }, { onConflict: 'veiculo_id,referencia' }).select('id'),
    'Não foi possível registrar a vistoria.',
  )
}

/** Quantas viaturas estao no mes da vistoria sem ela feita, ou com ela reprovada: o numero do menu. */
export async function vistoriasPedindoAtencao(hoje: string): Promise<number> {
  const [veiculos, registros] = await Promise.all([
    supabase().from('veiculos').select('id,placa').eq('ativo', true),
    supabase().from('vistorias_periodicas').select('id,veiculo_id,referencia,feita_em,resultado,observacao')
      .gte('referencia', primeiroDia(Number(hoje.slice(0, 4)) - 1, 1)),
  ])
  if (veiculos.error || registros.error) return 0
  const todos = (registros.data ?? []).map(l => ({
    id: l.id, veiculoId: l.veiculo_id, referencia: l.referencia, feitaEm: l.feita_em, resultado: l.resultado, observacao: l.observacao,
  })) as RegistroVistoria[]
  return (veiculos.data ?? []).filter(v => {
    const s = vistoriaDaViatura(v.placa, todos.filter(r => r.veiculoId === v.id), hoje).situacao
    return s === 'PENDENTE' || s === 'REPROVADA'
  }).length
}
