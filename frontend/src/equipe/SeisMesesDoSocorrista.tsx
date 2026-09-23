import { useEffect, useState } from 'react'
import { Painel } from '../components/ui/Pagina'
import { listarTodasAsOs, type LinhaOs } from '../dados/porto/listaOs'
import { GraficoMesAMes } from '../desempenho/GraficoMesAMes'
import '../desempenho/desempenho.css'
import { hojeIso, moeda, moedaCurta, numero } from '../utils/formatadores'
import { inicioDeMesesAtras, mesesDoPeriodo, nomeDoMes } from '../utils/meses'

/**
 * Os ultimos 6 meses do socorrista na ficha (Kawa, 23/09/2026): servicos ou
 * comissao, mes a mes, com o mesmo grafico do Desempenho. A ficha escolhe uma
 * quinzena; o grafico olha para tras, que e o que uma quinzena nao mostra.
 * Pela data do atendimento; comissao so das OS ja pagas numa OP.
 */
export function SeisMesesDoSocorrista({ motoristaId, nome }: { motoristaId: number; nome: string }) {
  const [oss, setOss] = useState<LinhaOs[] | null>(null)
  const [medida, setMedida] = useState<'servicos' | 'comissao'>('servicos')
  const hoje = hojeIso()
  const inicio = inicioDeMesesAtras(hoje, 5)

  useEffect(() => {
    let valeu = true
    listarTodasAsOs({ inicio, fim: hoje, motoristaId })
      .then(p => { if (valeu) setOss(p.itens) }).catch(() => { if (valeu) setOss([]) })
    return () => { valeu = false }
  }, [motoristaId, inicio, hoje])

  if (!oss?.length) return null
  const meses = mesesDoPeriodo(inicio, hoje)
  const doMes = (m: string) => oss.filter(os => os.dataAtendimento?.slice(0, 7) === m)
  const valores = meses.map(m => medida === 'servicos'
    ? doMes(m).length
    : doMes(m).reduce((t, os) => t + (os.comissao ?? 0), 0))

  return <Painel semRespiro etiqueta="Últimos 6 meses" titulo={`${nome} mês a mês`}
    aoLado={<div className="segmented" role="group" aria-label="Medida">
      <button type="button" aria-pressed={medida === 'servicos'} className={medida === 'servicos' ? 'active' : undefined}
        onClick={() => setMedida('servicos')}>Serviços</button>
      <button type="button" aria-pressed={medida === 'comissao'} className={medida === 'comissao' ? 'active' : undefined}
        onClick={() => setMedida('comissao')}>Comissão</button>
    </div>}>
    <GraficoMesAMes meses={meses.map(nomeDoMes)}
      formatar={v => medida === 'servicos' ? `${numero(v)} ${v === 1 ? 'serviço' : 'serviços'}` : moeda(v)}
      formatarEixo={v => medida === 'servicos' ? numero(v) : moedaCurta(v)}
      descricao={`${medida === 'servicos' ? 'Serviços' : 'Comissão'} de ${nome} nos últimos 6 meses`}
      series={[{ chave: String(motoristaId), rotulo: nome, valores }]}/>
  </Painel>
}
