import { useEffect, useState } from 'react'
import { listarPeriodosDeOp } from '../dados/porto'
import { globalDoPeriodoPorto, type PeriodoGlobal } from '../utils/periodoGlobal'
import { agruparPorPeriodo, rotuloPeriodo, type PeriodoPorto } from '../utils/periodos'
import { Campo, Selecao } from './Campos'

/**
 * Periodo da Porto + De/Ate, o mesmo em toda tela que filtra por periodo.
 *
 * Escolher uma quinzena da Porto preenche as datas; mexer numa data volta para
 * "Periodo personalizado". A lista de quinzenas e conveniencia: se nao carregar,
 * as datas continuam valendo.
 */
export function SeletorPeriodo({ periodo, aoMudar }: { periodo: PeriodoGlobal; aoMudar: (novo: PeriodoGlobal) => void }) {
  const [periodos, setPeriodos] = useState<PeriodoPorto[]>([])
  useEffect(() => {
    listarPeriodosDeOp().then(ops => setPeriodos(agruparPorPeriodo(ops))).catch(() => setPeriodos([]))
  }, [])
  const escolhido = periodos.find(p => p.id === periodo.op
    && p.periodoInicio === periodo.inicio && p.periodoFim === periodo.fim)

  return <>
    <Selecao rotulo="Período" vazio="Período personalizado" value={escolhido?.id ?? ''}
      onChange={e => {
        const novo = periodos.find(p => p.id === e.target.value)
        aoMudar((novo && globalDoPeriodoPorto(novo)) || { ...periodo, op: '' })
      }}
      opcoes={periodos.map(p => ({ valor: p.id, texto: rotuloPeriodo(p) }))}/>
    <Campo rotulo="De">
      <input aria-label="Data inicial" type="date" value={periodo.inicio} max={periodo.fim || undefined}
        onChange={e => aoMudar({ ...periodo, op: '', inicio: e.target.value })}/>
    </Campo>
    <Campo rotulo="Até">
      <input aria-label="Data final" type="date" value={periodo.fim} min={periodo.inicio || undefined}
        onChange={e => aoMudar({ ...periodo, op: '', fim: e.target.value })}/>
    </Campo>
  </>
}
