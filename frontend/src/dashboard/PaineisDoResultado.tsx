import { Link } from 'react-router-dom'
import { DespesaAcumulada, GastosPorCategoria, ProporcaoKm } from '../components/Graficos'
import { GradeIndicadores, Indicador } from '../components/ui/Pagina'
import type { Dashboard, LancamentoFinanceiro } from '../types/modelos'
import { data, moeda, percentual } from '../utils/formatadores'
import { LinkSocorrista, LinkViatura } from '../components/LinksDeDado'

/**
 * Os blocos da Visao geral, na mesma linguagem do painel Porto: um numero domina,
 * o contexto fica ao lado, a barra de indicadores responde o que pede acao e os
 * graficos dizem quem trouxe o dinheiro.
 */

/**
 * Lucro em destaque: e a conta que o dono do guincho abre o sistema para ver. Ao
 * lado, as duas parcelas dele — receitas e despesas —, cada uma com uma barra na
 * mesma escala: a distancia entre as duas e o lucro, sem precisar fazer a conta.
 * "A receber" so aparece quando existe: na Porto a OP chega paga e o painel do
 * dia nasce sem valor, entao ali ele seria sempre zero.
 */
export function ResultadoDoPeriodo({ dados, atualizando }: { dados: Dashboard; atualizando?: boolean }) {
  const lucro = dados.saldoRealizado
  const margem = dados.receitaRecebida ? lucro / dados.receitaRecebida * 100 : null
  const negativo = lucro < 0
  const escala = Math.max(dados.receitaRecebida, dados.despesasPagas, 1)
  // Valor zero nao desenha barra; valor pequeno ganha um minimo visivel.
  const largura = (v: number) => `${v > 0 ? Math.max(v / escala * 100, 1.5) : 0}%`
  const servicos = dados.servicosDoPeriodo ?? 0

  return <div className={`destaque-corpo${atualizando ? ' atualizando' : ''}`}>
    <Link className="destaque-numero destaque-link" to="/dre" title="Abrir a DRE do período">
      <span>Lucro</span>
      <strong className={negativo ? 'destaque-negativo' : undefined}>{moeda(lucro)}</strong>
      <small>
        {margem !== null
          ? <><b className={negativo ? 'destaque-negativo' : undefined}>Margem de {percentual(margem)}</b> · </>
          : null}
        receitas − despesas
      </small>
    </Link>

    <div className="resultado-partes">
      <Link className="resultado-parte resultado-receitas resultado-parte-link" to="/lancamentos?atalho=RECEITAS" title="Ver as receitas no Extrato">
        <span className="resultado-parte-nome">Receitas</span>
        <strong>{moeda(dados.receitaRecebida)}</strong>
        <span className="resultado-trilho" aria-hidden="true">
          <span style={{ width: largura(dados.receitaRecebida) }}/>
        </span>
        <small>{servicos ? `${servicos} ${servicos === 1 ? 'serviço' : 'serviços'}` : 'Nenhuma receita'}</small>
      </Link>
      <Link className="resultado-parte resultado-despesas resultado-parte-link" to="/lancamentos?atalho=DESPESAS" title="Ver as despesas no Extrato">
        <span className="resultado-parte-nome">Despesas</span>
        <strong>{moeda(dados.despesasPagas)}</strong>
        <span className="resultado-trilho" aria-hidden="true">
          <span style={{ width: largura(dados.despesasPagas) }}/>
        </span>
        <small>{dados.despesasPagas
          ? dados.receitaRecebida
            ? `${percentual(dados.despesasPagas / dados.receitaRecebida * 100)} das receitas`
            : 'Sem receita no período'
          : 'Nenhuma despesa'}</small>
      </Link>
      {dados.receitaPrevista > 0
        ? <div className="resultado-a-receber">
            <span>A receber</span>
            <strong>{moeda(dados.receitaPrevista)}</strong>
            <small>{dados.totalAtrasado > 0 ? `${moeda(dados.totalAtrasado)} em atraso` : 'Nada em atraso'}</small>
          </div>
        : null}
    </div>
  </div>
}

/**
 * O que a operacao ainda espera. A comissao nao aparece aqui: ela vira despesa
 * paga sozinha quando a OP chega, e ja esta em Despesas. Despesa a pagar so
 * entra quando existe.
 */
export function IndicadoresDaOperacao({ dados }: { dados: Dashboard }) {
  const servicos = dados.servicosDoPeriodo ?? 0
  const pendentes = dados.servicosPendentes ?? 0
  // Comissao da equipe: a % de cada OP sobre os servicos pagos, somando todos.
  // Ja entra em despesas sozinha; aqui aparece o valor de cada um e o total.
  const comissoes = (dados.resultadoPorSocorrista ?? []).reduce((soma, p) => soma + p.comissao, 0)
  return <GradeIndicadores>
    <Indicador rotulo="Serviços" valor={servicos} link="/porto/ordens-servico"
      apoio={pendentes
        ? `${pendentes} ${pendentes === 1 ? 'aguarda' : 'aguardam'} OP`
        : servicos ? `${moeda(dados.producaoPaga ?? 0)} pagos pela Porto` : 'Nenhum serviço'}/>
    <Indicador rotulo="Comissões" valor={moeda(comissoes)} link="/comissoes"
      apoio={comissoes > 0 ? 'Total da equipe no período, já em despesas' : 'Nenhuma comissão no período'}/>
    {dados.despesasPrevistas > 0
      ? <Indicador rotulo="Despesas a pagar" valor={moeda(dados.despesasPrevistas)} link="/despesas"
          tom="atencao" apoio="Aprovadas, ainda não pagas"/>
      : null}
  </GradeIndicadores>
}

