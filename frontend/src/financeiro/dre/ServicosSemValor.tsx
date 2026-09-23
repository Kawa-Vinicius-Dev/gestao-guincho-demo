import { useEffect, useState } from 'react'
import { LinkOs, LinkSocorrista } from '../../components/LinksDeDado'
import { listarTodasAsOs, type LinhaOs } from '../../dados/porto/listaOs'
import { data } from '../../utils/formatadores'
import './dre.css'

/**
 * Servicos do periodo que ainda nao tem valor, por socorrista.
 *
 * Kawa, 23/09/2026: no DRE, quando os servicos estao sem valor, mostrar quantos
 * cada socorrista fez, "por quantidade de servicos feitos, que fica melhor", e
 * dar para ver as OS de cada um. O DRE so enxerga dinheiro que entrou, e servico
 * sem valor ainda nao e dinheiro — sem este painel, o periodo parecia vazio.
 */
export function ServicosSemValor({ inicio, fim }: { inicio: string; fim: string }) {
  const [servicos, setServicos] = useState<LinhaOs[] | null>(null)

  useEffect(() => {
    setServicos(null)
    listarTodasAsOs({ inicio, fim })
      .then(p => setServicos(p.itens.filter(os => !os.valorPrevisto && !os.valorTotal)))
      .catch(() => setServicos([]))
  }, [inicio, fim])

  if (!servicos?.length) return null

  // Quem mais fez primeiro; empate, em ordem alfabetica.
  const grupos = [...servicos.reduce((mapa, os) => {
    const nome = os.motorista || 'Sem socorrista'
    const g = mapa.get(nome) ?? { nome, id: os.motoristaId, os: [] as LinhaOs[] }
    g.os.push(os)
    return mapa.set(nome, g)
  }, new Map<string, { nome: string; id?: number; os: LinhaOs[] }>()).values()]
    .sort((a, b) => b.os.length - a.os.length || a.nome.localeCompare(b.nome))
  const maior = grupos[0]?.os.length ?? 1

  return <section className="panel dre-sem-valor" aria-label="Serviços ainda sem valor">
    <header className="panel-title">
      <div><span className="eyebrow">Serviços realizados, ainda sem valor</span>
        <h2>{servicos.length} {servicos.length === 1 ? 'serviço' : 'serviços'} no período</h2></div>
    </header>
    <p className="nota-fora-do-fechamento">
      O valor chega com a OP; até lá, eles não entram nas receitas. Clique num socorrista para ver as OS dele.
    </p>
    <ol className="sem-valor-ranking">
      {grupos.map(g => <li key={g.nome}>
        <details>
          <summary>
            <span className="sem-valor-nome">{g.id ? <LinkSocorrista id={g.id} nome={g.nome}/> : g.nome}</span>
            <span className="sem-valor-trilho" aria-hidden="true"><span style={{ width: `${Math.max(g.os.length / maior * 100, 2)}%` }}/></span>
            <strong>{g.os.length} {g.os.length === 1 ? 'serviço' : 'serviços'}</strong>
          </summary>
          <ol className="sem-valor-os">
            {[...g.os].sort((a, b) => (a.dataAtendimento ?? '').localeCompare(b.dataAtendimento ?? '')).map(os => <li key={os.id}>
              <LinkOs numero={os.numero}/>
              <span>{os.dataAtendimento ? data(os.dataAtendimento) : '—'}</span>
              <span>{os.especialidade || '—'}</span>
              <span>{os.viatura || 'Sem viatura'}</span>
            </li>)}
          </ol>
        </details>
      </li>)}
    </ol>
  </section>
}
