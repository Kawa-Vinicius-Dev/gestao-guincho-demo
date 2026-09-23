import { useEffect, useState } from 'react'
import { LinkOs, LinkSocorrista, LinkViatura } from '../components/LinksDeDado'
import { Link } from 'react-router-dom'
import { useAoVivo } from '../dados/aoVivo'
import { listarTodasAsOs, type LinhaOs } from '../dados/porto/listaOs'
import { Carregando } from '../components/EstadoPagina'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { CabecalhoPagina, GradeIndicadores, Indicador, Painel } from '../components/ui/Pagina'
import { data, moeda } from '../utils/formatadores'
import { usePeriodoGlobal } from '../utils/periodoGlobal'

/**
 * Contas a receber: o que a equipe ja atendeu e a Porto ainda nao pagou.
 *
 * Kawa: "contas a receber so se for o valor diario que for adicionado, porque as
 * OS ainda nao foram pagas". A OP chega paga, entao nao ha nada a receber nela;
 * o que falta receber sao os servicos que entraram pelo painel diario e ainda
 * nao vieram numa OP. O painel vem sem valor: o valor so e conhecido quando a OP
 * chega, e ai a OS sai desta lista e vira receita.
 */
export default function ContasReceberPage() {
  const [periodo, setPeriodo] = usePeriodoGlobal()
  const { inicio, fim } = periodo
  const [itens, setItens] = useState<LinhaOs[]>([])
  const [previsto, setPrevisto] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [versao, setVersao] = useState(0)
  // OP importada em outra aba: as OS pagas saem daqui sozinhas.
  useAoVivo(() => setVersao(v => v + 1))

  useEffect(() => {
    if (!inicio || !fim || inicio > fim) return
    let valeu = true
    setCarregando(true); setErro('')
    // Pela competencia, e nao pela data do servico: a OS que ficou para tras e
    // cobrada na competencia seguinte, e e ali que ela precisa aparecer.
    listarTodasAsOs({ inicio, fim, situacao: 'AGUARDANDO', porCompetencia: true })
      .then(pagina => { if (valeu) { setItens(pagina.itens); setPrevisto(pagina.valorPrevisto) } })
      .catch(e => { if (valeu) setErro((e as Error).message) })
      .finally(() => { if (valeu) setCarregando(false) })
    return () => { valeu = false }
  }, [inicio, fim, versao])

  const semValor = itens.filter(os => os.semValor).length
  const paraAProxima = itens.filter(os => os.situacao === 'AGUARDANDO_PROXIMA_OP').length
  const lista = (situacao: string) => `/porto/ordens-servico?situacao=${situacao}&competencia=1`

  return <div className="page-enter">
    <CabecalhoPagina
      modulo="Financeiro"
      titulo="Contas a receber"
      descricao="Serviços atendidos que a Porto ainda não pagou. Saem daqui quando chegam numa OP."
      contexto={<>Período: <strong>{data(inicio)}</strong> → <strong>{data(fim)}</strong></>}
      acoes={<Link className="button button-ghost" to="/porto/importacoes">Importar OP</Link>}/>

    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}

    <Painel className="painel-filtros">
      <form className="ledger-filters" onSubmit={e => e.preventDefault()}>
        <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/>
      </form>
    </Painel>

    <GradeIndicadores>
      <Indicador rotulo="Aguardando OP" valor={itens.length} link={lista('AGUARDANDO')}
        apoio={itens.length ? 'Serviços do Diário ainda não pagos' : 'Nada a receber no período'}/>
      <Indicador rotulo="Valor previsto" valor={moeda(previsto)} link={lista('VALOR_MANUAL')}
        apoio={semValor ? `${semValor} ${semValor === 1 ? 'serviço ainda sem valor' : 'serviços ainda sem valor'}: o valor chega com a OP` : 'Todos com valor informado'}/>
      <Indicador rotulo="Aguardando próxima OP" valor={paraAProxima} link={lista('AGUARDANDO_PROXIMA_OP')}
        apoio={paraAProxima ? 'Ficaram fora da OP da competência anterior' : 'Nada ficou para trás'}/>
    </GradeIndicadores>

    {carregando ? <Carregando/> : null}

    <Painel semRespiro>
      {!carregando && !itens.length
        ? <p className="empty-inline">Nenhum serviço aguardando pagamento neste período. Tudo o que foi atendido já veio numa OP.</p>
        : <div className="table-scroll"><table>
          <thead><tr>
            <th>OS</th><th>Atendimento</th><th>Especialidade</th><th>Viatura</th><th>Socorrista</th><th>Situação</th><th>Valor</th>
          </tr></thead>
          <tbody>{itens.map(os => <tr key={os.id}>
            <td><strong><LinkOs numero={os.numero}/></strong></td>
            <td>{os.dataAtendimento ? data(os.dataAtendimento) : '—'}</td>
            <td>{os.especialidade || '—'}</td>
            <td><LinkViatura sigla={os.viatura}/></td>
            <td>{os.motorista ? <LinkSocorrista id={os.motoristaId} nome={os.motorista}/> : os.socorristaNoArquivo || '—'}</td>
            <td>{os.situacao === 'AGUARDANDO_PROXIMA_OP'
              ? <small>Aguardando próxima OP</small>
              : os.situacao === 'VALOR_MANUAL' ? <small>Valor informado</small> : <small>Sem valor</small>}</td>
            <td>{os.valorManual !== undefined ? moeda(os.valorManual) : <small>Chega com a OP</small>}</td>
          </tr>)}</tbody>
        </table></div>}
    </Painel>
  </div>
}
