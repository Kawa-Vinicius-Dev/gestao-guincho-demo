import { useEffect, useState, type FormEvent } from 'react'
import { atualizarOrdemPagamentoPorto, baixarRelatorioOpPorto, baixarRelatorioPorto, confirmarImportacaoPorto, criarPreviaComposicaoPorto, criarOrdemPagamentoPorto, detalharOrdemPagamentoPorto, justificarOrdemPagamentoPorto, listarCalendarioPorto, listarOrdensPagamentoPorto, receberOrdemPagamentoPorto, resumirOrdensPagamentoPorto } from '../dados/porto'
import { Campo, Selecao } from '../components/Campos'
import type { CalendarioPorto, DetalheOpPorto, OrdemPagamentoPorto, PreviaPorto, ResumoOpsPorto } from '../types/modelos'
import { moeda } from '../utils/formatadores'
import { FormularioOp } from './ops/FormularioOp'
import { ModalDetalheOp } from './ops/ModalDetalheOp'
import { ModalRecebimento } from './ops/ModalRecebimento'
import { TabelaOps } from './ops/TabelaOps'
import { CONCILIACAO, RECEBIMENTO, data } from './ops/opcoes'

const semResumo: ResumoOpsPorto = {
  quantidadeTotalOps: 0, valorTotalPrevisto: 0, quantidadeSemComposicao: 0, valorSemComposicao: 0,
  quantidadeConciliadas: 0, valorConciliadas: 0, quantidadeValorAbaixo: 0, diferencaTotalAbaixo: 0,
  quantidadeValorAcima: 0, diferencaTotalAcima: 0, quantidadeComDivergencia: 0, valorTotalDivergencias: 0,
  quantidadePagamentoProgramado: 0, valorProgramado: 0, quantidadeRecebidas: 0, valorRecebido: 0,
  quantidadeAguardandoRecebimento: 0, valorAguardandoRecebimento: 0, quantidadeVencidasNaoRecebidas: 0,
  valorVencidoNaoRecebido: 0, valorMedioPorOp: 0, quantidadeOrdensServico: 0,
}

/** Os campos de filtro que a tela manda para a API, na ordem em que aparecem. */
const FILTROS = ['numero', 'calendarioPagamentoId', 'dataInicio', 'dataFim', 'situacaoPagamento',
  'statusConciliacao', 'recebida', 'vencida', 'comComposicao', 'comDivergencia'] as const

