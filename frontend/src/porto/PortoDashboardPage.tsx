import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { baixarRelatorioPorto, listarPeriodosDeOp, obterDashboardAltoNivelPorto } from '../dados/porto'
import type { DashboardAltoNivelPorto, OpDestaquePorto, OrdemPagamentoPorto } from '../types/modelos'
import { data, hojeIso, moeda, percentual } from '../utils/formatadores'
import { Carregando } from '../components/EstadoPagina'
import { Campo, Selecao } from '../components/Campos'
import { ProducaoXRecebimentos } from '../components/Graficos'
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
  const recebidoSobreProgramado = dados && dados.valorProgramado > 0
    ? (dados.valorRecebido / dados.valorProgramado) * 100
    : null
  const aReceber = dados ? dados.valorAguardandoRecebimento : 0

  // Cada item so existe quando ha o que resolver, e leva para onde se resolve.
  const atencao = dados ? [
    dados.quantidadeComDivergencia > 0 && {
      chave: 'divergencia', grave: true,
      titulo: `${dados.quantidadeComDivergencia} ${dados.quantidadeComDivergencia === 1 ? 'OP com divergência' : 'OPs com divergência'}`,
      detalhe: `${moeda(dados.valorTotalDivergencias)} entre o valor da OP e a soma das OS`,
      acao: 'Ver ordens de pagamento', para: '/porto/ordens-pagamento',
    },
    dados.quantidadeVencidasNaoRecebidas > 0 && {
      chave: 'vencidas', grave: true,
      titulo: `${dados.quantidadeVencidasNaoRecebidas} ${dados.quantidadeVencidasNaoRecebidas === 1 ? 'OP vencida' : 'OPs vencidas'}`,
      detalhe: `${moeda(dados.valorVencidoNaoRecebido)} que já deveriam ter entrado`,
      acao: 'Ver pagamentos', para: '/porto/ordens-pagamento',
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
    dados.quantidadeTotalOps > 0 && dados.quantidadeRecebidas > 0
      && `${percentual(dados.quantidadeRecebidas / dados.quantidadeTotalOps * 100)} das OPs do período já foram recebidas.`,
    aReceber > 0 && `${moeda(aReceber)} ainda aguardam recebimento.`,
    recebidoSobreProgramado !== null && dados.valorRecebido > 0
      && `Recebimentos representam ${percentual(recebidoSobreProgramado)} do valor programado.`,
    dados.quantidadeTotalServicos > 0 && dados.valorTotalRealizado > 0
      && `Ticket médio de ${moeda(dados.valorTotalRealizado / dados.quantidadeTotalServicos)} por serviço.`,
  ].filter(Boolean) as string[] : []

  return <div className="page-enter painel-porto">
    <CabecalhoPagina
      modulo="Porto Seguro"
      titulo="Dashboard Porto"
      descricao="Serviços realizados, pagamentos programados e valores efetivamente recebidos."
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

    <section className="panel painel-filtros">
      <form className="ledger-filters" onSubmit={e => { e.preventDefault(); void carregar(inicio, fim, grao) }}>
        <Selecao rotulo="Período" vazio="Personalizado" value={opEscolhida}
          onChange={e => escolherOp(e.target.value)}
          opcoes={ops.map(o => ({ valor: String(o.id), texto: rotuloOp(o) }))}/>
        <Campo rotulo="Data inicial">
          <input type="date" value={inicio} onChange={e => { setOpEscolhida(''); setInicio(e.target.value) }} required/>
        </Campo>
        <Campo rotulo="Data final">
          <input type="date" value={fim} onChange={e => { setOpEscolhida(''); setFim(e.target.value) }} required/>
        </Campo>
        <button className="button button-primary">Aplicar período</button>
      </form>
    </section>

    {carregando ? <Carregando/> : null}

    {dados && vazio && !carregando
      ? <section className="panel painel-vazio">
          <div className="empty-ledger" aria-hidden="true"/>
          <h2>Nenhum dado da Porto neste período</h2>
          <p>Importe um relatório da Porto ou escolha outro período para ver produção, pagamentos e recebimentos.</p>
          <Link className="button button-primary" to="/porto/importacoes">Importar relatório</Link>
        </section>
      : null}

    {dados && !vazio ? <>
      <section className="painel-financeiro" aria-label="Resumo financeiro">
        <article>
          <span>Realizado</span>
          <strong>{moeda(dados.valorTotalRealizado)}</strong>
          <small>{dados.quantidadeTotalServicos} serviços executados</small>
        </article>
        <article>
          <span>Programado</span>
          <strong>{moeda(dados.valorProgramado)}</strong>
          <small>{dados.quantidadePagamentoProgramado} {dados.quantidadePagamentoProgramado === 1 ? 'ordem de pagamento' : 'ordens de pagamento'}</small>
        </article>
        <article className="painel-financeiro-recebido">
          <span>Recebido</span>
          <strong>{moeda(dados.valorRecebido)}</strong>
          <small>
            {dados.quantidadeRecebidas} {dados.quantidadeRecebidas === 1 ? 'recebimento confirmado' : 'recebimentos confirmados'}
            {recebidoSobreProgramado !== null ? ` · ${percentual(recebidoSobreProgramado)} do programado` : ''}
          </small>
          {recebidoSobreProgramado !== null
            ? <span className="painel-progresso" aria-hidden="true">
                <i style={{ width: `${Math.min(recebidoSobreProgramado, 100)}%` }}/>
              </span>
            : null}
        </article>
      </section>

      <GradeIndicadores>
        <Indicador rotulo="Serviços realizados" valor={dados.quantidadeTotalServicos}
          apoio={`${moeda(dados.valorTotalRealizado)} no período`}/>
        <Indicador rotulo="Aguardando OP" valor={dados.quantidadeAguardandoOp}
          tom={tom(dados.quantidadeAguardandoOp, 'atencao')}
          apoio={`${moeda(dados.valorAguardandoOp)} sem cobrança`}/>
        <Indicador rotulo="OPs com divergência" valor={dados.quantidadeComDivergencia}
          tom={tom(dados.quantidadeComDivergencia, 'alerta')}
          apoio={dados.quantidadeComDivergencia ? moeda(dados.valorTotalDivergencias) : 'Composição confere'}/>
        <Indicador rotulo="OPs vencidas" valor={dados.quantidadeVencidasNaoRecebidas}
          tom={tom(dados.quantidadeVencidasNaoRecebidas, 'alerta')}
          apoio={dados.quantidadeVencidasNaoRecebidas ? moeda(dados.valorVencidoNaoRecebido) : 'Nenhum pagamento atrasado'}/>
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

      <Painel className="painel-evolucao" etiqueta="Evolução" titulo="Produção × Recebimentos"
        aoLado={<div className="segmented" role="group" aria-label="Agrupamento do gráfico">
          {GRAOS.map(g => <button key={g.valor} type="button"
            className={grao === g.valor ? 'active' : ''}
            onClick={() => trocarGrao(g.valor as 'DIA' | 'SEMANA' | 'MES')}>{g.texto}</button>)}
        </div>}>
        <ProducaoXRecebimentos pontos={dados.serie} rotulo={rotuloDoBalde(grao)}/>
      </Painel>

      <div className="painel-inferior">
        <Painel etiqueta="Caixa" titulo="Situação dos pagamentos">
          <ProporcaoPagamentos recebido={dados.valorRecebido} aguardando={aReceber}
            vencido={dados.valorVencidoNaoRecebido} programado={dados.valorProgramado}/>
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
                <td><strong>{op.numero}</strong>{op.vencida ? <small className="painel-vencida">Vencida</small> : null}</td>
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
 * Recebido, aguardando e vencido somam o que foi programado. Ler as tres partes
 * lado a lado responde "quanto ainda tenho para receber e quanto ja atrasou" sem
 * precisar comparar tres numeros soltos.
 */
function ProporcaoPagamentos({ recebido, aguardando, vencido, programado }: {
  recebido: number; aguardando: number; vencido: number; programado: number
}) {
  const total = Math.max(recebido + aguardando, programado, 1)
  const fatia = (v: number) => `${Math.max((v / total) * 100, v > 0 ? 1.5 : 0)}%`
  const emDia = Math.max(aguardando - vencido, 0)

  return <div className="pagamentos-proporcao">
    <div className="pagamentos-trilho" role="img"
      aria-label={`${moeda(recebido)} recebidos, ${moeda(emDia)} a receber, ${moeda(vencido)} vencidos.`}>
      {recebido > 0 ? <span className="fatia-recebido" style={{ width: fatia(recebido) }}/> : null}
      {emDia > 0 ? <span className="fatia-aguardando" style={{ width: fatia(emDia) }}/> : null}
      {vencido > 0 ? <span className="fatia-vencido" style={{ width: fatia(vencido) }}/> : null}
    </div>
    <dl>
      <div><dt><i className="fatia-recebido"/>Recebido</dt><dd>{moeda(recebido)}</dd></div>
      <div><dt><i className="fatia-aguardando"/>A receber</dt><dd>{moeda(emDia)}</dd></div>
      <div><dt><i className="fatia-vencido"/>Vencido</dt><dd className={vencido > 0 ? 'negative' : ''}>{moeda(vencido)}</dd></div>
      <div><dt>Programado</dt><dd>{moeda(programado)}</dd></div>
    </dl>
  </div>
}
