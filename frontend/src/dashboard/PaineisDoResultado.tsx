import { Link } from 'react-router-dom'
import { FaturamentoECusto, GastosPorCategoria, ProporcaoServicos } from '../components/Graficos'
import type { Dashboard, ResumoOpsPorto } from '../types/modelos'
import { moeda, numero, percentual } from '../utils/formatadores'

/**
 * Os blocos da Visao geral. Ficam aqui porque a pagina era uma unica funcao com
 * cinco secoes em quatro linhas de mil caracteres, e mexer numa exigia achar
 * onde ela comecava no meio da outra.
 */

export function CartaoMetrica(
  { titulo, valor, apoio, tom = '' }: { titulo: string; valor: string; apoio: string; tom?: string },
) {
  return <article className={`metric metric-v2 ${tom}`}>
    <span>{titulo}</span><strong>{valor}</strong><small>{apoio}</small>
  </article>
}

/** Receita − despesas = lucro, escrito como uma conta, que e como se le. */
export function FaixaDoResultado({ dados, margem }: { dados: Dashboard; margem: number }) {
  const proporcaoDespesa = dados.receitaRecebida
    ? percentual((dados.despesasPagas / dados.receitaRecebida) * 100) : '0%'
  return <section className="finance-lane" aria-label="Fluxo do resultado operacional">
    <div>
      <span>Receita do mês</span><strong>{moeda(dados.receitaRecebida)}</strong>
      <small>Recebimentos confirmados no financeiro</small>
    </div>
    <i className="lane-separator">−</i>
    <div>
      <span>Despesas do mês</span><strong>{moeda(dados.despesasPagas)}</strong>
      <small>{proporcaoDespesa} da receita</small>
    </div>
    <i className="lane-separator">=</i>
    <div className="lane-result">
      <span>Lucro operacional</span><strong>{moeda(dados.saldoRealizado)}</strong>
      <small>Margem de {percentual(margem)}</small>
    </div>
  </section>
}

/**
 * Para onde o dinheiro foi. Fica logo abaixo da conta do mes de proposito: a
 * faixa acima responde "quanto sobrou" e esta responde "no que foi", que e a
 * pergunta seguinte de quem abre o sistema. As duas juntas cabem na primeira
 * tela, sem rolar.
 */
export function PainelDeGastos({ dados }: { dados: Dashboard }) {
  const categorias = dados.despesasPorCategoria ?? []
  const maior = categorias[0]
  return <section className="panel painel-gastos">
    <header className="panel-title">
      <div>
        <span className="eyebrow">Para onde o dinheiro foi</span>
        <h2>Maiores gastos do período</h2>
        {maior
          ? <p>
              <strong>{maior.categoria}</strong> puxou {percentual(maior.participacao)} de tudo
              que saiu — {moeda(maior.valor)}.
            </p>
          : <p>Nenhuma despesa paga no período.</p>}
      </div>
      <Link to="/despesas">Abrir despesas</Link>
    </header>
    <GastosPorCategoria total={dados.despesasPagas}
      linhas={categorias.map(c => ({
        id: c.categoriaId, rotulo: c.categoria, valor: c.valor, participacao: c.participacao,
      }))}/>
  </section>
}

export function IndicadoresDeKm({ dados }: { dados: Dashboard }) {
  const proporcaoKmMorto = dados.quilometragemTotal
    ? percentual(dados.kmMorto / dados.quilometragemTotal * 100) : '0%'
  return <section className="metric-grid metric-grid-v2">
    <CartaoMetrica titulo="Km rodado" valor={`${numero(dados.quilometragemTotal)} km`}
      apoio="Percurso total da frota"/>
    <CartaoMetrica titulo="Km morto" valor={`${numero(dados.kmMorto)} km`}
      apoio={`${proporcaoKmMorto} do percurso total`}/>
    <CartaoMetrica titulo="Custo do km morto" valor={moeda(dados.custoKmMorto)}
      apoio="Km improdutivo × custo por km"/>
    <CartaoMetrica titulo="Despesas previstas" valor={moeda(dados.despesasPrevistas)}
      apoio="Aprovadas e ainda não pagas" tom="metric-neutral"/>
  </section>
}

/**
 * Servico e comissao andam juntos: uma e 20% da outra, e ver so a receita esconde
 * metade do que o dia custou. Nenhum dos dois entra de novo no saldo — a receita
 * ja esta em "recebido" e a comissao vira despesa quando e paga.
 */
