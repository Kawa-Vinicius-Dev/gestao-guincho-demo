import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarPendenciasOsPorto, resolverPendenciasOsPorto } from '../dados/porto'
import { listarMotoristas } from '../dados/motoristas'
import type { AcertoPendenciaOsPorto, Motorista, PendenciaOsPorto } from '../types/modelos'
import { data, hojeIso, moeda } from '../utils/formatadores'
import { Campo, Selecao } from '../components/Campos'
import { Carregando } from '../components/EstadoPagina'
import { CampoValor } from '../components/CampoValor'

/**
 * O que falta para fechar o periodo, numa tela de trabalho.
 *
 * Tres faltas impedem o fechamento, e todas nascem de onde o dado chega
 * incompleto: o painel do dia traz o acionamento sem valor, porque a Porto so
 * precifica na OP; o relatorio da OP traz a coluna de viatura sempre vazia; e o
 * QRA nem sempre casa com alguem do cadastro. As tres moram na mesma lista
 * porque quem opera resolve todas na mesma sentada.
 *
 * Sempre dentro do periodo escolhido. Sem esse recorte, um ano de operacao
 * abriria com milhares de linhas e a tela deixaria de ser util no dia em que
 * mais precisa ser.
 */
const primeiroDiaDoMes = () => `${hojeIso().slice(0, 8)}01`

const FILTROS = [
  { valor: 'TODAS', texto: 'Todas as pendências' },
  { valor: 'VALOR', texto: 'Sem valor' },
  { valor: 'SOCORRISTA', texto: 'Sem socorrista' },
  { valor: 'VIATURA', texto: 'Sem viatura' },
]

export default function PortoPendenciasOsPage() {
  const [inicio, setInicio] = useState(primeiroDiaDoMes())
  const [fim, setFim] = useState(hojeIso())
  const [filtro, setFiltro] = useState('TODAS')
  const [itens, setItens] = useState<PendenciaOsPorto[]>([])
  const [motoristas, setMotoristas] = useState<Motorista[]>([])
  const [acertos, setAcertos] = useState<Record<number, AcertoPendenciaOsPorto>>({})
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')

  const carregar = useCallback(async (de: string, ate: string) => {
    setCarregando(true); setErro(''); setAcertos({})
    try { setItens(await listarPendenciasOsPorto(de, ate)) }
    catch (e) { setErro((e as Error).message) }
    finally { setCarregando(false) }
  }, [])

  useEffect(() => { void carregar(primeiroDiaDoMes(), hojeIso()) }, [carregar])
  useEffect(() => {
    listarMotoristas().then(setMotoristas).catch((e: Error) => setErro(e.message))
  }, [])

  function anotar(id: number, campo: keyof AcertoPendenciaOsPorto, valor: number | string) {
    setAcertos(atual => ({ ...atual, [id]: { ...atual[id], id, [campo]: valor } }))
  }

  async function salvar() {
    const lista = Object.values(acertos)
    if (!lista.length) return
    setSalvando(true); setErro(''); setMensagem('')
    try {
      const total = await resolverPendenciasOsPorto(lista)
      setMensagem(`${total} ${total === 1 ? 'ordem de serviço atualizada' : 'ordens de serviço atualizadas'}.`)
      await carregar(inicio, fim)
    } catch (e) { setErro((e as Error).message) }
    finally { setSalvando(false) }
  }

  const visiveis = itens.filter(item =>
    filtro === 'TODAS' ? true
      : filtro === 'VALOR' ? item.semValor
        : filtro === 'SOCORRISTA' ? item.semSocorrista
          : item.semViatura)
  const pendentes = Object.keys(acertos).length

  return <div className="page-enter">
    <header className="page-heading">
      <div>
        <span className="eyebrow">Módulo Porto</span>
        <h1>Pendências do período</h1>
        <p>Ordens de serviço sem valor, sem socorrista ou sem viatura. Preencha o que faltar e salve de uma vez.</p>
      </div>
      <div className="heading-actions">
        <Link className="button button-ghost" to="/porto/ordens-servico">Ordens de serviço</Link>
        <Link className="button button-ghost" to="/porto/devolvidos">Serviços devolvidos</Link>
        <button className="button button-primary" disabled={!pendentes || salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : `Salvar ${pendentes || ''} ${pendentes === 1 ? 'acerto' : 'acertos'}`.trim()}
        </button>
      </div>
    </header>

    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
    {mensagem ? <div className="success-notice">{mensagem}</div> : null}

    <section className="panel">
      <form className="ledger-filters" onSubmit={e => { e.preventDefault(); void carregar(inicio, fim) }}>
        <Campo rotulo="Data inicial">
          <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} required/>
        </Campo>
        <Campo rotulo="Data final">
          <input type="date" value={fim} onChange={e => setFim(e.target.value)} required/>
        </Campo>
        <Selecao rotulo="Mostrar" value={filtro} onChange={e => setFiltro(e.target.value)} opcoes={FILTROS}/>
        <button className="button button-primary">Aplicar filtros</button>
      </form>

      {carregando ? <Carregando/> : null}

      <div className="porto-preview-summary">
        <span><strong>{itens.length}</strong> com pendência</span>
        <span><strong>{itens.filter(i => i.semValor).length}</strong> sem valor</span>
        <span><strong>{itens.filter(i => i.semSocorrista).length}</strong> sem socorrista</span>
        <span><strong>{itens.filter(i => i.semViatura).length}</strong> sem viatura</span>
      </div>

      {!carregando && !itens.length
        ? <p className="empty-inline">Nada pendente neste período. O fechamento está limpo.</p>
        : <div className="table-scroll"><table>
          <thead><tr>
            <th>OS</th><th>Atendimento</th><th>Seguradora</th><th>OP</th>
            <th>Valor</th><th>Socorrista</th><th>Viatura</th>
          </tr></thead>
          <tbody>{visiveis.map(item => <tr key={item.id}>
            <td><strong>{item.numeroOs}</strong><small>{item.especialidade || '—'}</small></td>
            <td>{item.dataAtendimento ? data(item.dataAtendimento) : '—'}</td>
            <td>{item.seguradora || '—'}</td>
            <td>{item.numeroOp || 'Aguardando OP'}</td>
            <td>{item.semValor
              ? <CampoValor rotulo={`Valor da OS ${item.numeroOs}`} name={`valor-${item.id}`}
                  exigirPositivo={false}
                  onValor={valor => anotar(item.id, 'valorTotal', valor)}/>
              : moeda(item.valorTotal)}</td>
            <td>{item.semSocorrista
              ? <Selecao rotulo={`Socorrista da OS ${item.numeroOs}`} vazio="Selecione"
                  value={acertos[item.id]?.motoristaId ?? ''}
                  onChange={e => anotar(item.id, 'motoristaId', Number(e.target.value))}
                  opcoes={motoristas.map(m => ({ valor: m.id, texto: m.nome }))}/>
              : item.socorrista || '—'}</td>
            <td>{item.semViatura
              ? <input aria-label={`Viatura da OS ${item.numeroOs}`} placeholder="Ex.: L168"
                  value={acertos[item.id]?.siglaViatura ?? ''}
                  onChange={e => anotar(item.id, 'siglaViatura', e.target.value.toUpperCase())}/>
              : item.siglaViatura}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </div>
}
