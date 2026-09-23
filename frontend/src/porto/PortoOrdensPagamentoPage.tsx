import { useEffect, useState, type FormEvent } from 'react'
import { GradeIndicadores, Indicador } from '../components/ui/Pagina'
import { atualizarOrdemPagamentoPorto, definirQuinzenaOp, baixarRelatorioOpPorto, baixarRelatorioPorto, confirmarImportacaoPorto, criarPreviaComposicaoPorto, criarOrdemPagamentoPorto, detalharOrdemPagamentoPorto, idDaOpPeloNumero, justificarOrdemPagamentoPorto, renomearOp, listarOrdensPagamentoPorto, resumirOrdensPagamentoPorto } from '../dados/porto'
import { Campo, Selecao } from '../components/Campos'
import type { DetalheOpPorto, OrdemPagamentoPorto, PreviaPorto, ResumoOpsPorto } from '../types/modelos'
import { data, moeda } from '../utils/formatadores'
import { ConfirmarAcao } from '../components/ConfirmarAcao'
import { FormularioOp } from './ops/FormularioOp'
import { ModalDetalheOp } from './ops/ModalDetalheOp'
import { TabelaOps } from './ops/TabelaOps'
import { CONCILIACAO } from './ops/opcoes'

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

type EnvioOp = {
  corpo: Record<string, unknown>
  quinzenaInicio: string
  quinzenaEntrega: string
  mudou: boolean
}

