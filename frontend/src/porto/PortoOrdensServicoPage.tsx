import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAoVivo } from '../dados/aoVivo'
import { baixarRelatorio, type Relatorio } from '../dados/exportar'
import { listarMotoristas } from '../dados/motoristas'
import { corrigirOs, definirViaturaEmLote, informarValorManual, listarOs, listarTodasAsOs, TAMANHO_DA_PAGINA, type FiltroOs, type LinhaOs, type PaginaOs, type SituacaoDaOs, type SituacaoOs } from '../dados/porto/listaOs'
import { listarVeiculos } from '../dados/veiculos'
import { INICIO_DO_HISTORICO } from '../dados/porto/diario'
import { Campo, Selecao } from '../components/Campos'
import { Carregando } from '../components/EstadoPagina'
import { CampoValor } from '../components/CampoValor'
import { Modal } from '../components/Modal'
import { ConfirmarAcao, type PedidoConfirmacao } from '../components/ConfirmarAcao'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { CabecalhoPagina, GradeIndicadores, Indicador, Painel } from '../components/ui/Pagina'
import type { Motorista, Veiculo } from '../types/modelos'
import { data, moeda } from '../utils/formatadores'
import { usePeriodoGlobal } from '../utils/periodoGlobal'
import { useValorAdiado } from '../utils/useValorAdiado'

/**
 * Ordens de servico.
 *
 * Todas as OS do periodo, com filtros que o banco aplica de verdade, totais do
 * que esta filtrado e a correcao de socorrista e viatura na propria linha (a
 * comissao se recalcula). Valor e OP nao se editam: vem da Porto.
 */
const SITUACOES = [
  { valor: 'PAGA', texto: 'Paga numa OP' },
  { valor: 'AGUARDANDO', texto: 'Aguardando OP' },
  { valor: 'AGUARDANDO_ANALISE', texto: 'Sem valor' },
  { valor: 'VALOR_MANUAL', texto: 'Com valor informado' },
  { valor: 'AGUARDANDO_PROXIMA_OP', texto: 'Aguardando próxima OP' },
  { valor: 'CONCILIADA', texto: 'Conciliada com a OP' },
  { valor: 'DIVERGENTE', texto: 'Valor divergente' },
]

/** Como cada situacao aparece na linha. */
const ETIQUETAS: Record<SituacaoDaOs, { texto: string; classe: string }> = {
  AGUARDANDO_ANALISE: { texto: 'Sem valor', classe: 'status-pendente' },
  VALOR_MANUAL: { texto: 'Valor informado', classe: 'status-prevista' },
  AGUARDANDO_PROXIMA_OP: { texto: 'Aguardando próxima OP', classe: 'status-pendente' },
  CONCILIADA: { texto: 'Conciliada', classe: 'status-recebido' },
  DIVERGENTE: { texto: 'Valor divergente', classe: 'status-erro_leitura' },
}

const competenciaDe = (os: LinhaOs) => (os.competenciaInicio && os.competenciaFim
  ? `${data(os.competenciaInicio)} a ${data(os.competenciaFim)}` : '—')

const siglaDe = (v: Veiculo) => (v.siglaPorto || v.identificacao).toUpperCase()