export default function PortoOrdensPagamentoPage() {
  const [itens, setItens] = useState<OrdemPagamentoPorto[]>([])
  const [resumo, setResumo] = useState<ResumoOpsPorto>(semResumo)
  const [periodos, setPeriodos] = useState<CalendarioPorto[]>([])
  const [recebimento, setRecebimento] = useState<OrdemPagamentoPorto | null>(null)
  const [detalhe, setDetalhe] = useState<DetalheOpPorto | null>(null)
  const [editando, setEditando] = useState<OrdemPagamentoPorto | null>(null)
  const [novaAberta, setNovaAberta] = useState(false)
  const [previaComposicao, setPreviaComposicao] = useState<PreviaPorto | null>(null)
  const [arquivoComposicao, setArquivoComposicao] = useState<File | null>(null)
  const [periodoComposicao, setPeriodoComposicao] = useState(0)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [parametros, setParametros] = useState(new URLSearchParams())
  const [baixando, setBaixando] = useState('')

  async function carregar(params: URLSearchParams) {
    setCarregando(true); setErro('')
    try {
      const [lista, total] = await Promise.all([
        listarOrdensPagamentoPorto(params), resumirOrdensPagamentoPorto(params),
      ])
      setItens(lista); setResumo(total); setParametros(new URLSearchParams(params))
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }

  useEffect(() => {
    void carregar(new URLSearchParams())
    listarCalendarioPorto().then(setPeriodos).catch(e => setErro(e.message))
  }, [])

  useEffect(() => {
    if (recebimento) setPeriodoComposicao(recebimento.calendarioPagamentoId ?? 0)
  }, [recebimento])

  async function aplicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const campos = new FormData(evento.currentTarget), params = new URLSearchParams()
    for (const chave of FILTROS) {
      const valor = String(campos.get(chave) ?? '')
      if (valor) params.set(chave, valor)
    }
    await carregar(params)
  }

  async function receber(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!recebimento) return
    const campos = new FormData(evento.currentTarget)
    try {
      await receberOrdemPagamentoPorto(recebimento.id, Number(campos.get('valor')),
        String(campos.get('data')), periodoComposicao || undefined)
      setRecebimento(null)
      await carregar(parametros)
    } catch (e) { setErro((e as Error).message) }
  }

  async function abrirDetalhe(id: number) {
    setErro('')
    try {
      const resposta = await detalharOrdemPagamentoPorto(id)
      setDetalhe(resposta)
      setPeriodoComposicao(resposta.ordemPagamento.calendarioPagamentoId ?? 0)
    } catch (e) { setErro((e as Error).message) }
  }

  async function justificar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!detalhe) return
    const formulario = evento.currentTarget, campos = new FormData(formulario)
    try {
      await justificarOrdemPagamentoPorto(detalhe.ordemPagamento.id,
        String(campos.get('motivo')), String(campos.get('observacao')))
      setDetalhe(await detalharOrdemPagamentoPorto(detalhe.ordemPagamento.id))
      formulario.reset()
    } catch (e) { setErro((e as Error).message) }
  }

  /** Cadastro e edicao compartilham o formulario, entao compartilham o envio. */
  async function salvarOp(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const campos = new FormData(evento.currentTarget)
    const corpo = {
      numero: String(campos.get('numero')),
      dataPrevista: String(campos.get('dataPrevista')),
      valorInformado: Number(campos.get('valorInformado')),
      statusPorto: String(campos.get('statusPorto')),
      situacaoFinanceira: String(campos.get('situacaoFinanceira')),
      pagamentoConfirmado: false,
      observacao: String(campos.get('observacao') ?? ''),
    }
    try {
      if (editando) { await atualizarOrdemPagamentoPorto(editando.id, corpo); setEditando(null) }
      else { await criarOrdemPagamentoPorto(corpo); setNovaAberta(false) }
      await carregar(parametros)
    } catch (e) { setErro((e as Error).message) }
  }

  async function exportar(formato: 'excel' | 'pdf') {
    setErro(''); setBaixando(formato)
    try { await baixarRelatorioPorto(formato, parametros) }
    catch (e) { setErro((e as Error).message) } finally { setBaixando('') }
  }

  async function exportarOp(formato: 'excel' | 'pdf') {
    if (!detalhe) return
    setErro(''); setBaixando('op-' + formato)
    try { await baixarRelatorioOpPorto(detalhe.ordemPagamento.id, formato) }
    catch (e) { setErro((e as Error).message) } finally { setBaixando('') }
  }

  async function analisarComposicao() {
    if (!detalhe || !arquivoComposicao) return
    try { setPreviaComposicao(await criarPreviaComposicaoPorto(detalhe.ordemPagamento, arquivoComposicao)) }
    catch (e) { setErro((e as Error).message) }
  }

  async function confirmarComposicao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!detalhe || !previaComposicao || !periodoComposicao) return
    const campos = new FormData(evento.currentTarget)
    const temDivergencia = previaComposicao.linhas.some(linha => linha.acao === 'DIVERGENCIA')
    try {
      await confirmarImportacaoPorto(previaComposicao, {
        numeroOrdemPagamento: detalhe.ordemPagamento.numero,
        calendarioPagamentoId: periodoComposicao,
        confirmarDivergencias: temDivergencia,
        motivoDivergencia: String(campos.get('motivo') || '') || undefined,
        justificativaDivergencia: String(campos.get('justificativa') || '') || undefined,
      })
      setPreviaComposicao(null); setArquivoComposicao(null)
      setDetalhe(await detalharOrdemPagamentoPorto(detalhe.ordemPagamento.id))
      await carregar(parametros)
    } catch (e) { setErro((e as Error).message) }
  }

  const cartoes: Array<[string, string]> = [
    ['Total de OPs', String(resumo.quantidadeTotalOps)],
    ['Valor total previsto', moeda(resumo.valorTotalPrevisto)],
    ['OPs conciliadas', String(resumo.quantidadeConciliadas)],
    ['OPs com divergência', String(resumo.quantidadeComDivergencia)],
    ['OPs recebidas', String(resumo.quantidadeRecebidas)],
    ['OPs aguardando recebimento', String(resumo.quantidadeAguardandoRecebimento)],
    ['OPs vencidas', String(resumo.quantidadeVencidasNaoRecebidas)],
    ['Valor médio por OP', moeda(resumo.valorMedioPorOp)],
  ]

  return <div className="page-enter">
    <header className="page-heading">
      <div>
        <span className="eyebrow">Porto Seguro</span>
        <h1>Ordens de pagamento</h1>
        <p>Conciliação por OP, programações e recebimentos confirmados manualmente.</p>
      </div>
      <div className="heading-actions">
        <button className="button button-ghost" disabled={baixando !== ''} onClick={() => void exportar('pdf')}>
          {baixando === 'pdf' ? 'Gerando PDF…' : 'Exportar PDF'}
        </button>
        <button className="button button-ghost" disabled={baixando !== ''} onClick={() => void exportar('excel')}>
          {baixando === 'excel' ? 'Gerando Excel…' : 'Exportar Excel'}
        </button>
        <button className="button button-primary" onClick={() => setNovaAberta(true)}>
          + Nova ordem de pagamento
        </button>
      </div>
    </header>

    {erro ? <div className="form-alert">{erro}</div> : null}

    <section className="metric-grid porto-op-metrics">
      {cartoes.map(([titulo, valor]) => <article className="metric" key={titulo}>
        <span>{titulo}</span><strong>{valor}</strong>
      </article>)}
    </section>

    <section className="panel">
      <form className="ledger-filters porto-op-filters" onSubmit={aplicar}>
        <Campo rotulo="Número da OP" className="filter-grow"><input name="numero"/></Campo>
        <Selecao rotulo="Quinzena" name="calendarioPagamentoId" vazio="Todas"
          opcoes={periodos.map(p => ({
            valor: p.id,
            texto: p.competenciaInicio && p.competenciaFim
              ? `${data(p.competenciaInicio)} a ${data(p.competenciaFim)}` : p.descricao,
          }))}/>
        <Campo rotulo="Data inicial"><input name="dataInicio" type="date"/></Campo>
        <Campo rotulo="Data final"><input name="dataFim" type="date"/></Campo>
        <Selecao rotulo="Recebimento" name="recebida" vazio="Todos" opcoes={RECEBIMENTO}/>
        <Selecao rotulo="Conciliação" name="statusConciliacao" vazio="Todas" opcoes={CONCILIACAO}/>
        <button className="button button-primary" disabled={carregando}>Aplicar filtros</button>
      </form>
      <TabelaOps itens={itens} aoAbrirDetalhe={id => void abrirDetalhe(id)} aoReceber={setRecebimento}/>
    </section>

    {novaAberta ? <FormularioOp aoEnviar={salvarOp} aoFechar={() => setNovaAberta(false)}/> : null}
    {editando ? <FormularioOp edicao={editando} aoEnviar={salvarOp} aoFechar={() => setEditando(null)}/> : null}
    {recebimento
      ? <ModalRecebimento ordem={recebimento} periodos={periodos} periodo={periodoComposicao}
          aoTrocarPeriodo={setPeriodoComposicao} aoEnviar={receber} aoFechar={() => setRecebimento(null)}/>
      : null}
    {detalhe
      ? <ModalDetalheOp detalhe={detalhe} periodos={periodos} periodo={periodoComposicao}
          aoTrocarPeriodo={setPeriodoComposicao} previa={previaComposicao}
          arquivoEscolhido={arquivoComposicao !== null} nomeArquivo={arquivoComposicao?.name}
          aoEscolherArquivo={setArquivoComposicao}
          aoAnalisar={() => void analisarComposicao()} aoConfirmarComposicao={confirmarComposicao}
          aoJustificar={justificar} aoExportar={formato => void exportarOp(formato)} baixando={baixando}
          aoEditar={() => { setEditando(detalhe.ordemPagamento); setDetalhe(null) }}
          aoFechar={() => { setDetalhe(null); setPreviaComposicao(null) }}/>
      : null}
  </div>
}