/**
 * Para onde o dinheiro foi. A frase do cabecalho so aparece quando ha despesa;
 * sem despesa, o proprio grafico diz que o periodo esta vazio.
 */
export function PainelDeGastos({ dados, inicio, fim, lancamentos = [] }: {
  dados: Dashboard; inicio: string; fim: string
  /** As despesas do periodo: cada categoria abre as dela (a lista separada saiu). */
  lancamentos?: LancamentoFinanceiro[]
}) {
  const categorias = dados.despesasPorCategoria ?? []
  const maior = categorias[0]
  return <section className="panel painel-gastos">
    <header className="panel-title">
      <div>
        <span className="eyebrow">Despesas</span>
        <h2>Para onde foi o dinheiro</h2>
        {maior
          ? <p>
              <strong>{maior.categoria}</strong> puxou {percentual(maior.participacao)} de tudo
              que saiu — {moeda(maior.valor)}.
            </p>
          : null}
      </div>
      <Link to="/despesas">Ver despesas</Link>
    </header>
    {categorias.length
      ? <div className="gastos-leitura">
          <section aria-labelledby="titulo-composicao-gastos">
            <h3 id="titulo-composicao-gastos">Por categoria</h3>
            <GastosPorCategoria total={dados.despesasPagas}
              linhas={categorias.map(c => ({
                id: c.categoriaId, rotulo: c.categoria, valor: c.valor,
                participacao: c.participacao,
              }))}/>
            <GastosDaCategoria lancamentos={lancamentos}/>
          </section>
          <section aria-labelledby="titulo-trajetoria-gastos">
            <h3 id="titulo-trajetoria-gastos">Ao longo do período</h3>
            <DespesaAcumulada pontos={dados.despesasAcumuladasPorDia ?? []}
              inicio={inicio} fim={fim}/>
          </section>
        </div>
      : <GastosPorCategoria total={dados.despesasPagas} linhas={[]}/>}
  </section>
}

/** Quanto do rodado nao foi pago. So existe na tela quando ha km registrado. */
export function PainelDeKm({ dados }: { dados: Dashboard }) {
  return <section className="panel">
    <header className="panel-title">
      <div>
        <span className="eyebrow">Km</span>
        <h2>Km rodado × km morto</h2>
      </div>
      <Link to="/quilometragem">Ver km</Link>
    </header>
    <ProporcaoKm remunerado={dados.kmRemunerado} morto={dados.kmMorto}
      custoMorto={dados.custoKmMorto}/>
  </section>
}


/**
 * As despesas do periodo dentro da categoria delas (Kawa, 23/09/2026): era uma
 * lista separada que repetia o grafico. Cada categoria abre os gastos, como na DRE.
 */
function GastosDaCategoria({ lancamentos }: { lancamentos: LancamentoFinanceiro[] }) {
  const despesas = lancamentos.filter(l => l.tipo === 'DESPESA' && l.status !== 'REJEITADO')
  if (!despesas.length) return null
  const porCategoria = [...despesas.reduce((m, l) => {
    const c = l.categoria || 'Sem categoria'
    return m.set(c, [...(m.get(c) ?? []), l])
  }, new Map<string, LancamentoFinanceiro[]>())]
    .map(([categoria, itens]) => ({ categoria, itens: [...itens].sort((a, b) => a.data.localeCompare(b.data)), total: itens.reduce((t, l) => t + l.valor, 0) }))
    .sort((a, b) => b.total - a.total)
  return <div className="gastos-da-categoria" aria-label="Despesas por categoria, uma a uma">
    <h4>Gasto por gasto</h4>
    {porCategoria.map(c => <details key={c.categoria}>
      <summary><span>{c.categoria}</span><small>{c.itens.length} {c.itens.length === 1 ? 'gasto' : 'gastos'}</small><strong>{moeda(c.total)}</strong></summary>
      <ul>{c.itens.map(l => <li key={l.id}>
        <span>{data(l.data)}</span>
        <span>{l.descricao}{l.veiculo ? <> · <LinkViatura id={l.veiculoId} sigla={l.veiculo}/></> : null}{l.motorista ? <> · <LinkSocorrista id={l.motoristaId} nome={l.motorista}/></> : null}{l.realizado ? null : <em> · a pagar</em>}</span>
        <strong>{moeda(l.valor)}</strong>
      </li>)}</ul>
    </details>)}
  </div>
}
