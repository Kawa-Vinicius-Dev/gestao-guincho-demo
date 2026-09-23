import { useCallback, useEffect, useState } from 'react'
import { LinkOs } from '../components/LinksDeDado'
import { Link } from 'react-router-dom'
import { listarPendenciasOsPorto, resolverPendenciasOsPorto } from '../dados/porto'
import { useAoVivo } from '../dados/aoVivo'
import { listarMotoristas } from '../dados/motoristas'
import type { AcertoPendenciaOsPorto, Motorista, PendenciaOsPorto } from '../types/modelos'
import { data, moeda } from '../utils/formatadores'
import { Selecao } from '../components/Campos'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { usePeriodoGlobal } from '../utils/periodoGlobal'
import { Carregando } from '../components/EstadoPagina'
import { CabecalhoPagina, GradeIndicadores, Indicador, Painel } from '../components/ui/Pagina'
import { CampoValor } from '../components/CampoValor'
import { EtiquetaSituacao } from './situacaoOs'

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

const FILTROS = [
  { valor: 'TODAS', texto: 'Todas as pendências' },
  { valor: 'VALOR', texto: 'Sem valor' },
  { valor: 'SOCORRISTA', texto: 'Sem socorrista' },
  { valor: 'VIATURA', texto: 'Sem viatura' },
  { valor: 'PROXIMA_OP', texto: 'Aguardando próxima OP' },
  { valor: 'DIVERGENTE', texto: 'Valor divergente' },
]

export default function PortoPendenciasOsPage() {
  const [periodo, setPeriodo] = usePeriodoGlobal()
  const { inicio, fim } = periodo
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

  useEffect(() => { if (inicio && fim && inicio <= fim) void carregar(inicio, fim) }, [carregar, inicio, fim])
  // Recarrega sozinha, mas nunca por cima do que esta sendo preenchido e ainda nao foi salvo.
  useAoVivo(() => { if (!Object.keys(acertos).length) void carregar(inicio, fim) })
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
          : filtro === 'VIATURA' ? item.semViatura
            : filtro === 'PROXIMA_OP' ? item.situacao === 'AGUARDANDO_PROXIMA_OP'
              : item.situacao === 'DIVERGENTE')
  const pendentes = Object.keys(acertos).length
  const semValor = itens.filter(i => i.semValor).length
  const semSocorrista = itens.filter(i => i.semSocorrista).length
  const semViatura = itens.filter(i => i.semViatura).length
  // As duas situacoes que tambem seguram o fechamento, e que ate aqui a tela nao
  // enxergava: a OS que o Diario tem e a OP do periodo nao trouxe, e a que a OP
  // pagou diferente do que foi informado a mao.
  const proximaOp = itens.filter(i => i.situacao === 'AGUARDANDO_PROXIMA_OP').length
  const divergentes = itens.filter(i => i.situacao === 'DIVERGENTE')
  const valorDivergencia = divergentes.reduce((soma, i) => soma + Math.abs(i.divergencia ?? 0), 0)

  return <div className="page-enter">
    <CabecalhoPagina
      modulo="Módulo Porto"
      titulo="Pendências do período"
      descricao="O que segura o fechamento do período: falta de valor, de socorrista ou de viatura, serviço que não veio nesta OP e valor que a OP pagou diferente."
      contexto={<>Período: <strong>{data(inicio)}</strong> → <strong>{data(fim)}</strong></>}
      acoes={<>
        <Link className="button button-ghost" to="/porto/ordens-servico">Ordens de serviço</Link>
        <Link className="button button-ghost" to="/porto/devolvidos">Serviços devolvidos</Link>
        <button className="button button-primary" disabled={!pendentes || salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : `Salvar ${pendentes || ''} ${pendentes === 1 ? 'acerto' : 'acertos'}`.trim()}
        </button>
      </>}/>

    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
    {mensagem ? <div className="success-notice">{mensagem}</div> : null}

    <Painel className="painel-filtros">
      <form className="ledger-filters" onSubmit={e => { e.preventDefault(); void carregar(inicio, fim) }}>
        <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/>
        <Selecao rotulo="Mostrar" value={filtro} onChange={e => setFiltro(e.target.value)} opcoes={FILTROS}/>
      </form>
    </Painel>

    {carregando ? <Carregando/> : null}

      <GradeIndicadores>
        <Indicador rotulo="Com pendência" valor={itens.length}
          apoio={itens.length ? 'Ordens de serviço a acertar' : 'Fechamento limpo'}/>
        <Indicador rotulo="Sem valor" valor={semValor}
          tom={semValor ? 'atencao' : 'neutro'}
          apoio="A Porto só precifica na OP"/>
        <Indicador rotulo="Sem socorrista" valor={semSocorrista}
          tom={semSocorrista ? 'alerta' : 'neutro'}
          apoio={semSocorrista ? 'Sem socorrista não há comissão' : 'Todas com dono'}/>
        <Indicador rotulo="Sem viatura" valor={semViatura}
          tom={semViatura ? 'atencao' : 'neutro'}
          apoio="A viatura chega pelo painel do dia"/>
        <Indicador rotulo="Aguardando próxima OP" valor={proximaOp}
          tom={proximaOp ? 'atencao' : 'neutro'}
          apoio={proximaOp ? 'Não vieram na OP deste período' : 'Nada ficou para trás'}/>
        <Indicador rotulo="Valor divergente" valor={divergentes.length}
          tom={divergentes.length ? 'alerta' : 'neutro'}
          apoio={divergentes.length
            ? `${moeda(valorDivergencia)} entre o informado e a OP`
            : 'A OP bateu com o informado'}/>
      </GradeIndicadores>

    <Painel semRespiro>
      {!carregando && !itens.length
        ? <p className="empty-inline">Nada pendente neste período. O fechamento está limpo.</p>
        : <div className="table-scroll"><table>
          <thead><tr>
            <th>OS</th><th>Atendimento</th><th>Seguradora</th><th>OP</th><th>Situação</th>
            <th>Valor</th><th>Socorrista</th><th>Viatura</th>
          </tr></thead>
          <tbody>{visiveis.map(item => <tr key={item.id}>
            <td><strong><LinkOs numero={item.numeroOs}/></strong><small>{item.especialidade || '—'}</small></td>
            <td>{item.dataAtendimento ? data(item.dataAtendimento) : '—'}</td>
            <td>{item.seguradora || '—'}</td>
            <td>{item.numeroOp || 'Aguardando OP'}</td>
            <td><EtiquetaSituacao situacao={item.situacao}/>
              {item.situacao === 'DIVERGENTE' && item.divergencia
                ? <small>{moeda(Math.abs(item.divergencia))} de diferença</small>
                : null}</td>
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
              ? <input aria-label={`Viatura da OS ${item.numeroOs}`} placeholder="Sigla da viatura"
                  value={acertos[item.id]?.siglaViatura ?? ''}
                  onChange={e => anotar(item.id, 'siglaViatura', e.target.value.toUpperCase())}/>
              : item.siglaViatura}</td>
          </tr>)}</tbody>
        </table></div>}
    </Painel>
  </div>
}
