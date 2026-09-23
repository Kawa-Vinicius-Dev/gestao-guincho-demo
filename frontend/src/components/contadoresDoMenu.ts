import { useCallback, useEffect, useState } from 'react'
import { useAoVivo } from '../dados/aoVivo'
import { listarPendenciasOsPorto } from '../dados/porto'
import { filaDeAprovacoes } from '../dados/turnos'
import { porCompetencia } from '../utils/modoDoPeriodo'
import { usePeriodoGlobal } from '../utils/periodoGlobal'

/**
 * O que pede acao, contado no menu (Kawa, 23/09/2026): turnos e despesas
 * esperando aprovacao, e OS do periodo sem valor, sem socorrista ou sem viatura.
 * Sem precisar abrir as telas para saber. Uma falha so esconde o numero.
 */
export function useContadoresDoMenu(admin: boolean): Record<string, number> {
  const [periodo] = usePeriodoGlobal()
  const [contadores, setContadores] = useState<Record<string, number>>({})
  const competencia = porCompetencia(periodo)
  const contar = useCallback(() => {
    if (!admin) return
    void Promise.all([
      filaDeAprovacoes().then(f => f.itens.length).catch(() => 0),
      periodo.inicio && periodo.fim && periodo.inicio <= periodo.fim
        ? listarPendenciasOsPorto(periodo.inicio, periodo.fim, competencia)
            .then(l => l.filter(p => !p.apenasConferir).length).catch(() => 0)
        : Promise.resolve(0),
    ]).then(([aprovacoes, pendencias]) =>
      setContadores({ '/aprovacoes': aprovacoes, '/porto/ordens-servico': pendencias }))
  }, [admin, periodo.inicio, periodo.fim, competencia])
  useEffect(() => { contar() }, [contar])
  useAoVivo(contar)
  return contadores
}
