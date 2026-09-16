import { Link } from 'react-router-dom'
import { DespesaAcumulada, FaturamentoPorGrupo, GastosPorCategoria, ProporcaoKm,
  type LinhaFaturamento } from '../components/Graficos'
import { GradeIndicadores, Indicador, Painel } from '../components/ui/Pagina'
import type { Dashboard } from '../types/modelos'
import { moeda, percentual } from '../utils/formatadores'

/**
 * Os blocos da Visao geral, na mesma linguagem do painel Porto: um numero domina,
 * o contexto fica ao lado, a barra de indicadores responde o que pede acao e os
 * graficos dizem quem trouxe o dinheiro.
 */

/** Diferenca de centavos de arredondamento nao vira linha "sem vinculo". */
const CENTAVO = 0.005

/**
 * Lucro operacional em destaque: e a conta que o dono do guincho abre o sistema
 * para ver. Receita e despesa ficam ao lado, porque sao as duas parcelas dele.
 * "A receber" so aparece quando existe: na Porto a OP chega paga e o painel do
 * dia nasce sem valor, entao ali ele seria sempre zero.
 */
export function ResultadoDoPeriodo({ dados, atualizando }: { dados: Dashboard; atualizando?: boolean }) {
  const lucro = dados.saldoRealizado
  const margem = dados.receitaRecebida ? lucro / dados.receitaRecebida * 100 : null
  const negativo = lucro < 0
  return <div className={`destaque-corpo${atualizando ? ' atualizando' : ''}`}>
    <div className="destaque-numero">
      <span>Lucro operacional</span>
      <strong className={negativo ? 'destaque-negativo' : undefined}>{moeda(lucro)}</strong>
      <small>
        {margem !== null
          ? <><b className={negativo ? 'destaque-negativo' : undefined}>Margem de {percentual(margem)}</b> · </>
          : null}
        receita recebida − despesas pagas
      </small>
    </div>

    <dl className="destaque-contexto">
      <div>
        <dt><i className="marca-recebido"/>Receita recebida</dt>
        <dd>{moeda(dados.receitaRecebida)}</dd>
        {dados.servicosDoPeriodo
          ? <small>{dados.servicosDoPeriodo} {dados.servicosDoPeriodo === 1 ? 'serviço' : 'serviços'} no período</small>
          : null}
      </div>
      <div>
        <dt><i className="marca-despesa"/>Despesas pagas</dt>
        <dd>{moeda(dados.despesasPagas)}</dd>
        <small>{dados.despesasPagas
          ? dados.receitaRecebida
            ? `${percentual(dados.despesasPagas / dados.receitaRecebida * 100)} da receita`
            : 'Aprovadas e quitadas'
          : 'Nenhuma despesa paga'}</small>
      </div>
      {dados.receitaPrevista > 0
        ? <div>
            <dt>A receber</dt>
            <dd>{moeda(dados.receitaPrevista)}</dd>
            <small>{dados.totalAtrasado > 0 ? `${moeda(dados.totalAtrasado)} em atraso` : 'Nada em atraso'}</small>
          </div>
        : null}
    </dl>
  </div>
}

/**
 * O que a operacao ainda deve ou espera. Comissao a repassar e dinheiro que ja e
 * da equipe; despesa a pagar so entra quando existe.
 */
export function IndicadoresDaOperacao({ dados }: { dados: Dashboard }) {
  const servicos = dados.servicosDoPeriodo ?? 0
  const pendentes = dados.servicosPendentes ?? 0
  const comissao = dados.comissaoAPagar ?? 0
  return <GradeIndicadores>
    <Indicador rotulo="Serviços do período" valor={servicos}
      apoio={pendentes
        ? `${pendentes} ${pendentes === 1 ? 'aguarda' : 'aguardam'} OP`
        : servicos ? `${moeda(dados.producaoPaga ?? 0)} pagos pela Porto` : 'Nenhum serviço no período'}/>
    <Indicador rotulo="Comissão a repassar" valor={moeda(comissao)}
      tom={comissao > 0 ? 'atencao' : 'neutro'}
      apoio={comissao > 0 ? 'Devida à equipe, ainda não paga' : 'Nenhuma comissão pendente'}/>
    {dados.despesasPrevistas > 0
      ? <Indicador rotulo="Despesas a pagar" valor={moeda(dados.despesasPrevistas)}
          tom="atencao" apoio="Aprovadas, ainda não pagas"/>
      : null}
  </GradeIndicadores>
}

