import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { baixarRelatorioPorto, obterDashboardAltoNivelPorto } from '../dados/porto'
import type {
  DashboardAltoNivelPorto, LinhaFaturamentoPorto, OpDestaquePorto, PendenciasVinculoPorto,
} from '../types/modelos'

/**
 * Lista de OS filtrada pela situacao, dentro da competencia do painel.
 *
 * O painel fala em competencia — o que vai ser pago nesta janela —, entao a
 * lista que ele abre tem de olhar pelo mesmo lado, e nao pela data do servico.
 */
const listaDeOs = (situacao: string) => `/porto/ordens-servico?situacao=${situacao}&competencia=1`
import { data, moeda, percentual } from '../utils/formatadores'
import { Carregando } from '../components/EstadoPagina'
import { EvolucaoAcumulada, FaturamentoPorGrupo } from '../components/Graficos'
import { CabecalhoPagina, Etiqueta, GradeIndicadores, Indicador, Painel } from '../components/ui/Pagina'
import { usePeriodoGlobal } from '../utils/periodoGlobal'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { gravarFiltro, lerFiltro } from '../utils/filtroLembrado'
import { useAoVivo } from '../dados/aoVivo'

/**
 * Painel Porto.
 *
 * A tela responde, nesta ordem: quanto entrou, quais OS ainda estao sem dono, o
 * que precisa de acao, quem faturou quanto e quais OPs olhar. A ordem nao e estetica — e a
 * sequencia em que quem administra pergunta, e por isso o dinheiro vem primeiro
 * e o detalhe por ultimo.
 *
 * O periodo e a ordem de pagamento, nao um mes do calendario comum: e a OP que
 * define em qual recorte um servico entra, porque e ela que paga, e uma OP
 * costuma comecar no fim de um mes e terminar no meio do seguinte. Escolher a OP
 * preenche as datas; editar as datas devolve o periodo para "Personalizado".
 *
 * Os filtros de OS, OP, especialidade e socorrista que existiam aqui foram
 * removidos: nenhum deles chegava ao banco — a consulta agregada so recebe
 * inicio e fim —, entao a tela prometia um recorte que nunca acontecia. Filtro
 * de linha vive na tela de ordens de servico, onde ha linhas para filtrar.
 */
type Grao = 'DIA' | 'SEMANA' | 'MES'

const GRAOS = [
  { valor: 'DIA', texto: 'Diário' },
  { valor: 'SEMANA', texto: 'Semanal' },
  { valor: 'MES', texto: 'Mensal' },
]

const CONCILIACAO: Record<string, string> = {
  CONCILIADA: 'Conciliada', SEM_COMPOSICAO: 'Sem composição',
  VALOR_ABAIXO: 'Valor abaixo', VALOR_ACIMA: 'Valor acima',
  RECEBIDA_COM_DIVERGENCIA: 'Divergência no recebimento',
}

/** dd/mm no eixo do grafico; no grao mensal, o mes por extenso curto. */
function rotuloDoBalde(grao: string) {
  return (inicio: string) => {
    const [ano, mes, dia] = inicio.split('-')
    if (grao === 'MES') {
      return new Date(Number(ano), Number(mes) - 1, 1)
        .toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
    }
    return `${dia}/${mes}`
  }
}

/** "16 sem socorrista · 275 sem viatura", so com as partes que existem. */
function detalheDoVinculo(p: PendenciasVinculoPorto) {
  return [
    p.semSocorrista ? `${p.semSocorrista} sem socorrista` : '',
    p.semViatura ? `${p.semViatura} sem viatura` : '',
  ].filter(Boolean).join(' · ')
}

/**
 * Barra do faturamento: a quantidade inclui o servico sem valor, que foi feito
 * do mesmo jeito. Quando ha algum, o detalhe diz quantos ainda nao tem preco.
 */
function detalhar(l: LinhaFaturamentoPorto) {
  const servicos = `${l.quantidade} ${l.quantidade === 1 ? 'serviço' : 'serviços'}`
  return { ...l, detalhe: l.semValor ? `${servicos} · ${l.semValor} sem valor` : servicos }
}

/** Um cartao so fica colorido quando ha o que resolver: zero e uma boa noticia. */
const tom = (valor: number, cor: 'alerta' | 'atencao') => (valor > 0 ? cor : 'neutro')

