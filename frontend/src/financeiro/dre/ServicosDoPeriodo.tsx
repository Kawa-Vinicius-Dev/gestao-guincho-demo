import { useEffect, useState } from 'react'
import { LinkOs, LinkSocorrista, LinkViatura } from '../../components/LinksDeDado'
import { listarTodasAsOs, valorDaOs, type LinhaOs } from '../../dados/porto/listaOs'
import { data, moeda } from '../../utils/formatadores'
import { nomesCurtos } from '../../utils/nomes'
import './dre.css'


/**
 * Todos os servicos do periodo, pela data em que foram feitos, por socorrista.
 *
 * Kawa, 23/09/2026: filtrando um dia na Visao geral ou no DRE, "eu nao estou
 * conseguindo ver os servicos desse dia; quero todos os servicos". Os paineis
 * de dinheiro contam pela OP (a competencia), entao um dia comum aparecia vazio:
 * o servico feito em 08/09 so conta em dinheiro quando a OP de 16/09 chega.
 * Aqui vale a data do atendimento, com ou sem valor. Quem mais fez vem primeiro,
 * e o nome abre as OS numeradas.
 *
 * `servicos` vem pronto quando a tela ja carregou a lista (Visao geral usa o
 * mesmo total no cartao); sem ele, o painel busca sozinho. Com `porCompetencia`
 * (periodo escolhido pela OP), vale o periodo da OP, e nao a data do servico.
 */
export function ServicosDoPeriodo({ inicio, fim, porCompetencia = false, servicos: prontos }: {
  inicio: string; fim: string; porCompetencia?: boolean; servicos?: LinhaOs[] | null
}) {
  const [buscados, setBuscados] = useState<LinhaOs[] | null>(null)
  useEffect(() => {
    if (prontos !== undefined) return
    setBuscados(null)
    listarTodasAsOs({ inicio, fim, porCompetencia }).then(p => setBuscados(p.itens)).catch(() => setBuscados([]))
  }, [inicio, fim, porCompetencia, prontos])
  const servicos = prontos !== undefined ? prontos : buscados

  if (!servicos) return null
  const semValor = servicos.filter(os => os.semValor).length
  const total = servicos.reduce((t, os) => t + valorDaOs(os), 0)

  // Quem mais fez primeiro; empate, em ordem alfabetica.
  const grupos = [...servicos.reduce((mapa, os) => {
    const nome = os.motorista || 'Sem socorrista'
    const g = mapa.get(nome) ?? { nome, id: os.motoristaId, os: [] as LinhaOs[] }
    g.os.push(os)
    return mapa.set(nome, g)
  }, new Map<string, { nome: string; id?: number; os: LinhaOs[] }>()).values()]
    .sort((a, b) => b.os.length - a.os.length || a.nome.localeCompare(b.nome))
  const maior = grupos[0]?.os.length ?? 1
  const curtos = nomesCurtos(grupos.map(g => g.nome))

  return <section className="panel dre-sem-valor" aria-label="Serviços do período">
    <header className="panel-title">
      <div><span className="eyebrow">Serviços feitos no período</span>
        <h2>{servicos.length} {servicos.length === 1 ? 'serviço' : 'serviços'}</h2></div>
      {servicos.length ? <p className="servicos-resumo">
        {total ? <><strong>{moeda(total)}</strong> com valor</> : null}
        {semValor ? <>{total ? ' · ' : ''}<strong>{semValor}</strong> ainda sem valor</> : null}
      </p> : null}
    </header>
    {!servicos.length ? <p className="empty-inline">Nenhum serviço feito neste período.</p> : <>
      <p className="nota-fora-do-fechamento">
        {porCompetencia ? 'Pela OP em que o serviço entrou.' : 'Pela data do atendimento.'} O valor entra nas receitas quando a OP chega. Clique num socorrista para ver as OS dele.
      </p>
      <ol className="sem-valor-ranking">
        {grupos.map(g => <li key={g.nome}>
          <details>
            <summary>
              <span className="sem-valor-nome" title={g.nome}>{g.id ? <LinkSocorrista id={g.id} nome={curtos.get(g.nome) ?? g.nome}/> : g.nome}</span>
              <span className="sem-valor-trilho" aria-hidden="true"><span style={{ width: `${Math.max(g.os.length / maior * 100, 2)}%` }}/></span>
              <strong>{g.os.length} {g.os.length === 1 ? 'serviço' : 'serviços'}</strong>
            </summary>
            <ol className="sem-valor-os">
              {[...g.os].sort((a, b) => (a.dataAtendimento ?? '').localeCompare(b.dataAtendimento ?? '')).map(os => <li key={os.id}>
                <LinkOs numero={os.numero}/>
                <span>{os.dataAtendimento ? data(os.dataAtendimento) : '—'}</span>
                <span>{os.especialidade || '—'} · <LinkViatura sigla={os.viatura}/></span>
                <span>{os.semValor ? 'Sem valor' : moeda(valorDaOs(os))}</span>
              </li>)}
            </ol>
          </details>
        </li>)}
        <li className="sem-valor-total">
          <span>Total</span><span aria-hidden="true"/>
          <strong>{servicos.length} {servicos.length === 1 ? 'serviço' : 'serviços'}</strong>
        </li>
      </ol>
    </>}
  </section>
}
