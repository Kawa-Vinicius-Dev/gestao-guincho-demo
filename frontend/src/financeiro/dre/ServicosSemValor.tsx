import { useEffect, useState } from 'react'
import { LinkOs, LinkSocorrista, LinkViatura } from '../../components/LinksDeDado'
import { listarTodasAsOs, type LinhaOs } from '../../dados/porto/listaOs'
import { data } from '../../utils/formatadores'

/** Ate aqui a lista cabe inteira; acima, vira resumo. */
export const LIMITE_UM_POR_UM = 15

/**
 * Servicos do periodo que ainda nao tem valor.
 *
 * Kawa, 22/09/2026: no DRE mensal, "quando as OS estiverem sem valor, mostrar
 * os servicos dos periodos; se forem muitos, mostre simplificado, senao mostre
 * um por um". O DRE so enxerga dinheiro que entrou, e servico sem valor ainda
 * nao e dinheiro — sem este painel, o mes parecia mais fraco do que foi.
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

  return <section className="panel dre-sem-valor" aria-label="Serviços ainda sem valor">
    <header className="panel-title">
      <div><span className="eyebrow">Fora do resultado, por enquanto</span>
        <h2>{servicos.length} {servicos.length === 1 ? 'serviço ainda sem valor' : 'serviços ainda sem valor'}</h2></div>
    </header>
    <p className="nota-fora-do-fechamento">
      Aconteceram no período, mas o valor só chega com a OP. Quando chegar, entram na receita.
    </p>
    {servicos.length > LIMITE_UM_POR_UM ? <Resumo servicos={servicos}/> : <UmPorUm servicos={servicos}/>}
  </section>
}

function UmPorUm({ servicos }: { servicos: LinhaOs[] }) {
  return <div className="table-scroll"><table>
    <thead><tr><th>OS</th><th>Atendimento</th><th>Especialidade</th><th>Socorrista</th><th>Viatura</th></tr></thead>
    <tbody>{servicos.map(os => <tr key={os.id}>
      <td><strong><LinkOs numero={os.numero}/></strong></td>
      <td>{os.dataAtendimento ? data(os.dataAtendimento) : '—'}</td>
      <td>{os.especialidade || '—'}</td>
      <td><LinkSocorrista id={os.motoristaId} nome={os.motorista}/></td>
      <td><LinkViatura sigla={os.viatura}/></td>
    </tr>)}</tbody>
  </table></div>
}

/** Muitos servicos: quantos por socorrista e por especialidade, do maior para o menor. */
function Resumo({ servicos }: { servicos: LinhaOs[] }) {
  const contar = (chave: (os: LinhaOs) => string) => [...servicos.reduce((mapa, os) => {
    const k = chave(os); mapa.set(k, (mapa.get(k) ?? 0) + 1); return mapa
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1])
  const porSocorrista = contar(os => os.motorista || 'Sem socorrista')
  const porEspecialidade = contar(os => os.especialidade || 'Sem especialidade')
  return <div className="dre-sem-valor-resumo">
    <Contagem titulo="Por socorrista" linhas={porSocorrista}/>
    <Contagem titulo="Por especialidade" linhas={porEspecialidade}/>
  </div>
}

function Contagem({ titulo, linhas }: { titulo: string; linhas: [string, number][] }) {
  return <div className="table-scroll"><table>
    <thead><tr><th>{titulo}</th><th className="th-numero">Serviços</th></tr></thead>
    <tbody>{linhas.map(([nome, n]) => <tr key={nome}><td>{nome}</td><td className="col-numero">{n}</td></tr>)}</tbody>
  </table></div>
}
