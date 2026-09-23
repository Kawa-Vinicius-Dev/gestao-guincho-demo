import { useCallback, useEffect, useState } from 'react'
import { gravarFiltro, lerFiltro } from './filtroLembrado'
import { periodoCorrente, type PeriodoPorto } from './periodos'

/**
 * Um periodo so para o sistema inteiro.
 *
 * Kawa: o periodo vale "em todas as telas que e necessario um periodo, mas tambem
 * a opcao de alterar". Quem escolhe a quinzena na Visao geral e abre Comissoes,
 * Extrato ou Veiculos encontra a mesma quinzena; trocar em qualquer tela troca
 * em todas. Sem escolha, e o mes corrente.
 *
 * `op` guarda qual periodo da Porto foi escolhido na lista, para a lista mostrar
 * o nome dele; mexer numa data apaga, e a tela volta a "Periodo personalizado".
 */
export interface PeriodoGlobal {
  inicio: string
  fim: string
  /** Periodo da Porto escolhido na lista (conta pela competencia). */
  op?: string
  /** Mes escolhido na lista de meses, "2026-09" (conta pela competencia). */
  mes?: string
}

const CHAVE = 'periodo'
const EVENTO = 'fluxo:periodo'
const dois = (n: number) => String(n).padStart(2, '0')

export function intervaloDoMes(mes: string): PeriodoGlobal {
  const [ano, numero] = mes.split('-').map(Number)
  return { inicio: `${mes}-01`, fim: `${mes}-${dois(new Date(ano, numero, 0).getDate())}`, mes }
}

function mesCorrente(): PeriodoGlobal {
  const d = new Date()
  return intervaloDoMes(`${d.getFullYear()}-${dois(d.getMonth() + 1)}`)
}

export function lerPeriodoGlobal(): PeriodoGlobal {
  // Le sem mesclar com o mes corrente: o `mes` do padrao nao pode vazar para um
  // De–ate salvo, senao ele passaria a contar pela competencia.
  const salvo = lerFiltro<PeriodoGlobal>(CHAVE, { inicio: '', fim: '' })
  return salvo.inicio && salvo.fim ? salvo : mesCorrente()
}

export function usePeriodoGlobal() {
  const [periodo, setPeriodo] = useState(lerPeriodoGlobal)
  // Outra parte da tela (ou outra tela montada) trocou o periodo.
  useEffect(() => {
    const ouvir = () => setPeriodo(lerPeriodoGlobal())
    window.addEventListener(EVENTO, ouvir)
    return () => window.removeEventListener(EVENTO, ouvir)
  }, [])
  const alterar = useCallback((novo: PeriodoGlobal) => {
    setPeriodo(novo)
    // Data pela metade fica so na tela: voltar com "De" vazio e pior do que o
    // ultimo periodo completo.
    if (!novo.inicio || !novo.fim || novo.inicio > novo.fim) return
    gravarFiltro(CHAVE, novo)
    window.dispatchEvent(new Event(EVENTO))
  }, [])
  return [periodo, alterar] as const
}

/**
 * Telas que so existem por periodo da Porto (comissoes, ficha do socorrista):
 * o periodo escolhido, o que contem a data final, o que cruza as datas, ou o
 * mais recente.
 */
export function periodoPortoDoGlobal(periodos: PeriodoPorto[], global: PeriodoGlobal): PeriodoPorto | undefined {
  const comDatas = periodos.filter(p => p.periodoInicio && p.periodoFim)
  return periodos.find(p => p.id === global.op)
    ?? comDatas.find(p => p.periodoInicio! <= global.fim && p.periodoFim! >= global.fim)
    ?? comDatas.find(p => p.periodoInicio! <= global.fim && p.periodoFim! >= global.inicio)
    ?? periodoCorrente(periodos)
}

/** Escolher um periodo da Porto na lista preenche as datas com as dele. */
export function globalDoPeriodoPorto(periodo: PeriodoPorto): PeriodoGlobal | undefined {
  return periodo.periodoInicio && periodo.periodoFim
    ? { op: periodo.id, inicio: periodo.periodoInicio, fim: periodo.periodoFim }
    : undefined
}