/**
 * Para onde o dinheiro foi. A frase do cabecalho so aparece quando ha despesa;
 * sem despesa, o proprio grafico diz que o periodo esta vazio.
 */
export function PainelDeGastos({ dados, inicio, fim }: { dados: Dashboard; inicio: string; fim: string }) {
  const categorias = dados.despesasPorCategoria ?? []
  const maior = categorias[0]
  return <section className="panel painel-gastos">
    <header className="panel-title">
      <div>
        <span className="eyebrow">Para onde o dinheiro foi</span>
        <h2>Composição e ritmo dos gastos</h2>
        {maior
          ? <p>
              <strong>{maior.categoria}</strong> puxou {percentual(maior.participacao)} de tudo
              que saiu — {moeda(maior.valor)}.
            </p>
          : null}
      </div>
      <Link to="/despesas">Abrir despesas</Link>
    </header>
    {categorias.length
      ? <div className="gastos-leitura">
          <section aria-labelledby="titulo-composicao-gastos">
            <h3 id="titulo-composicao-gastos">Composição por categoria</h3>
            <GastosPorCategoria total={dados.despesasPagas}
              linhas={categorias.map(c => ({
                id: c.categoriaId, rotulo: c.categoria, valor: c.valor,
                participacao: c.participacao,
              }))}/>
          </section>
          <section aria-labelledby="titulo-trajetoria-gastos">
            <h3 id="titulo-trajetoria-gastos">Trajetória no período</h3>
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
 * Faturamento por socorrista. O que foi pago sem socorrista vinculado vira a
 * ultima linha, para a soma das barras fechar com a producao paga do periodo.
 */
export function PainelFaturamentoPorSocorrista({ dados }: { dados: Dashboard }) {
  const pessoas = (dados.resultadoPorSocorrista ?? []).filter(p => p.servicos > 0)
  const linhas: LinhaFaturamento[] = pessoas.map(p => ({
    chave: String(p.motoristaId), rotulo: p.socorrista, valor: p.producao,
    quantidade: p.servicos, semVinculo: false,
  }))
  const semDono = (dados.producaoPaga ?? 0) - pessoas.reduce((soma, p) => soma + p.producao, 0)
  if (semDono > CENTAVO) linhas.push({ chave: 'sem', rotulo: 'Sem socorrista', valor: semDono, semVinculo: true })

  return <Painel etiqueta="Por pessoa" titulo="Faturamento por socorrista"
    aoLado={<Link to="/equipe">Abrir socorristas</Link>}>
    <FaturamentoPorGrupo descricao="Faturamento por socorrista no período"
      vazio="Nenhum serviço pago neste período." linhas={linhas}/>
  </Painel>
}

/**
 * Faturamento por viatura. A viatura vem da sigla da OS; o custo aparece ao lado
 * quando a viatura teve despesa paga. Receita sem viatura fecha a conta na
 * ultima linha.
 */
export function PainelFaturamentoPorViatura({ dados }: { dados: Dashboard }) {
  const viaturas = dados.resultadoPorVeiculo.filter(v => v.receitas > 0 || v.despesas > 0)
  const linhas: LinhaFaturamento[] = viaturas.map(v => ({
    chave: String(v.veiculoId), rotulo: v.veiculo, valor: v.receitas, semVinculo: false,
    detalhe: v.despesas > 0 ? `custo ${moeda(v.despesas)}` : undefined,
  }))
  const semDono = dados.receitaRecebida - viaturas.reduce((soma, v) => soma + v.receitas, 0)
  if (semDono > CENTAVO) linhas.push({ chave: 'sem', rotulo: 'Sem viatura', valor: semDono, semVinculo: true })

  return <Painel etiqueta="Por viatura" titulo="Faturamento por viatura"
    aoLado={<Link to="/veiculos">Abrir veículos</Link>}>
    <FaturamentoPorGrupo descricao="Faturamento por viatura no período"
      vazio="Nenhuma receita neste período." linhas={linhas}/>
  </Painel>
}