export function PainelDaProducao({ dados }: { dados: Dashboard }) {
  const pendentes = dados.servicosPendentes ?? 0
  const doPeriodo = dados.servicosDoPeriodo ?? 0
  const producaoPendente = dados.producaoPendente ?? 0
  return <section className="panel">
    <header className="panel-title">
      <div><span className="eyebrow">Serviços do período</span><h2>Produção e comissão</h2></div>
      <Link to="/comissoes">Abrir comissões</Link>
    </header>
    <div className="fleet-summary">
      <div>
        <span>Serviços pagos</span><strong>{moeda(dados.producaoPaga ?? 0)}</strong>
        <small>Valor total do serviço</small>
      </div>
      <div>
        <span>Comissão sobre eles</span><strong>{moeda(dados.comissaoSobreProducao ?? 0)}</strong>
        <small>20% do valor acima</small>
      </div>
      <div>
        <span>Ainda não pagos</span><strong>{pendentes} de {doPeriodo}</strong>
        <small>
          {producaoPendente > 0
            ? `${moeda(producaoPendente)} aguardando OP`
            : 'Valor só sai quando a Porto fecha a OP'}
        </small>
      </div>
      <div>
        <span>Comissão a repassar</span><strong>{moeda(dados.comissaoAPagar ?? 0)}</strong>
        <small>Já devida, ainda não paga à equipe</small>
      </div>
    </div>
    <ProporcaoServicos pagos={doPeriodo - pendentes} pendentes={pendentes}
      valorPago={dados.producaoPaga ?? 0} valorPendente={producaoPendente}/>
    {pendentes > 0
      ? <p className="empty-inline">
          Serviço prestado não é serviço pago: a Porto só fecha a OP semanas depois. Estes entram
          na comissão do ciclo em que forem pagos, não no ciclo em que aconteceram.
        </p>
      : null}
  </section>
}

export function PainelPorSocorrista({ dados }: { dados: Dashboard }) {
  const linhas = dados.resultadoPorSocorrista ?? []
  return <section className="panel">
    <header className="panel-title">
      <div><span className="eyebrow">Por pessoa</span><h2>Faturamento e custo por socorrista</h2></div>
      <Link to="/equipe">Abrir socorristas</Link>
    </header>
    <FaturamentoECusto descricao="Faturamento e custo por socorrista"
      vazio="Nenhum serviço pago com socorrista vinculado neste período."
      linhas={linhas.map(p => ({
        id: p.motoristaId, rotulo: p.socorrista, faturamento: p.producao, custo: p.custoTotal,
      }))}/>
    {linhas.length
      ? <div className="table-scroll">
          <table>
            <thead><tr>
              <th>Socorrista</th><th>Serviços</th><th>Produção</th><th>Comissão</th>
              <th>Despesas próprias</th><th>Custo total</th>
            </tr></thead>
            <tbody>
              {linhas.map(p => <tr key={p.motoristaId}>
                <td><strong>{p.socorrista}</strong></td>
                <td>{p.servicos}</td><td>{moeda(p.producao)}</td><td>{moeda(p.comissao)}</td>
                <td>{moeda(p.despesas)}</td><td><strong>{moeda(p.custoTotal)}</strong></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      : null}
  </section>
}

export function PainelPorVeiculo({ dados }: { dados: Dashboard }) {
  const linhas = dados.resultadoPorVeiculo
  return <section className="panel vehicle-results vehicle-results-v2">
    <header className="panel-title">
      <div><span className="eyebrow">Por viatura</span><h2>Faturamento e custo por veículo</h2></div>
      <Link to="/veiculos">Abrir veículos</Link>
    </header>
    <FaturamentoECusto descricao="Faturamento e custo por veículo"
      vazio="Nenhum resultado por veículo no período."
      linhas={linhas.map(v => ({
        id: v.veiculoId, rotulo: v.veiculo, faturamento: v.receitas, custo: v.despesas,
      }))}/>
    {linhas.length
      ? <div className="table-scroll">
          <table>
            <thead><tr>
              <th>Veículo</th><th>Faturamento</th><th>Custo</th><th>Resultado</th>
              <th>Km morto</th><th>Custo km morto</th>
            </tr></thead>
            <tbody>
              {linhas.map(item => <tr key={item.veiculoId}>
                <td><strong>{item.veiculo}</strong></td>
                <td>{moeda(item.receitas)}</td><td>{moeda(item.despesas)}</td>
                <td className={item.resultado >= 0 ? 'positive' : 'negative'}>
                  <strong>{moeda(item.resultado)}</strong>
                </td>
                <td>{numero(item.kmMorto)} km</td><td>{moeda(item.custoKmMorto)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      : null}
  </section>
}

/** Faturamento Porto fica fora do caixa ate o recebimento confirmado. */
export function ResumoPorto({ porto }: { porto: ResumoOpsPorto }) {
  return <section className="porto-finance-summary" aria-label="Faturamento Porto">
    <header>
      <div><span className="eyebrow">Porto Seguro</span><h2>Faturamento separado do caixa</h2></div>
      <Link to="/porto/dashboard">Abrir módulo Porto →</Link>
    </header>
    <div>
      <span>Previsto<strong>{moeda(porto.valorTotalPrevisto)}</strong>
        <small>{porto.quantidadeTotalOps} OPs</small></span>
      <span>Programado<strong>{moeda(porto.valorProgramado)}</strong>
        <small>Ainda não recebido</small></span>
      <span>Recebido no banco<strong>{moeda(porto.valorRecebido)}</strong>
        <small>Confirmação financeira</small></span>
    </div>
    <p>
      Valores previstos e programados não compõem o caixa, a DRE ou o lucro até o recebimento
      confirmado.
    </p>
  </section>
}
