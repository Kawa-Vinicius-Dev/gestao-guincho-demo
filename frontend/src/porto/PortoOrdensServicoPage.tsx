import { useEffect, useState, type FormEvent } from 'react'
import { listarMotoristas } from '../dados/motoristas'
import { associarMotoristaPorto, baixarOrdensServicoPorto, informarValorOrdemServicoPorto, listarOrdensServicoPorto, periodoPadraoOrdensServicoPorto } from '../dados/porto'
import { Campo, Selecao } from '../components/Campos'
import type { Motorista, OrdemServicoPorto } from '../types/modelos'
import { ModalAssociarSocorrista } from './os/ModalAssociarSocorrista'
import { Carregando } from '../components/EstadoPagina'
import { TabelaOrdensServico } from './os/TabelaOrdensServico'
import { FILTROS_OS, STATUS_FINANCEIRO, STATUS_OPERACIONAL } from './os/opcoes'

export default function PortoOrdensServicoPage() {
  const [itens, setItens] = useState<OrdemServicoPorto[]>([])
  const [motoristas, setMotoristas] = useState<Motorista[]>([])
  const [associando, setAssociando] = useState<OrdemServicoPorto | null>(null)
  const [motoristaId, setMotoristaId] = useState(0)
  const [somenteNaoIdentificados, setSomenteNaoIdentificados] = useState(false)
  const [somenteSemQra, setSomenteSemQra] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [periodo, setPeriodo] = useState({ dataInicio: '', dataFim: '' })
  const [parametros, setParametros] = useState(new URLSearchParams())

  async function carregar(params = new URLSearchParams()) {
    setErro(''); setParametros(new URLSearchParams(params))
    try { setItens(await listarOrdensServicoPorto(params)) }
    catch (e) { setErro((e as Error).message) }
  }

  const [carregando,setCarregando]=useState(true)
  useEffect(() => {
    // a tela abre num mes so, para nao trazer a tabela inteira
    periodoPadraoOrdensServicoPorto()
      .then(p => { setPeriodo(p); return carregar(new URLSearchParams({ dataInicio: p.dataInicio, dataFim: p.dataFim })) })
      .catch(e => { setErro((e as Error).message); return carregar() })
      .finally(() => setCarregando(false))
    listarMotoristas().then(setMotoristas).catch(e => setErro(e.message))
  }, [])

  async function aplicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const campos = new FormData(evento.currentTarget), params = new URLSearchParams()
    for (const nome of FILTROS_OS) {
      const valor = String(campos.get(nome) ?? '')
      if (valor) params.set(nome, valor)
    }
    if (somenteNaoIdentificados) params.set('semSocorrista', 'true')
    if (somenteSemQra) params.set('semQra', 'true')
    await carregar(params)
  }

  async function confirmarAssociacao() {
    if (!associando || !motoristaId) return
    setSalvando(true); setErro('')
    try {
      const atualizada = await associarMotoristaPorto(associando.id, motoristaId)
      setItens(lista => somenteNaoIdentificados
        ? lista.filter(os => os.id !== atualizada.id)
        : lista.map(os => os.id === atualizada.id ? atualizada : os))
      setAssociando(null); setMotoristaId(0)
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }

  async function informarValor(ordem: OrdemServicoPorto, valor: number) {
    setErro('')
    try {
      const atualizada = await informarValorOrdemServicoPorto(ordem.id, valor)
      setItens(lista => lista.map(os => os.id === atualizada.id ? atualizada : os))
    } catch (e) { setErro((e as Error).message) }
  }

  /**
   * "Sem socorrista" e "sem QRA" sao filtros do servidor: peneirar em memoria
   * alcancaria so o mes carregado. Ao marcar, o recorte de data sai para o
   * operacional ver todo o acumulado.
   */
  async function alternarRecorte(chave: 'semSocorrista' | 'semQra', marcado: boolean) {
    if (chave === 'semSocorrista') setSomenteNaoIdentificados(marcado)
    else setSomenteSemQra(marcado)
    const params = new URLSearchParams(parametros)
    if (marcado) {
      params.set(chave, 'true')
      params.delete('dataInicio'); params.delete('dataFim')
      setPeriodo({ dataInicio: '', dataFim: '' })
    } else params.delete(chave)
    await carregar(params)
  }

  // exporta exatamente o recorte na tela: os filtros aplicados ja estao em parametros
  async function exportar() {
    setExportando(true); setErro('')
    try { await baixarOrdensServicoPorto(parametros) }
    catch (e) { setErro((e as Error).message) } finally { setExportando(false) }
  }

  const rotuloExportar = exportando ? 'Gerando arquivo…'
    : somenteSemQra ? 'Exportar OS sem QRA'
    : somenteNaoIdentificados ? 'Exportar OS sem socorrista'
    : 'Exportar Excel'

  return <div className="page-enter">
    <header className="page-heading">
      <div>
        <span className="eyebrow">Porto Seguro</span>
        <h1>Ordens de serviço</h1>
        <p>Serviços individuais importados, com previsão original e ciclo efetivo.</p>
      </div>
      <div className="heading-actions">
        <button className="button button-primary" disabled={exportando} onClick={() => void exportar()}>
          {rotuloExportar}
        </button>
      </div>
    </header>

    {erro ? <div className="form-alert">{erro}</div> : null}

    <section className="panel">
      <form className="ledger-filters porto-os-filters" onSubmit={aplicar}>
        <Campo rotulo="De">
          <input aria-label="Data inicial" name="dataInicio" type="date"
            defaultValue={periodo.dataInicio} key={`i${periodo.dataInicio}`}/>
        </Campo>
        <Campo rotulo="Até">
          <input aria-label="Data final" name="dataFim" type="date"
            defaultValue={periodo.dataFim} key={`f${periodo.dataFim}`}/>
        </Campo>
        <Campo rotulo="Número da OS" className="filter-grow"><input name="numeroOs" autoCapitalize="characters" autoCorrect="off" spellCheck={false}/></Campo>
        <Campo rotulo="Número da OP"><input name="numeroOp" inputMode="numeric" autoComplete="off"/></Campo>
        <Campo rotulo="Especialidade"><input name="especialidade" autoCapitalize="sentences" autoComplete="off"/></Campo>
        <Campo rotulo="Socorrista"><input name="socorrista" autoCapitalize="words" autoComplete="off"/></Campo>
        <Campo rotulo="Seguradora"><input name="seguradora" placeholder="Porto, Azul, Itaú…" autoCapitalize="sentences" autoComplete="off"/></Campo>
        <Selecao rotulo="Status operacional" name="statusOperacional" vazio="Todos" opcoes={STATUS_OPERACIONAL}/>
        <Selecao rotulo="Status financeiro" name="statusFinanceiro" vazio="Todos" opcoes={STATUS_FINANCEIRO}/>
        <button className="button button-primary">Aplicar filtros</button>
      </form>

      {/* Recortes que o servidor resolve, e por isso ficam junto dos filtros e
          nao dentro do formulario: marcar um deles ja refaz a consulta. */}
      <div className="filtros-marcadores">
        <label className="check-field">
          <input type="checkbox" checked={somenteNaoIdentificados}
            onChange={e => void alternarRecorte('semSocorrista', e.target.checked)}/>
          <span>Somente OS sem socorrista</span>
        </label>
        <label className="check-field">
          <input type="checkbox" checked={somenteSemQra}
            onChange={e => void alternarRecorte('semQra', e.target.checked)}/>
          <span>Somente OS sem QRA</span>
        </label>
      </div>

      {somenteNaoIdentificados
        ? <p className="empty-inline">
            Mostrando as OS sem socorrista de todos os períodos. Associe cada uma ao socorrista
            responsável, ou exporte a lista para tratar fora do sistema.
          </p>
        : null}

      {carregando?<Carregando/>:<TabelaOrdensServico itens={itens}
        aoAssociar={(ordem, sugestao) => { setAssociando(ordem); setMotoristaId(sugestao) }}
        aoInformarValor={informarValor}/>}
    </section>

    {associando
      ? <ModalAssociarSocorrista ordem={associando} motoristas={motoristas} motoristaId={motoristaId}
          aoTrocar={setMotoristaId} aoConfirmar={() => void confirmarAssociacao()} salvando={salvando}
          aoFechar={() => { setAssociando(null); setMotoristaId(0) }}/>
      : null}
  </div>
}