export default function PortoOrdensServicoPage() {
  const [periodo, setPeriodo] = usePeriodoGlobal()
  // Aviso de importacao e card de dashboard linkam uma OS especifica: ela abre
  // aqui filtrada, mesmo que seja de outro periodo.
  const [busca] = useSearchParams()
  const [numeroOs, setNumeroOs] = useState(() => busca.get('os') ?? '')
  const [numeroOp, setNumeroOp] = useState('')
  const [especialidade, setEspecialidade] = useState('')
  const [motoristaId, setMotoristaId] = useState(0)
  const [sigla, setSigla] = useState('')
  const [situacao, setSituacao] = useState<SituacaoOs>(() => (busca.get('situacao') ?? '') as SituacaoOs)
  const [semViatura, setSemViatura] = useState(false)
  const [porCompetencia, setPorCompetencia] = useState(() => busca.get('competencia') === '1')
  const [informando, setInformando] = useState<LinhaOs | null>(null)
  const [emLote, setEmLote] = useState(false)
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)
  const [pagina, setPagina] = useState(0)
  const [dados, setDados] = useState<PaginaOs | null>(null)
  const [motoristas, setMotoristas] = useState<Motorista[]>([])
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [exportando, setExportando] = useState('')
  const [corrigindo, setCorrigindo] = useState<LinhaOs | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [versao, setVersao] = useState(0)
  useAoVivo(() => setVersao(v => v + 1))

  // Texto digitado espera a pessoa parar de digitar antes de consultar.
  const numeroOsAdiado = useValorAdiado(numeroOs)
  const numeroOpAdiado = useValorAdiado(numeroOp)
  const especialidadeAdiada = useValorAdiado(especialidade)

  // Procurar por numero de OS vale para todo o historico: o numero ja aponta
  // uma OS so, e nao adianta encontrar "nada" porque ela e de outra quinzena.
  const buscandoNumero = Boolean(numeroOsAdiado.trim())
  const hoje = new Date().toISOString().slice(0, 10)
  const filtro: FiltroOs = useMemo(() => ({
    inicio: buscandoNumero ? INICIO_DO_HISTORICO : periodo.inicio,
    fim: buscandoNumero ? (hoje > periodo.fim ? hoje : periodo.fim) : periodo.fim,
    numeroOs: numeroOsAdiado, numeroOp: numeroOpAdiado,
    especialidade: especialidadeAdiada, motoristaId, sigla, situacao, semViatura, porCompetencia,
  }), [buscandoNumero, hoje, periodo.inicio, periodo.fim, numeroOsAdiado, numeroOpAdiado, especialidadeAdiada, motoristaId, sigla, situacao, semViatura, porCompetencia])

  // Filtro novo volta para a primeira pagina.
  useEffect(() => { setPagina(0) }, [filtro])

  useEffect(() => {
    if (!filtro.inicio || !filtro.fim || filtro.inicio > filtro.fim) return
    let valeu = true
    setCarregando(true); setErro('')
    listarOs(filtro, pagina)
      .then(r => { if (valeu) setDados(r) })
      .catch(e => { if (valeu) setErro((e as Error).message) })
      .finally(() => { if (valeu) setCarregando(false) })
    return () => { valeu = false }
  }, [filtro, pagina, versao])

  useEffect(() => {
    listarMotoristas().then(setMotoristas).catch(() => setMotoristas([]))
    listarVeiculos().then(setVeiculos).catch(() => setVeiculos([]))
  }, [])

  const paginas = dados ? Math.max(1, Math.ceil(dados.total / TAMANHO_DA_PAGINA)) : 1
  const temFiltro = Boolean(numeroOs || numeroOp || especialidade || motoristaId || sigla || situacao || semViatura || porCompetencia)
  const veiculoPorSigla = useMemo(() => new Map(veiculos.map(v => [siglaDe(v), v])), [veiculos])

  function limparFiltros() {
    setNumeroOs(''); setNumeroOp(''); setEspecialidade(''); setMotoristaId(0); setSigla(''); setSituacao(''); setSemViatura(false); setPorCompetencia(false)
  }

  async function exportar(formato: 'excel' | 'pdf') {
    setExportando(formato); setErro('')
    try {
      const todas = await listarTodasAsOs(filtro)
      const relatorio: Relatorio = {
        titulo: 'Ordens de serviço',
        subtitulo: `Período: ${data(filtro.inicio)} a ${data(filtro.fim)}`,
        resumo: [
          ['Ordens de serviço', String(todas.total)],
          ['Valor total', moeda(todas.valorTotal)],
          ['Comissão (OS pagas)', moeda(todas.comissaoTotal)],
        ],
        secoes: [{
        colunas: [
          { titulo: 'OS', largura: 16 }, { titulo: 'Atendimento', tipo: 'data', largura: 13 },
          { titulo: 'Especialidade', largura: 20 }, { titulo: 'Socorrista', largura: 32 },
          { titulo: 'Viatura', largura: 11 }, { titulo: 'OP', largura: 12 },
          { titulo: 'Valor', tipo: 'moeda', largura: 14 }, { titulo: 'Comissão', tipo: 'moeda', largura: 14 },
        ],
        linhas: todas.itens.map(os => [os.numero, os.dataAtendimento, os.especialidade, os.motorista,
          os.viatura, os.numeroOp ?? 'Aguardando OP', os.valorTotal, os.comissao]),
        totais: ['Total', null, null, null, null, null, todas.valorTotal, todas.comissaoTotal],
        vazio: 'Nenhuma OS com esses filtros.',
        }],
        nomeArquivo: `ordens-de-servico-${filtro.inicio}-a-${filtro.fim}`,
      }
      await baixarRelatorio(relatorio, formato)
    } catch (e) { setErro((e as Error).message) }
    finally { setExportando('') }
  }

  // Viatura em lote: escolhe a viatura, confirma com a quantidade, aplica.
  function pedirViaturaEmLote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!dados) return
    const f = new FormData(e.currentTarget)
    const nova = String(f.get('sigla') || '')
    const soSem = f.get('soSemViatura') === 'on'
    const afetadas = soSem ? dados.semViatura : dados.total
    const quem = motoristas.find(m => m.id === motoristaId)?.nome
    setEmLote(false)
    setPedido({
      titulo: `Definir a viatura ${nova}?`,
      efeito: <><strong>{afetadas}</strong> {afetadas === 1 ? 'ordem de serviço fica' : 'ordens de serviço ficam'} com a viatura <strong>{nova}</strong> e {afetadas === 1 ? 'entra' : 'entram'} no faturamento dela.{soSem ? ' As que já têm viatura não mudam.' : ' Inclusive as que já tinham outra viatura.'}</>,
      resumo: [
        ['Período', `${data(filtro.inicio)} a ${data(filtro.fim)}`],
        ...(quem ? [['Socorrista', quem] as [string, string]] : []),
        ['Ordens de serviço', String(afetadas)],
        ['Viatura', nova],
      ],
      avisos: [!soSem && dados.total > dados.semViatura ? `${dados.total - dados.semViatura} OS que já têm viatura serão trocadas.` : null],
      textoConfirmar: 'Definir viatura',
      perigo: !soSem,
      aoConfirmar: async () => {
        const total = await definirViaturaEmLote(filtro, nova, soSem)
        setMensagem(`Viatura ${nova} definida em ${total} ${total === 1 ? 'ordem de serviço' : 'ordens de serviço'}.`)
        setVersao(v => v + 1)
      },
    })
  }

  /**
   * Valor informado a mao.
   *
   * Kawa consegue consultar na Porto o valor de uma OS antes da OP sair. Esse
   * valor entra como previsto — nao vira receita e nao gera comissao, porque
   * quem paga e a OP. Por mexer em dinheiro na tela, pergunta antes.
   */
  function pedirValorManual(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!informando) return
    const os = informando
    // O campo de dinheiro envia numero cru ("1480.90"); zero quer dizer apagar.
    const bruto = Number(String(new FormData(e.currentTarget).get('valor') ?? '').trim())
    const valor = Number.isFinite(bruto) && bruto > 0 ? bruto : null
    setInformando(null)
    setPedido({
      titulo: valor === null ? `Apagar o valor informado da OS ${os.numero}?` : `Informar ${moeda(valor)} na OS ${os.numero}?`,
      efeito: valor === null
        ? <>A OS volta a ficar <strong>sem valor</strong>, aguardando a análise da Porto.</>
        : <>O valor entra como <strong>previsto</strong>: aparece nos totais marcado como informado, <strong>não vira receita e não gera comissão</strong>. Quando a OP chegar, o valor dela substitui este e a diferença fica visível.</>,
      resumo: [
        ['Ordem de serviço', os.numero],
        ['Atendimento', os.dataAtendimento ? data(os.dataAtendimento) : '—'],
        ['Socorrista', os.motorista ?? '—'],
        ['Valor', valor === null ? 'Nenhum' : moeda(valor)],
      ],
      textoConfirmar: valor === null ? 'Apagar valor' : 'Informar valor',
      perigo: valor === null,
      aoConfirmar: async () => {
        await informarValorManual(os.id, valor)
        setMensagem(valor === null
          ? `Valor da OS ${os.numero} apagado.`
          : `OS ${os.numero} com ${moeda(valor)} informado, aguardando a OP.`)
        setVersao(v => v + 1)
      },
    })
  }

  async function salvarCorrecao(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!corrigindo) return
    const f = new FormData(e.currentTarget)
    const novoMotorista = Number(f.get('motoristaId')) || undefined
    const novaSigla = String(f.get('sigla') || '') || undefined
    setSalvando(true); setErro(''); setMensagem('')
    try {
      await corrigirOs(corrigindo.id, {
        motoristaId: novoMotorista !== corrigindo.motoristaId ? novoMotorista : undefined,
        sigla: novaSigla && novaSigla !== corrigindo.viatura?.toUpperCase() ? novaSigla : undefined,
      })
      setMensagem(`OS ${corrigindo.numero} corrigida. A comissão foi recalculada.`)
      setCorrigindo(null); setVersao(v => v + 1)
    } catch (x) { setErro((x as Error).message) }
    finally { setSalvando(false) }
  }

  return <div className="page-enter">
    <CabecalhoPagina
      modulo="Porto Seguro"
      titulo="Ordens de serviço"
      descricao="Todas as OS do período. Corrija socorrista e viatura na linha; valor e OP vêm da Porto."
      contexto={<>Período: <strong>{data(periodo.inicio)}</strong> → <strong>{data(periodo.fim)}</strong></>}
      acoes={<>
        <button className="button button-ghost" disabled={!dados?.total} onClick={() => setEmLote(true)}>Definir viatura das OS filtradas</button>
        <button className="button button-ghost" disabled={exportando !== '' || !dados?.total} onClick={() => void exportar('pdf')}>
          {exportando === 'pdf' ? 'Gerando PDF…' : 'Exportar PDF'}
        </button>
        <button className="button button-primary" disabled={exportando !== '' || !dados?.total} onClick={() => void exportar('excel')}>
          {exportando === 'excel' ? 'Gerando Excel…' : 'Exportar Excel'}
        </button>
      </>}/>

    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
    {mensagem ? <div className="success-notice">{mensagem}</div> : null}

    <Painel className="painel-filtros">
      <form className="ledger-filters" onSubmit={e => e.preventDefault()}>
        <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/>
        <Campo rotulo="Número da OS" ajuda={buscandoNumero ? "Busca por número procura em todo o histórico." : undefined}><input value={numeroOs} onChange={e => setNumeroOs(e.target.value)} autoCorrect="off" spellCheck={false} autoComplete="off"/></Campo>
        <Campo rotulo="Número da OP"><input value={numeroOp} onChange={e => setNumeroOp(e.target.value)} inputMode="numeric" autoComplete="off"/></Campo>
        <Selecao rotulo="Socorrista" vazio="Todos" value={motoristaId || ''} onChange={e => setMotoristaId(Number(e.target.value))}
          opcoes={motoristas.map(m => ({ valor: m.id, texto: m.nome }))}/>
        <Selecao rotulo="Viatura" vazio="Todas" value={sigla} onChange={e => setSigla(e.target.value)}
          opcoes={veiculos.map(v => ({ valor: siglaDe(v), texto: v.identificacao }))}/>
        <Campo rotulo="Especialidade"><input value={especialidade} onChange={e => setEspecialidade(e.target.value)} autoComplete="off"/></Campo>
        <Selecao rotulo="Situação" vazio="Todas" value={situacao} onChange={e => setSituacao(e.target.value as SituacaoOs)} opcoes={SITUACOES}/>
        <label className="check-field"><input type="checkbox" checked={semViatura} onChange={e => setSemViatura(e.target.checked)}/><span>Só sem viatura</span></label>
        {/* A data do servico nunca muda; a competencia e a da OP que vai pagar. */}
        <label className="check-field"><input type="checkbox" checked={porCompetencia} onChange={e => setPorCompetencia(e.target.checked)}/><span>Filtrar por competência, não pela data do serviço</span></label>
        {temFiltro ? <button type="button" className="button button-ghost" onClick={limparFiltros}>Limpar filtros</button> : null}
      </form>
    </Painel>

    <GradeIndicadores>
      <Indicador rotulo="Ordens de serviço" valor={dados ? dados.total.toLocaleString('pt-BR') : '—'}
        apoio={temFiltro ? 'Com os filtros aplicados' : 'Todas do período'}/>
      <Indicador rotulo="Valor previsto" valor={dados ? moeda(dados.valorPrevisto) : '—'}
        apoio={dados && dados.valorPrevisto !== dados.valorTotal ? `${moeda(dados.valorTotal)} já pagos pela OP` : 'Oficial da OP mais o informado'}/>
      <Indicador rotulo="Sem valor" valor={dados ? dados.semValor.toLocaleString('pt-BR') : '—'}
        apoio={dados?.semValor ? 'Aguardando a análise da Porto' : 'Todas com valor'}/>
      <Indicador rotulo="Comissão" valor={dados ? moeda(dados.comissaoTotal) : '—'} apoio="20% das OS já pagas numa OP"/>
    </GradeIndicadores>

    <Painel semRespiro>
      {carregando && !dados ? <Carregando/> : null}
      {dados && !dados.itens.length
        ? <p className="empty-inline">{temFiltro ? 'Nenhuma OS com esses filtros neste período.' : 'Nenhuma OS neste período. Importe uma OP ou o painel diário.'}</p>
        : dados ? <div className="table-scroll"><table aria-label="Ordens de serviço">
          <thead><tr>
            <th>OS</th><th>Atendimento</th><th>Competência</th><th>Especialidade</th><th>Socorrista</th><th>Viatura</th>
            <th>OP</th><th>Situação</th><th>Valor</th><th>Comissão</th><th/>
          </tr></thead>
          <tbody>{dados.itens.map(os => {
            const veiculo = os.viatura ? veiculoPorSigla.get(os.viatura.toUpperCase()) : undefined
            return <tr key={os.id}>
              <td><strong>{os.numero}</strong></td>
              <td>{os.dataAtendimento ? data(os.dataAtendimento) : '—'}</td>
              <td><small>{competenciaDe(os)}</small></td>
              <td>{os.especialidade || '—'}</td>
              <td>{os.motoristaId ? <Link to={`/equipe/${os.motoristaId}`}>{os.motorista}</Link> : '—'}</td>
              <td>{veiculo ? <Link to={`/veiculos?veiculo=${veiculo.id}`}>{os.viatura}</Link> : os.viatura || '—'}</td>
              <td>{os.numeroOp ?? <small>Aguardando OP</small>}</td>
              <td><span className={`vehicle-status ${ETIQUETAS[os.situacao].classe}`}>{ETIQUETAS[os.situacao].texto}</span></td>
              {/* Com OP, o valor e o oficial; sem OP, o informado a mao, marcado como previsto. */}
              <td>{os.ordemPagamentoId
                ? <>{moeda(os.valorTotal)}
                    {os.divergencia !== undefined
                      ? <><br/><small>informado {moeda(os.valorManual ?? 0)} · {os.divergencia > 0 ? '+' : ''}{moeda(os.divergencia)}</small></>
                      : null}</>
                : os.valorManual !== undefined
                  ? <>{moeda(os.valorManual)}<br/><small>informado, aguarda a OP</small></>
                  : <small>Chega com a OP</small>}</td>
              <td>{os.comissao !== undefined ? moeda(os.comissao) : <small>Só com a OP</small>}</td>
              <td>
                {os.ordemPagamentoId ? null : <button className="table-action" onClick={() => setInformando(os)} aria-label={`Informar valor da OS ${os.numero}`}>Informar valor</button>}
                <button className="table-action" onClick={() => setCorrigindo(os)} aria-label={`Corrigir OS ${os.numero}`}>Corrigir</button>
              </td>
            </tr>
          })}</tbody>
        </table></div> : null}

      {dados && paginas > 1
        ? <div className="paginacao">
            <button className="button button-ghost" disabled={pagina === 0 || carregando} onClick={() => setPagina(p => p - 1)}>Anterior</button>
            <span>Página {pagina + 1} de {paginas} · {dados.total.toLocaleString('pt-BR')} OS</span>
            <button className="button button-ghost" disabled={pagina + 1 >= paginas || carregando} onClick={() => setPagina(p => p + 1)}>Próxima</button>
          </div>
        : null}
    </Painel>

    {corrigindo ? <Modal etiqueta={`OS ${corrigindo.numero}`} titulo="Corrigir socorrista e viatura" aoFechar={() => setCorrigindo(null)}>
      <form onSubmit={salvarCorrecao} className="form-grid two-columns">
        <Selecao rotulo="Socorrista" name="motoristaId" defaultValue={corrigindo.motoristaId ?? ''} vazio="Selecione"
          opcoes={motoristas.filter(m => m.ativo || m.id === corrigindo.motoristaId).map(m => ({ valor: m.id, texto: m.nome }))}/>
        <Selecao rotulo="Viatura" name="sigla" defaultValue={corrigindo.viatura?.toUpperCase() ?? ''} vazio="Selecione"
          opcoes={veiculos.map(v => ({ valor: siglaDe(v), texto: v.identificacao }))}/>
        {corrigindo.socorristaNoArquivo
          ? <p className="empty-inline field-wide">No arquivo da Porto veio: <strong>{corrigindo.socorristaNoArquivo}</strong></p>
          : null}
        <p className="empty-inline field-wide">Trocar o socorrista recalcula a comissão. A próxima importação não desfaz esta escolha.</p>
        <div className="modal-actions field-wide">
          <button type="button" className="button button-ghost" onClick={() => setCorrigindo(null)}>Cancelar</button>
          <button className="button button-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar correção'}</button>
        </div>
      </form>
    </Modal> : null}
    {informando ? <Modal etiqueta={`OS ${informando.numero}`} titulo="Informar o valor da Porto" aoFechar={() => setInformando(null)}>
      <form onSubmit={pedirValorManual} className="form-grid">
        <p className="empty-inline">Use o valor que a Porto mostra para esta OS antes da OP sair. Ele conta como previsto e é substituído quando a OP chegar.</p>
        <CampoValor rotulo="Valor do serviço" name="valor" defaultValue={informando.valorManual}
          exigirPositivo={false} ajuda="Deixe zerado para apagar o valor informado."/>
        <div className="modal-actions">
          <button type="button" className="button button-ghost" onClick={() => setInformando(null)}>Cancelar</button>
          <button className="button button-primary">Continuar</button>
        </div>
      </form>
    </Modal> : null}
    {emLote && dados ? <Modal etiqueta={`${dados.total} OS no filtro`} titulo="Definir viatura das OS filtradas" aoFechar={() => setEmLote(false)}>
      <form onSubmit={pedirViaturaEmLote} className="form-grid">
        <p className="empty-inline">Vale para as OS da lista atual: período e filtros aplicados. Filtre por socorrista e dia para acertar a viatura de quem rodou nela.</p>
        <Selecao rotulo="Viatura" name="sigla" required vazio="Selecione" opcoes={veiculos.filter(v => v.ativo).map(v => ({ valor: siglaDe(v), texto: v.identificacao }))}/>
        <label className="check-field"><input type="checkbox" name="soSemViatura" defaultChecked/><span>Só as que estão sem viatura ({dados.semViatura})</span></label>
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setEmLote(false)}>Cancelar</button><button className="button button-primary">Continuar</button></div>
      </form>
    </Modal> : null}
    {pedido ? <ConfirmarAcao {...pedido} aoFechar={() => setPedido(null)}/> : null}
  </div>
}
