import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAoVivo } from '../dados/aoVivo'
import { baixarExcel, baixarPdf, type Relatorio } from '../dados/exportar'
import { listarMotoristas } from '../dados/motoristas'
import { corrigirOs, listarOs, listarTodasAsOs, TAMANHO_DA_PAGINA, type FiltroOs, type LinhaOs, type PaginaOs, type SituacaoOs } from '../dados/porto/listaOs'
import { listarVeiculos } from '../dados/veiculos'
import { Campo, Selecao } from '../components/Campos'
import { Carregando } from '../components/EstadoPagina'
import { Modal } from '../components/Modal'
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
]

const siglaDe = (v: Veiculo) => (v.siglaPorto || v.identificacao).toUpperCase()

export default function PortoOrdensServicoPage() {
  const [periodo, setPeriodo] = usePeriodoGlobal()
  const [numeroOs, setNumeroOs] = useState('')
  const [numeroOp, setNumeroOp] = useState('')
  const [especialidade, setEspecialidade] = useState('')
  const [motoristaId, setMotoristaId] = useState(0)
  const [sigla, setSigla] = useState('')
  const [situacao, setSituacao] = useState<SituacaoOs>('')
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

  const filtro: FiltroOs = useMemo(() => ({
    inicio: periodo.inicio, fim: periodo.fim, numeroOs: numeroOsAdiado, numeroOp: numeroOpAdiado,
    especialidade: especialidadeAdiada, motoristaId, sigla, situacao,
  }), [periodo.inicio, periodo.fim, numeroOsAdiado, numeroOpAdiado, especialidadeAdiada, motoristaId, sigla, situacao])

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
  const temFiltro = Boolean(numeroOs || numeroOp || especialidade || motoristaId || sigla || situacao)
  const veiculoPorSigla = useMemo(() => new Map(veiculos.map(v => [siglaDe(v), v])), [veiculos])

  function limparFiltros() {
    setNumeroOs(''); setNumeroOp(''); setEspecialidade(''); setMotoristaId(0); setSigla(''); setSituacao('')
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
        colunas: [
          { titulo: 'OS', largura: 16 }, { titulo: 'Atendimento', tipo: 'data', largura: 13 },
          { titulo: 'Especialidade', largura: 20 }, { titulo: 'Socorrista', largura: 32 },
          { titulo: 'Viatura', largura: 11 }, { titulo: 'OP', largura: 12 },
          { titulo: 'Valor', tipo: 'moeda', largura: 14 }, { titulo: 'Comissão', tipo: 'moeda', largura: 14 },
        ],
        linhas: todas.itens.map(os => [os.numero, os.dataAtendimento, os.especialidade, os.motorista,
          os.viatura, os.numeroOp ?? 'Aguardando OP', os.valorTotal, os.comissao]),
        totais: ['Total', null, null, null, null, null, todas.valorTotal, todas.comissaoTotal],
        nomeArquivo: `ordens-de-servico-${filtro.inicio}-a-${filtro.fim}`,
      }
      if (formato === 'excel') await baixarExcel(relatorio)
      else await baixarPdf(relatorio)
    } catch (e) { setErro((e as Error).message) }
    finally { setExportando('') }
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
        <Campo rotulo="Número da OS"><input value={numeroOs} onChange={e => setNumeroOs(e.target.value)} autoCorrect="off" spellCheck={false} autoComplete="off"/></Campo>
        <Campo rotulo="Número da OP"><input value={numeroOp} onChange={e => setNumeroOp(e.target.value)} inputMode="numeric" autoComplete="off"/></Campo>
        <Selecao rotulo="Socorrista" vazio="Todos" value={motoristaId || ''} onChange={e => setMotoristaId(Number(e.target.value))}
          opcoes={motoristas.map(m => ({ valor: m.id, texto: m.nome }))}/>
        <Selecao rotulo="Viatura" vazio="Todas" value={sigla} onChange={e => setSigla(e.target.value)}
          opcoes={veiculos.map(v => ({ valor: siglaDe(v), texto: v.identificacao }))}/>
        <Campo rotulo="Especialidade"><input value={especialidade} onChange={e => setEspecialidade(e.target.value)} autoComplete="off"/></Campo>
        <Selecao rotulo="Situação" vazio="Todas" value={situacao} onChange={e => setSituacao(e.target.value as SituacaoOs)} opcoes={SITUACOES}/>
        {temFiltro ? <button type="button" className="button button-ghost" onClick={limparFiltros}>Limpar filtros</button> : null}
      </form>
    </Painel>

    <GradeIndicadores>
      <Indicador rotulo="Ordens de serviço" valor={dados ? dados.total.toLocaleString('pt-BR') : '—'}
        apoio={temFiltro ? 'Com os filtros aplicados' : 'Todas do período'}/>
      <Indicador rotulo="Valor" valor={dados ? moeda(dados.valorTotal) : '—'} apoio="Soma das OS da lista"/>
      <Indicador rotulo="Comissão" valor={dados ? moeda(dados.comissaoTotal) : '—'} apoio="20% das OS já pagas numa OP"/>
    </GradeIndicadores>

    <Painel semRespiro>
      {carregando && !dados ? <Carregando/> : null}
      {dados && !dados.itens.length
        ? <p className="empty-inline">{temFiltro ? 'Nenhuma OS com esses filtros neste período.' : 'Nenhuma OS neste período. Importe uma OP ou o painel diário.'}</p>
        : dados ? <div className="table-scroll"><table aria-label="Ordens de serviço">
          <thead><tr>
            <th>OS</th><th>Atendimento</th><th>Especialidade</th><th>Socorrista</th><th>Viatura</th>
            <th>OP</th><th>Valor</th><th>Comissão</th><th/>
          </tr></thead>
          <tbody>{dados.itens.map(os => {
            const veiculo = os.viatura ? veiculoPorSigla.get(os.viatura.toUpperCase()) : undefined
            return <tr key={os.id}>
              <td><strong>{os.numero}</strong></td>
              <td>{os.dataAtendimento ? data(os.dataAtendimento) : '—'}</td>
              <td>{os.especialidade || '—'}</td>
              <td>{os.motoristaId ? <Link to={`/equipe/${os.motoristaId}`}>{os.motorista}</Link> : '—'}</td>
              <td>{veiculo ? <Link to={`/veiculos?veiculo=${veiculo.id}`}>{os.viatura}</Link> : os.viatura || '—'}</td>
              <td>{os.numeroOp ?? <small>Aguardando OP</small>}</td>
              <td>{os.valorTotal ? moeda(os.valorTotal) : <small>Chega com a OP</small>}</td>
              <td>{os.comissao !== undefined ? moeda(os.comissao) : '—'}</td>
              <td><button className="table-action" onClick={() => setCorrigindo(os)} aria-label={`Corrigir OS ${os.numero}`}>Corrigir</button></td>
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
  </div>
}
