import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { baixarRelatorioPorto, listarPeriodosDeOp, obterDashboardAltoNivelPorto } from '../dados/porto'
import type { DashboardAltoNivelPorto, OpDestaquePorto, OrdemPagamentoPorto } from '../types/modelos'
import { data, hojeIso, moeda, percentual } from '../utils/formatadores'
import { Carregando } from '../components/EstadoPagina'
import { Campo, Selecao } from '../components/Campos'
import { EvolucaoAcumulada } from '../components/Graficos'
import { CabecalhoPagina, Etiqueta, GradeIndicadores, Indicador, Painel } from '../components/ui/Pagina'
import { rotuloOp } from '../utils/periodos'

/**
 * Painel Porto.
 *
 * A tela responde, nesta ordem: quanto entrou, o que esta em aberto, o que
 * precisa de acao, como evoluiu e quais OPs olhar. A ordem nao e estetica — e a
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
const primeiroDiaDoMes = () => `${hojeIso().slice(0, 8)}01`

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

/** Um cartao so fica vermelho quando ha o que resolver: zero e uma boa noticia. */
const tom = (valor: number, cor: 'alerta' | 'atencao') => (valor > 0 ? cor : 'neutro')

export default function PortoDashboardPage() {
  const [dados, setDados] = useState<DashboardAltoNivelPorto | null>(null)
  const [ops, setOps] = useState<OrdemPagamentoPorto[]>([])
  const [opEscolhida, setOpEscolhida] = useState('')
  const [inicio, setInicio] = useState(primeiroDiaDoMes())
  const [fim, setFim] = useState(hojeIso())
  const [grao, setGrao] = useState<'DIA' | 'SEMANA' | 'MES'>('DIA')
  const [carregando, setCarregando] = useState(true)
  const [baixando, setBaixando] = useState('')
  const [erro, setErro] = useState('')

  const carregar = useCallback(async (de: string, ate: string, g: 'DIA' | 'SEMANA' | 'MES') => {
    setCarregando(true); setErro('')
    try { setDados(await obterDashboardAltoNivelPorto(de, ate, g)) }
    catch (e) { setErro((e as Error).message) }
    finally { setCarregando(false) }
  }, [])

  useEffect(() => { void carregar(primeiroDiaDoMes(), hojeIso(), 'DIA') }, [carregar])
  // A lista de OPs e conveniencia: se nao carregar, as datas continuam valendo.
  useEffect(() => { listarPeriodosDeOp().then(setOps).catch(() => setOps([])) }, [])

  function escolherOp(id: string) {
    setOpEscolhida(id)
    const op = ops.find(o => String(o.id) === id)
    if (!op) return
    const de = op.periodoInicio || op.dataPagamentoProgramada || inicio
    const ate = op.periodoFim || op.dataPagamentoProgramada || fim
    setInicio(de); setFim(ate)
    void carregar(de, ate, grao)
  }

  function trocarGrao(novo: 'DIA' | 'SEMANA' | 'MES') {
    setGrao(novo)
    void carregar(inicio, fim, novo)
  }

  async function exportar(formato: 'excel' | 'pdf') {
    setErro(''); setBaixando(formato)
    try {
      await baixarRelatorioPorto(formato, new URLSearchParams({ dataInicio: inicio, dataFim: fim }))
    } catch (e) { setErro((e as Error).message) }
    finally { setBaixando('') }
  }

  const vazio = Boolean(dados && !dados.quantidadeTotalServicos && !dados.quantidadeTotalOps)
  // Toda OP chega paga: programado e recebido sao o mesmo numero, e nao existe OP
  // vencida. O que ainda falta entrar sao os servicos feitos que nenhuma OP pagou.
  const aReceber = dados ? dados.valorAguardandoOp : 0
  const recebidoSobreProducao = dados && dados.valorTotalRealizado > 0
    ? (dados.valorRecebido / dados.valorTotalRealizado) * 100
    : null

  // Cada item so existe quando ha o que resolver, e leva para onde se resolve.
  const atencao = dados ? [
    dados.quantidadeComDivergencia > 0 && {
      chave: 'divergencia', grave: true,
      titulo: `${dados.quantidadeComDivergencia} ${dados.quantidadeComDivergencia === 1 ? 'OP com divergência' : 'OPs com divergência'}`,
      detalhe: `${moeda(dados.valorTotalDivergencias)} entre o valor da OP e a soma das OS`,
      acao: 'Ver ordens de pagamento', para: '/porto/ordens-pagamento',
    },
    dados.quantidadeAguardandoOp > 0 && {
      chave: 'aguardando', grave: false,
      titulo: `${dados.quantidadeAguardandoOp} ${dados.quantidadeAguardandoOp === 1 ? 'serviço aguardando OP' : 'serviços aguardando OP'}`,
      detalhe: `${moeda(dados.valorAguardandoOp)} ainda não cobrados pela Porto`,
      acao: 'Ver serviços', para: '/porto/ordens-servico',
    },
    dados.quantidadeServicosPendentes > 0 && {
      chave: 'pendentes', grave: false,
      titulo: `${dados.quantidadeServicosPendentes} ${dados.quantidadeServicosPendentes === 1 ? 'serviço pendente' : 'serviços pendentes'} na Porto`,
      detalhe: `${moeda(dados.valorServicosPendentes)} travados do lado deles`,
      acao: 'Ver pendências', para: '/porto/pendencias',
    },
  ].filter(Boolean) as { chave: string; grave: boolean; titulo: string; detalhe: string; acao: string; para: string }[]
    : []

  // Frases so aparecem quando o numero que as sustenta existe.
  const insights = dados ? [
    recebidoSobreProducao !== null && dados.valorRecebido > 0
      && `${percentual(Math.min(recebidoSobreProducao, 100))} da produção do período já foi paga pela Porto.`,
    dados.quantidadeAguardandoOp > 0
      && (aReceber > 0
        ? `${moeda(aReceber)} em serviços ainda aguardam entrar numa OP.`
        : `${dados.quantidadeAguardandoOp} ${dados.quantidadeAguardandoOp === 1 ? 'serviço aguarda' : 'serviços aguardam'} OP e ainda não têm preço.`),
    dados.quantidadeTotalOps > 0
      && `${dados.quantidadeTotalOps} ${dados.quantidadeTotalOps === 1 ? 'OP pagou' : 'OPs pagaram'} os serviços deste período.`,
    dados.quantidadeTotalServicos > 0 && dados.valorTotalRealizado > 0
      && `Ticket médio de ${moeda(dados.valorTotalRealizado / dados.quantidadeTotalServicos)} por serviço.`,
  ].filter(Boolean) as string[] : []

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
      <form className="destaque-periodo" onSubmit={e => { e.preventDefault(); void carregar(inicio, fim, grao) }}>
        <Selecao rotulo="Ordem de pagamento" vazio="Período personalizado" value={opEscolhida}
          onChange={e => escolherOp(e.target.value)}
          opcoes={ops.map(o => ({ valor: String(o.id), texto: rotuloOp(o) }))}/>
        <Campo rotulo="De">
          <input type="date" value={inicio} onChange={e => { setOpEscolhida(''); setInicio(e.target.value) }} required/>
        </Campo>
        <Campo rotulo="Até">
          <input type="date" value={fim} onChange={e => { setOpEscolhida(''); setFim(e.target.value) }} required/>
        </Campo>
        <button className="button button-ghost">Aplicar</button>
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
              </div>
              <div>
                <dt>A receber</dt>
                {/* Servico do painel do dia chega sem preco: 12 servicos somando
                    R$ 0,00 nao e "nada a receber", e "ainda nao se sabe quanto". */}
                <dd className={dados.quantidadeAguardandoOp ? 'destaque-falta' : ''}>
                  {dados.quantidadeAguardandoOp && !aReceber ? 'A precificar' : moeda(aReceber)}
                </dd>
                <small>{dados.quantidadeAguardandoOp
                  ? `${dados.quantidadeAguardandoOp} ${dados.quantidadeAguardandoOp === 1 ? 'serviço aguardando OP' : 'serviços aguardando OP'}`
                  : 'Nenhum serviço fora de OP'}</small>
              </div>
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
          apoio={`${moeda(dados.valorAguardandoOp)} sem cobrança`}/>
        <Indicador rotulo="OPs com divergência" valor={dados.quantidadeComDivergencia}
          tom={tom(dados.quantidadeComDivergencia, 'alerta')}
          apoio={dados.quantidadeComDivergencia ? moeda(dados.valorTotalDivergencias) : 'Composição confere'}/>
        <Indicador rotulo="Pendentes na Porto" valor={dados.quantidadeServicosPendentes}
          tom={tom(dados.quantidadeServicosPendentes, 'atencao')}
          apoio={dados.quantidadeServicosPendentes ? `${moeda(dados.valorServicosPendentes)} travados` : 'Nada travado do lado deles'}/>
      </GradeIndicadores>

      <Painel className="painel-atencao" etiqueta="Ação" titulo="Precisa de atenção">
        {atencao.length
          ? <ul>
              {atencao.map(item => <li key={item.chave} className={item.grave ? 'grave' : ''}>
                <span className="painel-atencao-marca" aria-hidden="true"/>
                <span><strong>{item.titulo}</strong><small>{item.detalhe}</small></span>
                <Link className="table-action" to={item.para}>{item.acao}</Link>
              </li>)}
            </ul>
          : <p className="painel-tudo-em-dia">
              <span aria-hidden="true">✓</span>
              <strong>Tudo em dia</strong>
              <small>Nenhuma pendência crítica encontrada neste período.</small>
            </p>}
      </Painel>

      <div className="painel-inferior">
        <Painel etiqueta="Caixa" titulo="Produção paga × aguardando OP">
          <ProporcaoPagamentos recebido={dados.valorRecebido} aguardando={aReceber}
            realizado={dados.valorTotalRealizado}/>
        </Painel>

        {insights.length
          ? <Painel className="painel-insights" etiqueta="Leitura" titulo="O que os números dizem">
              <ul>{insights.map(frase => <li key={frase}>{frase}</li>)}</ul>
            </Painel>
          : null}
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

/**
 * Onde esta o dinheiro da Porto, numa barra so.
 *
 * No modelo em que toda OP chega paga, o dinheiro da producao so tem dois
 * estados: ja entrou numa OP, e portanto esta pago, ou ainda esta esperando uma
 * OP. Nao ha "vencido" nem "programado nao recebido" — esses dois pedacos da
 * barra antiga nunca poderiam aparecer com dado real.
 */
function ProporcaoPagamentos({ recebido, aguardando, realizado }: {
  recebido: number; aguardando: number; realizado: number
}) {
  const total = Math.max(recebido + aguardando, 1)
  const fatia = (v: number) => `${Math.max((v / total) * 100, v > 0 ? 1.5 : 0)}%`

  return <div className="pagamentos-proporcao">
    <div className="pagamentos-trilho" role="img"
      aria-label={`${moeda(recebido)} pagos pela Porto e ${moeda(aguardando)} aguardando OP.`}>
      {recebido > 0 ? <span className="fatia-recebido" style={{ width: fatia(recebido) }}/> : null}
      {aguardando > 0 ? <span className="fatia-aguardando" style={{ width: fatia(aguardando) }}/> : null}
    </div>
    <dl>
      <div><dt><i className="fatia-recebido"/>Pago pela Porto</dt><dd>{moeda(recebido)}</dd></div>
      <div><dt><i className="fatia-aguardando"/>Aguardando OP</dt><dd>{moeda(aguardando)}</dd></div>
      <div><dt>Produção do período</dt><dd>{moeda(realizado)}</dd></div>
    </dl>
  </div>
}
