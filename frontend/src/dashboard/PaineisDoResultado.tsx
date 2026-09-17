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
    <div className="destaque-numero">
      <span>Lucro</span>
      <strong className={negativo ? 'destaque-negativo' : undefined}>{moeda(lucro)}</strong>
      <small>
        {margem !== null
          ? <><b className={negativo ? 'destaque-negativo' : undefined}>Margem de {percentual(margem)}</b> · </>
          : null}
        receitas − despesas
      </small>
    </div>

    <div className="resultado-partes">
      <div className="resultado-parte resultado-receitas">
        <span className="resultado-parte-nome">Receitas</span>
        <strong>{moeda(dados.receitaRecebida)}</strong>
        <span className="resultado-trilho" aria-hidden="true">
          <span style={{ width: largura(dados.receitaRecebida) }}/>
        </span>
        <small>{servicos ? `${servicos} ${servicos === 1 ? 'serviço' : 'serviços'}` : 'Nenhuma receita'}</small>
      </div>
      <div className="resultado-parte resultado-despesas">
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
      </div>
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
  // Comissao da equipe: 20% dos servicos pagos, somando todos os socorristas.
  // Ja entra em despesas sozinha; aqui aparece o valor de cada um e o total.
  const comissoes = (dados.resultadoPorSocorrista ?? []).reduce((soma, p) => soma + p.comissao, 0)
  return <GradeIndicadores>
    <Indicador rotulo="Serviços" valor={servicos}
      apoio={pendentes
        ? `${pendentes} ${pendentes === 1 ? 'aguarda' : 'aguardam'} OP`
        : servicos ? `${moeda(dados.producaoPaga ?? 0)} pagos pela Porto` : 'Nenhum serviço'}/>
    <Indicador rotulo="Comissões" valor={moeda(comissoes)}
      apoio={comissoes > 0 ? 'Total da equipe no período, já em despesas' : 'Nenhuma comissão no período'}/>
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
 * Faturamento por socorrista. O que foi pago sem socorrista vinculado vira a
 * ultima linha, para a soma das barras fechar com a producao paga do periodo.
 */
export function PainelFaturamentoPorSocorrista({ dados }: { dados: Dashboard }) {
  const pessoas = (dados.resultadoPorSocorrista ?? []).filter(p => p.servicos > 0)
  const linhas: LinhaFaturamento[] = pessoas.map(p => ({
    chave: String(p.motoristaId), rotulo: p.socorrista, valor: p.producao,
    semVinculo: false, link: `/equipe/${p.motoristaId}`,
    detalhe: `${p.servicos} ${p.servicos === 1 ? 'serviço' : 'serviços'} · comissão ${moeda(p.comissao)}`,
  }))
  const semDono = (dados.producaoPaga ?? 0) - pessoas.reduce((soma, p) => soma + p.producao, 0)
  if (semDono > CENTAVO) linhas.push({ chave: 'sem', rotulo: 'Sem socorrista', valor: semDono, semVinculo: true })

  return <Painel etiqueta="Receitas" titulo="Por socorrista"
    aoLado={<Link to="/equipe">Ver socorristas</Link>}>
    <FaturamentoPorGrupo descricao="Receitas por socorrista"
      vazio="Nenhuma receita no período." linhas={linhas}/>
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
    link: `/veiculos?veiculo=${v.veiculoId}`,
    detalhe: v.despesas > 0 ? `custo ${moeda(v.despesas)}` : undefined,
  }))
  const semDono = dados.receitaRecebida - viaturas.reduce((soma, v) => soma + v.receitas, 0)
  if (semDono > CENTAVO) linhas.push({ chave: 'sem', rotulo: 'Sem viatura', valor: semDono, semVinculo: true })

  return <Painel etiqueta="Receitas" titulo="Por viatura"
    aoLado={<Link to="/veiculos">Ver viaturas</Link>}>
    <FaturamentoPorGrupo descricao="Receitas por viatura"
      vazio="Nenhuma receita no período." linhas={linhas}/>
  </Painel>
}