export default function PortoDashboardPage() {
  const [dados, setDados] = useState<DashboardAltoNivelPorto | null>(null)
  const [periodo, setPeriodo] = usePeriodoGlobal()
  const { inicio, fim } = periodo
  const [grao, setGrao] = useState<Grao>(() => lerFiltro<{ grao: Grao }>('porto-painel', { grao: 'DIA' }).grao)
  const [carregando, setCarregando] = useState(true)
  const [baixando, setBaixando] = useState('')
  const [erro, setErro] = useState('')

  const carregar = useCallback(async (de: string, ate: string, g: 'DIA' | 'SEMANA' | 'MES') => {
    setCarregando(true); setErro('')
    try { setDados(await obterDashboardAltoNivelPorto(de, ate, g)) }
    catch (e) { setErro((e as Error).message) }
    finally { setCarregando(false) }
  }, [])

  useEffect(() => { if (inicio && fim && inicio <= fim) void carregar(inicio, fim, grao) }, [carregar, inicio, fim, grao])
  // Grava depois de cada mudanca, e nao dentro de cada handler: assim nenhum
  // caminho novo de alteracao de periodo esquece de lembrar o que escolheu.
  useEffect(() => {
    gravarFiltro('porto-painel', { grao })
  }, [grao])
  // Importacao, pendencia resolvida ou OP nova em qualquer lugar: recarrega.
  useAoVivo(() => { void carregar(inicio, fim, grao) })
  function trocarGrao(novo: Grao) { setGrao(novo) }

  async function exportar(formato: 'excel' | 'pdf') {
    setErro(''); setBaixando(formato)
    try {
      await baixarRelatorioPorto(formato, new URLSearchParams({ dataInicio: inicio, dataFim: fim }))
    } catch (e) { setErro((e as Error).message) }
    finally { setBaixando('') }
  }

  const vazio = Boolean(dados && !dados.quantidadeTotalServicos && !dados.quantidadeTotalOps)
  const recebidoSobreProducao = dados && dados.valorTotalRealizado > 0
    ? (dados.valorRecebido / dados.valorTotalRealizado) * 100
    : null

  // Atencao e so o que pede providencia. Servico aguardando OP e a espera normal
  // pela Porto: ja aparece como "a receber" no topo e nao pede acao de ninguem.
  const divergencias = dados?.quantidadeComDivergencia ?? 0
  const conciliacao = dados?.conciliacao
  const ticketMedio = dados && dados.quantidadeTotalServicos > 0
    ? dados.valorTotalRealizado / dados.quantidadeTotalServicos
    : null

  return <div className="page-enter painel-porto">
    <CabecalhoPagina
      modulo="Porto Seguro"
      titulo="Dashboard Porto"
      descricao="O que a equipe produziu, o que a Porto já pagou e o que ainda aguarda uma OP."
      contexto={<>Período selecionado: <strong>{data(inicio)}</strong> → <strong>{data(fim)}</strong></>}
      acoes={<>
        <Link className="button button-ghost" to="/porto/relatorios">Relatórios</Link>
        <button className="button button-ghost" disabled={baixando !== ''} onClick={() => void exportar('pdf')}>
          {baixando === 'pdf' ? 'Gerando PDF…' : 'Exportar PDF'}
        </button>
        <button className="button button-primary" disabled={baixando !== ''} onClick={() => void exportar('excel')}>
          {baixando === 'excel' ? 'Gerando Excel…' : 'Exportar Excel'}
        </button>
      </>}/>

    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}

    <section className="panel destaque" aria-label="Resumo financeiro">
      <form className="destaque-periodo destaque-periodo-sem-botao" onSubmit={e => e.preventDefault()}>
        <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/>
      </form>

      {carregando && !dados ? <Carregando/> : null}

      {dados && vazio && !carregando
        ? <div className="painel-vazio">
            <div className="empty-ledger" aria-hidden="true"/>
            <h2>Nenhum dado da Porto neste período</h2>
            <p>Importe um relatório da Porto ou escolha outro período para ver produção, pagamentos e recebimentos.</p>
            <Link className="button button-primary" to="/porto/importacoes">Importar relatório</Link>
          </div>
        : null}

      {dados && !vazio
        ? <div className={`destaque-corpo${carregando ? ' atualizando' : ''}`}>
            <div className="destaque-numero">
              <span>Recebido no período</span>
              <strong>{moeda(dados.valorRecebido)}</strong>
              <small>
                {recebidoSobreProducao !== null
                  ? <><b>{percentual(Math.min(recebidoSobreProducao, 100))} da produção</b> · </>
                  : null}
                {dados.quantidadeTotalOps} {dados.quantidadeTotalOps === 1 ? 'OP recebida' : 'OPs recebidas'}
              </small>
            </div>

            <dl className="destaque-contexto">
              <div>
                <dt><i className="marca-produzido"/>Realizado</dt>
                <dd>{moeda(dados.valorTotalRealizado)}</dd>
                <small>{dados.quantidadeTotalServicos} serviços executados</small>
                {ticketMedio !== null ? <small>Ticket médio {moeda(ticketMedio)}</small> : null}
              </div>
              {/* Nao existe "a receber": a OP chega paga e o painel do dia chega
                  sem valor. O que falta na OS e dono — socorrista ou viatura. */}
              {dados.pendenciasVinculo.quantidade
                ? <div className="destaque-pendente">
                    <dt>Sem socorrista ou viatura</dt>
                    <dd>{dados.pendenciasVinculo.quantidade} OS</dd>
                    <small>{detalheDoVinculo(dados.pendenciasVinculo)}</small>
                    <Link to="/porto/pendencias">Resolver pendências</Link>
                  </div>
                : null}
            </dl>

            <div className="destaque-grafico">
              <header>
                <span className="destaque-legenda">
                  <span><i className="marca-produzido"/>Produção acumulada</span>
                  <span><i className="marca-recebido"/>Recebido acumulado</span>
                </span>
                <div className="segmented" role="group" aria-label="Agrupamento do gráfico">
                  {GRAOS.map(g => <button key={g.valor} type="button"
                    className={grao === g.valor ? 'active' : ''}
                    onClick={() => trocarGrao(g.valor as 'DIA' | 'SEMANA' | 'MES')}>{g.texto}</button>)}
                </div>
              </header>
              <EvolucaoAcumulada pontos={dados.serie} rotulo={rotuloDoBalde(grao)}/>
            </div>
          </div>
        : null}
    </section>

    {dados && !vazio ? <>
      <GradeIndicadores>
        <Indicador rotulo="Serviços realizados" valor={dados.quantidadeTotalServicos}
          apoio={`${moeda(dados.valorTotalRealizado)} no período`}/>
        <Indicador rotulo="Aguardando OP" valor={dados.quantidadeAguardandoOp}
          tom={tom(dados.quantidadeAguardandoOp, 'atencao')}
          apoio={dados.valorAguardandoOp
            ? `${moeda(dados.valorAguardandoOp)} sem cobrança`
            // O painel do dia chega sem valor: o preco so vem com a OP.
            : dados.quantidadeAguardandoOp ? 'Sem valor até a OP' : 'Nenhum serviço fora de OP'}/>
        <Indicador rotulo="OPs com divergência" valor={dados.quantidadeComDivergencia}
          tom={tom(dados.quantidadeComDivergencia, 'alerta')}
          apoio={dados.quantidadeComDivergencia ? moeda(dados.valorTotalDivergencias) : 'Composição confere'}/>
      </GradeIndicadores>

      {/* Conciliacao com a OP: o servico existe e conta na quantidade mesmo sem
          valor; o card diz quanto falta fechar e abre a lista. */}
      {conciliacao ? <GradeIndicadores>
        <Indicador rotulo="Serviços sem valor" valor={conciliacao.semValor}
          tom={tom(conciliacao.semValor, 'atencao')} link={listaDeOs('AGUARDANDO_ANALISE')}
          apoio={conciliacao.semValor ? 'Aguardando a análise da Porto' : 'Todos com valor'}/>
        <Indicador rotulo="Com valor informado" valor={conciliacao.comValorManual}
          link={listaDeOs('VALOR_MANUAL')}
          apoio={conciliacao.comValorManual ? `${moeda(conciliacao.valorManual)} previstos, sem comissão` : 'Nenhum valor informado à mão'}/>
        <Indicador rotulo="Aguardando próxima OP" valor={conciliacao.aguardandoProximaOp}
          tom={tom(conciliacao.aguardandoProximaOp, 'atencao')} link={listaDeOs('AGUARDANDO_PROXIMA_OP')}
          apoio={conciliacao.aguardandoProximaOp
            ? `${moeda(conciliacao.valorAguardandoProximaOp)} projetados desta competência`
            : 'Nada ficou para trás'}/>
        <Indicador rotulo="Valor divergente" valor={conciliacao.divergentes}
          tom={tom(conciliacao.divergentes, 'alerta')} link={listaDeOs('DIVERGENTE')}
          apoio={conciliacao.divergentes ? `${moeda(conciliacao.valorDivergencia)} entre o informado e a OP` : 'OP bateu com o informado'}/>
      </GradeIndicadores> : null}

      {divergencias
        ? <Painel className="painel-atencao" etiqueta="Ação" titulo="Precisa de atenção">
            <ul>
              <li className="grave">
                <span>
                  <strong>{divergencias} {divergencias === 1 ? 'OP com divergência' : 'OPs com divergência'}</strong>
                  <small>{moeda(dados.valorTotalDivergencias)} entre o valor da OP e a soma das OS</small>
                </span>
                <Link className="table-action" to="/porto/ordens-pagamento">Ver ordens de pagamento</Link>
              </li>
            </ul>
          </Painel>
        : null}

      <div className="painel-faturamento">
        <Painel etiqueta="Por pessoa" titulo="Faturamento por socorrista">
          <FaturamentoPorGrupo descricao="Faturamento por socorrista no período"
            vazio="Nenhum serviço neste período."
            linhas={dados.faturamentoPorSocorrista.map(l => ({ ...detalhar(l), ...(l.semVinculo ? {} : { link: `/equipe/${l.chave}` }) }))}/>
        </Painel>
        <Painel etiqueta="Por viatura" titulo="Faturamento por viatura">
          <FaturamentoPorGrupo descricao="Faturamento por viatura no período"
            vazio="Nenhum serviço neste período."
            linhas={dados.faturamentoPorViatura.map(l => ({ ...detalhar(l),
              link: l.semVinculo ? '/porto/ordens-servico?semViatura=1' : `/veiculos?sigla=${encodeURIComponent(l.chave)}`,
              ...(l.semVinculo ? { ajudaDoLink: 'Ver as OS que estão sem viatura' } : {}) }))}/>
        </Painel>
      </div>

      {dados.opsDestaque.length
        ? <Painel semRespiro className="painel-ops-titulo" etiqueta="Detalhe"
            titulo="Ordens de pagamento do período"
            aoLado={<Link to="/porto/ordens-pagamento">Ver todas</Link>}>
            <div className="table-scroll"><table>
              <thead><tr>
                <th>OP</th><th>Período</th><th>OS</th><th>Valor</th>
                <th>Recebido</th><th>Conciliação</th>
              </tr></thead>
              <tbody>{dados.opsDestaque.map(op => <tr key={op.id}>
                <td><strong>{op.numero}</strong></td>
                <td>{op.periodoInicio && op.periodoFim
                  ? `${data(op.periodoInicio)} a ${data(op.periodoFim)}`
                  : op.dataPagamentoProgramada ? data(op.dataPagamentoProgramada) : '—'}</td>
                <td>{op.quantidadeOrdensServico}</td>
                <td>{moeda(op.valorTotal)}</td>
                <td>{op.valorRecebido == null ? '—' : moeda(op.valorRecebido)}</td>
                <td><Badge status={op.statusConciliacao}/></td>
              </tr>)}</tbody>
            </table></div>
          </Painel>
        : null}
    </> : null}
  </div>
}

/** Badge discreto: verde so para conciliada, vermelho so para divergencia real. */
function Badge({ status }: { status: OpDestaquePorto['statusConciliacao'] }) {
  const tom = status === 'CONCILIADA' ? 'ok'
    : status === 'SEM_COMPOSICAO' ? 'neutro' : 'alerta'
  return <Etiqueta tom={tom}>{CONCILIACAO[status] ?? status}</Etiqueta>
}
