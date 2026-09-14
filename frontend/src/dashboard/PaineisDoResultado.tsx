import { Link } from 'react-router-dom'
import { FaturamentoECusto, GastosPorCategoria, ProporcaoKm, ProporcaoServicos } from '../components/Graficos'
import type { Dashboard, ResumoOpsPorto } from '../types/modelos'
import { moeda, percentual } from '../utils/formatadores'

/**
 * Os blocos da Visao geral. Ficam aqui porque a pagina era uma unica funcao com
 * cinco secoes em quatro linhas de mil caracteres, e mexer numa exigia achar
 * onde ela comecava no meio da outra.
 */

/**
 * Os quatro numeros que respondem "como esta o mes" antes de qualquer grafico.
 *
 * Ficam acima de tudo porque sao a leitura de quem so tem dez segundos; os
 * graficos abaixo explicam de onde cada um saiu. O lucro e o unico com destaque
 * proprio: e a conta que o dono do guincho abre o sistema para ver, e muda de
 * cor conforme o sinal, porque prejuizo em azul nao parece prejuizo.
 */
export function FaixaDeIndicadores({ dados, margem }: { dados: Dashboard; margem: number }) {
  const aReceber = dados.receitaPrevista + dados.totalAtrasado
  const lucro = dados.saldoRealizado
  return <section className="kpi-grid" aria-label="Indicadores do período">
    <article className="kpi">
      <span>Receita recebida</span>
      <strong>{moeda(dados.receitaRecebida)}</strong>
      <small>Confirmada no financeiro</small>
    </article>
    <article className="kpi">
      <span>Despesas pagas</span>
      <strong className="negative">{moeda(dados.despesasPagas)}</strong>
      <small>
        {dados.receitaRecebida
          ? `${percentual(dados.despesasPagas / dados.receitaRecebida * 100)} da receita`
          : 'Aprovadas e quitadas'}
      </small>
    </article>
    <article className={lucro < 0 ? 'kpi kpi-destaque kpi-negativo' : 'kpi kpi-destaque'}>
      <span>Lucro operacional</span>
      <strong>{moeda(lucro)}</strong>
      <small>Margem de {percentual(margem)}</small>
    </article>
    <article className="kpi">
      <span>A receber</span>
      <strong>{moeda(aReceber)}</strong>
      <small>
        {dados.totalAtrasado > 0
          ? `${moeda(dados.totalAtrasado)} em atraso`
          : 'Nada em atraso'}
      </small>
    </article>
  </section>
}

/**
 * Para onde o dinheiro foi. Fica logo abaixo dos indicadores de proposito: eles
 * respondem "quanto sobrou" e este responde "no que foi", que e a pergunta
 * seguinte de quem abre o sistema.
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

/**
 * Quanto do rodado nao foi pago. Eram quatro cartoes com quatro numeros soltos —
 * rodado, morto, custo e despesa prevista — e a relacao entre eles, que e a
 * unica coisa que importa ali, ficava por conta de quem lia.
 */
export function PainelDeKm({ dados }: { dados: Dashboard }) {
  return <section className="panel">
    <header className="panel-title">
      <div>
        <span className="eyebrow">Deslocamento</span>
        <h2>Km rodado × km morto</h2>
      </div>
      <Link to="/quilometragem">Abrir quilometragem</Link>
    </header>
    <ProporcaoKm remunerado={dados.kmRemunerado} morto={dados.kmMorto}
      custoMorto={dados.custoKmMorto}/>
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
  return <section className="panel">
    <header className="panel-title">
      <div><span className="eyebrow">Por pessoa</span><h2>Faturamento e custo por socorrista</h2></div>
      <Link to="/equipe">Abrir socorristas</Link>
    </header>
    <FaturamentoECusto descricao="Faturamento e custo por socorrista"
      vazio="Nenhum serviço pago com socorrista vinculado neste período."
      linhas={(dados.resultadoPorSocorrista ?? []).map(p => ({
        id: p.motoristaId, rotulo: p.socorrista, faturamento: p.producao, custo: p.custoTotal,
      }))}/>
  </section>
}

export function PainelPorVeiculo({ dados }: { dados: Dashboard }) {
  return <section className="panel vehicle-results vehicle-results-v2">
    <header className="panel-title">
      <div><span className="eyebrow">Por viatura</span><h2>Faturamento e custo por veículo</h2></div>
      <Link to="/veiculos">Abrir veículos</Link>
    </header>
    <FaturamentoECusto descricao="Faturamento e custo por veículo"
      vazio="Nenhum resultado por veículo no período."
      linhas={dados.resultadoPorVeiculo.map(v => ({
        id: v.veiculoId, rotulo: v.veiculo, faturamento: v.receitas, custo: v.despesas,
      }))}/>
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
