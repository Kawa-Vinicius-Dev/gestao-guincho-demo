import { useEffect, useState } from 'react'
import { listarPeriodosPorto } from '../dados/porto'
import { globalDoPeriodoPorto, intervaloDoMes, type PeriodoGlobal } from '../utils/periodoGlobal'
import { porCompetencia } from '../utils/modoDoPeriodo'
import { rotuloPeriodo, type PeriodoPorto } from '../utils/periodos'
import { Campo, Selecao } from './Campos'

/**
 * Periodo da Porto + De/Ate, o mesmo em toda tela que filtra por periodo.
 *
 * Escolher uma quinzena da Porto preenche as datas; mexer numa data volta para
 * "Periodo personalizado". A lista de quinzenas e conveniencia: se nao carregar,
 * as datas continuam valendo.
 */
/** Os doze meses ate o corrente, do mais recente para tras. */
function mesesRecentes(): { valor: string; texto: string }[] {
  const hoje = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const texto = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    return { valor, texto: texto.charAt(0).toUpperCase() + texto.slice(1) }
  })
}

export function SeletorPeriodo({ periodo, aoMudar }: { periodo: PeriodoGlobal; aoMudar: (novo: PeriodoGlobal) => void }) {
  const [periodos, setPeriodos] = useState<PeriodoPorto[]>([])
  const meses = mesesRecentes()
  // Mes fechado: as competencias do mes juntas, para a leitura mensal que Kawa
  // pediu. So aparece marcado quando as datas sao exatamente as do mes.
  const mesEscolhido = meses.find(m => {
    const { inicio, fim } = intervaloDoMes(m.valor)
    return periodo.mes === m.valor && periodo.inicio === inicio && periodo.fim === fim
  })?.valor ?? ''
  useEffect(() => {
    listarPeriodosPorto().then(setPeriodos).catch(() => setPeriodos([]))
  }, [])
  const escolhido = periodos.find(p => p.id === periodo.op
    && p.periodoInicio === periodo.inicio && p.periodoFim === periodo.fim)

  return <>
    <Selecao rotulo="Período" vazio="Período personalizado" value={escolhido?.id ?? ''}
      onChange={e => {
        const novo = periodos.find(p => p.id === e.target.value)
        aoMudar((novo && globalDoPeriodoPorto(novo)) || { ...periodo, op: '', mes: '' })
      }}
      opcoes={periodos.map(p => ({ valor: p.id, texto: rotuloPeriodo(p) }))}/>
    <Selecao rotulo="Mês" vazio="Sem mês fechado" value={mesEscolhido}
      onChange={e => { if (e.target.value) aoMudar({ ...intervaloDoMes(e.target.value), op: '' }) }}
      opcoes={meses}/>
    <Campo rotulo="De">
      <input aria-label="Data inicial" type="date" value={periodo.inicio} max={periodo.fim || undefined}
        onChange={e => aoMudar({ ...periodo, op: '', mes: '', inicio: e.target.value })}/>
    </Campo>
    <Campo rotulo="Até">
      <input aria-label="Data final" type="date" value={periodo.fim} min={periodo.inicio || undefined}
        onChange={e => aoMudar({ ...periodo, op: '', mes: '', fim: e.target.value })}/>
    </Campo>
    {/* A mesma quinzena conta diferente pela OP e pela data: a etiqueta diz qual vale. */}
    <span className="modo-do-periodo" title={porCompetencia(periodo)
      ? 'Período da OP ou mês: cada serviço conta na OP em que entrou.'
      : 'De–até: cada serviço conta na data do atendimento.'}>
      {porCompetencia(periodo) ? 'Contando pela OP' : 'Contando pela data do serviço'}
    </span>
  </>
}