export default function PortoOrdensPagamentoPage() {
  const [itens, setItens] = useState<OrdemPagamentoPorto[]>([])
  const [resumo, setResumo] = useState<ResumoOpsPorto>(semResumo)
  const [detalhe, setDetalhe] = useState<DetalheOpPorto | null>(null)
  const [editando, setEditando] = useState<OrdemPagamentoPorto | null>(null)
  const [quinzenaPendente, setQuinzenaPendente] = useState<EnvioOp | null>(null)
  const [novaAberta, setNovaAberta] = useState(false)
  const [previaComposicao, setPreviaComposicao] = useState<PreviaPorto | null>(null)
  const [arquivoComposicao, setArquivoComposicao] = useState<File | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [parametros, setParametros] = useState(new URLSearchParams())
  const [baixando, setBaixando] = useState('')
  const [novoNumero, setNovoNumero] = useState<{ id: number; de: string; para: string } | null>(null)

  async function carregar(params: URLSearchParams) {
    setCarregando(true); setErro('')
    try {
      const [lista, total] = await Promise.all([
        listarOrdensPagamentoPorto(params), resumirOrdensPagamentoPorto(params),
      ])
      setItens(lista); setResumo(total); setParametros(new URLSearchParams(params))
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }

  useEffect(() => { void carregar(new URLSearchParams()) }, [])
  // Link de dado de outra tela (?numero=06438807): abre o detalhe daquela OP.
  useEffect(() => {
    const numero = new URLSearchParams(window.location.search).get('numero')
    if (!numero) return
    idDaOpPeloNumero(numero)
      .then(id => { if (id) void abrirDetalhe(id); else setErro(`A OP ${numero} não foi encontrada.`) })
      .catch((e: Error) => setErro(e.message))
  }, [])

  async function aplicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const campos = new FormData(evento.currentTarget), params = new URLSearchParams()
    for (const chave of FILTROS) {
      const valor = String(campos.get(chave) ?? '')
      if (valor) params.set(chave, valor)
    }
    await carregar(params)
  }


  async function abrirDetalhe(id: number) {
    setErro('')
    try {
      const resposta = await detalharOrdemPagamentoPorto(id)
      setDetalhe(resposta)
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
    const quinzenaInicio = String(campos.get('quinzenaInicio') ?? '')
    const quinzenaEntrega = String(campos.get('quinzenaEntrega') ?? '')
    if (Boolean(quinzenaInicio) !== Boolean(quinzenaEntrega)) {
      setErro('Informe a data de início e a data de entrega da OP, ou deixe as duas em branco.')
      return
    }
    const mudou = quinzenaInicio !== (editando?.quinzenaInicio ?? '')
      || quinzenaEntrega !== (editando?.quinzenaEntrega ?? '')
    const envio = { corpo, quinzenaInicio, quinzenaEntrega, mudou }
    // Mudar a quinzena move a data da receita, da conta a receber e da comissao
    // da OP: pede confirmacao antes. Sem mudanca de quinzena, salva direto.
    if (mudou) { setQuinzenaPendente(envio); return }
    await gravarOp(envio)
  }

  async function gravarOp({ corpo, quinzenaInicio, quinzenaEntrega, mudou }: EnvioOp) {
    try {
      const salva = editando
        ? await atualizarOrdemPagamentoPorto(editando.id, corpo)
        : await criarOrdemPagamentoPorto(corpo)
      if (mudou) await definirQuinzenaOp(salva.id, quinzenaInicio || null, quinzenaEntrega || null)
      if (editando) setEditando(null)
      else setNovaAberta(false)
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
    if (!detalhe || !previaComposicao) return
    const campos = new FormData(evento.currentTarget)
    const temDivergencia = previaComposicao.linhas.some(linha => linha.acao === 'DIVERGENCIA')
    try {
      await confirmarImportacaoPorto(previaComposicao, {
        numeroOrdemPagamento: detalhe.ordemPagamento.numero,
        confirmarDivergencias: temDivergencia,
        motivoDivergencia: String(campos.get('motivo') || '') || undefined,
        justificativaDivergencia: String(campos.get('justificativa') || '') || undefined,
      })
      setPreviaComposicao(null); setArquivoComposicao(null)
      setDetalhe(await detalharOrdemPagamentoPorto(detalhe.ordemPagamento.id))
      await carregar(parametros)
    } catch (e) { setErro((e as Error).message) }
  }


  return <div className="page-enter">
    <header className="page-heading">
      <div>
        <span className="eyebrow">Porto Seguro</span>
        <h1>Ordens de pagamento</h1>
        <p>Cada OP da Porto com os serviços dela e a conferência com a soma das OS. A OP já chega paga.</p>
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

    {/* Quatro numeros que dizem algo (Kawa, 23/09/2026: melhorar os cards). A OP
        chega paga, entao "recebidas", "aguardando recebimento" e "vencidas" so
        repetiam o total ou mostravam zero, e sairam. */}
    <GradeIndicadores>
      <Indicador rotulo="OPs" valor={resumo.quantidadeTotalOps.toLocaleString('pt-BR')}
        apoio={resumo.quantidadeTotalOps ? `${resumo.quantidadeOrdensServico.toLocaleString('pt-BR')} serviços pagos` : '—'}/>
      <Indicador rotulo="Valor das OPs" valor={moeda(resumo.valorTotalPrevisto)}
        apoio={resumo.quantidadeTotalOps ? `Média de ${moeda(resumo.valorMedioPorOp)} por OP` : '—'}/>
      <Indicador rotulo="Conferidas" valor={`${resumo.quantidadeConciliadas} de ${resumo.quantidadeTotalOps}`}
        apoio="Valor da OP igual à soma das OS"/>
      <Indicador rotulo="Com divergência" valor={resumo.quantidadeComDivergencia}
        tom={resumo.quantidadeComDivergencia ? 'alerta' : 'neutro'}
        apoio={resumo.quantidadeComDivergencia ? `${moeda(resumo.valorTotalDivergencias)} de diferença` : 'Nenhuma diferença'}/>
    </GradeIndicadores>

    <section className="panel">
      <form className="ledger-filters porto-op-filters" onSubmit={aplicar}>
        <Campo rotulo="Número da OP" className="filter-grow"><input name="numero" inputMode="numeric" autoComplete="off"/></Campo>
        <Campo rotulo="Data inicial"><input name="dataInicio" type="date"/></Campo>
        <Campo rotulo="Data final"><input name="dataFim" type="date"/></Campo>
        <Selecao rotulo="Conciliação" name="statusConciliacao" vazio="Todas" opcoes={CONCILIACAO}/>
        <button className="button button-primary" disabled={carregando}>Aplicar filtros</button>
      </form>
      <TabelaOps itens={itens} aoAbrirDetalhe={id => void abrirDetalhe(id)}/>
    </section>

    {novaAberta ? <FormularioOp aoEnviar={salvarOp} aoFechar={() => setNovaAberta(false)}/> : null}
    {quinzenaPendente
      ? <ConfirmarAcao
          titulo="Mudar a quinzena da OP?"
          efeito={quinzenaPendente.quinzenaInicio
            ? 'O período da OP passa a ser a quinzena informada. A receita, a conta a receber e a comissão desta OP passam a ser lançadas na data de entrega.'
            : 'A OP volta a ter o período calculado pelas datas dos serviços que ela trouxe.'}
          resumo={[
            ['OP', String(quinzenaPendente.corpo.numero)],
            ['Data início', quinzenaPendente.quinzenaInicio ? data(quinzenaPendente.quinzenaInicio) : 'Calculada pelas OS'],
            ['Data entrega', quinzenaPendente.quinzenaEntrega ? data(quinzenaPendente.quinzenaEntrega) : 'Calculada pelas OS'],
          ]}
          textoConfirmar="Salvar quinzena"
          aoConfirmar={() => gravarOp(quinzenaPendente)}
          aoFechar={() => setQuinzenaPendente(null)}/>
      : null}
    {novoNumero
      ? <ConfirmarAcao
          titulo="Trocar o número da OP?"
          efeito={<>A OP <strong>{novoNumero.de}</strong> passa a ser <strong>{novoNumero.para}</strong>. As comissões
            que ela lançou no Extrato passam a mostrar o número novo.</>}
          resumo={[['Número atual', novoNumero.de], ['Número novo', novoNumero.para]]}
          textoConfirmar="Trocar número"
          aoConfirmar={async () => {
            await renomearOp(novoNumero.id, novoNumero.para)
            setDetalhe(await detalharOrdemPagamentoPorto(novoNumero.id))
            await carregar(parametros)
          }}
          aoFechar={() => setNovoNumero(null)}/>
      : null}
    {editando ? <FormularioOp edicao={editando} aoEnviar={salvarOp} aoFechar={() => setEditando(null)}/> : null}
    {detalhe
      ? <ModalDetalheOp detalhe={detalhe} previa={previaComposicao}
          arquivoEscolhido={arquivoComposicao !== null} nomeArquivo={arquivoComposicao?.name}
          aoEscolherArquivo={setArquivoComposicao}
          aoAnalisar={() => void analisarComposicao()} aoConfirmarComposicao={confirmarComposicao}
          aoJustificar={justificar} aoExportar={formato => void exportarOp(formato)} baixando={baixando}
          aoEditar={() => { setEditando(detalhe.ordemPagamento); setDetalhe(null) }}
          aoRenomear={para => setNovoNumero({ id: detalhe.ordemPagamento.id, de: detalhe.ordemPagamento.numero, para })}
          aoFechar={() => { setDetalhe(null); setPreviaComposicao(null); setArquivoComposicao(null) }}/>
      : null}
  </div>
}
