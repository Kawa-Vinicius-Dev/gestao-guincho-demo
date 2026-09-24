import { useCallback, useEffect, useMemo, useState } from 'react'
import '../aprovacoes/aprovacoes-foto.css'
import { Carregando, ErroPagina, Vazio } from '../components/EstadoPagina'
import { LinkOp, LinkOs, LinkSocorrista } from '../components/LinksDeDado'
import { Modal } from '../components/Modal'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { CabecalhoPagina, Etiqueta, GradeIndicadores, Indicador, Painel } from '../components/ui/Pagina'
import { limparAtendimentosAntigos, listarAtendimentos, type AtendimentoRegistrado } from '../dados/atendimentos'
import { linkDaFoto } from '../dados/turnos'
import { nomesCurtos } from '../utils/nomes'
import { usePeriodoGlobal } from '../utils/periodoGlobal'

/**
 * Atendimentos — a prova colhida no local pelo socorrista (Kawa, 24/09/2026):
 * chegada, fotos do veiculo do segurado e assinatura, juntas com a OS da Porto
 * quando ela chega. E o que se mostra numa contestacao.
 */

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

export function ProvaDoAtendimento({ atendimento, aoFechar }: { atendimento: AtendimentoRegistrado; aoFechar: () => void }) {
  const [imagens, setImagens] = useState<{ rotulo: string; url: string }[] | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    const lista = [
      ...atendimento.fotos.antes.map((c, i) => ({ rotulo: `Antes ${i + 1}`, caminho: c })),
      ...atendimento.fotos.depois.map((c, i) => ({ rotulo: `Depois ${i + 1}`, caminho: c })),
      ...(atendimento.assinatura ? [{ rotulo: `Assinatura${atendimento.nomeAssinante ? ` · ${atendimento.nomeAssinante}` : ''}`, caminho: atendimento.assinatura }] : []),
    ]
    Promise.all(lista.map(async f => ({ rotulo: f.rotulo, url: await linkDaFoto(f.caminho) })))
      .then(setImagens).catch(e => setErro((e as Error).message))
  }, [atendimento])

  return <Modal etiqueta="Prova do atendimento" largo fecharAoClicarFora aoFechar={aoFechar}
    titulo={`OS ${atendimento.numeroOs} · ${atendimento.motorista} · chegada ${dia(atendimento.chegadaEm)} ${hora(atendimento.chegadaEm)}`}>
    {atendimento.observacao ? <p className="painel-apoio">“{atendimento.observacao}”</p> : null}
    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
    {!imagens && !erro ? <Carregando /> : null}
    {imagens ? <div className="checklist-admin">
      {imagens.map(f => <figure key={f.rotulo}>
        <a href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.rotulo} /></a>
        <figcaption>{f.rotulo}</figcaption>
      </figure>)}
    </div> : null}
  </Modal>
}

export default function AtendimentosPage() {
  const [periodo, setPeriodo] = usePeriodoGlobal()
  const [lista, setLista] = useState<AtendimentoRegistrado[] | null>(null)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState<AtendimentoRegistrado | null>(null)

  const carregar = useCallback(() => {
    if (!periodo.inicio || !periodo.fim || periodo.inicio > periodo.fim) return
    setErro('')
    listarAtendimentos(periodo.inicio, periodo.fim).then(setLista).catch(e => setErro((e as Error).message))
  }, [periodo.inicio, periodo.fim])
  useEffect(carregar, [carregar])
  useEffect(() => { void limparAtendimentosAntigos() }, [])

  const curtos = useMemo(() => nomesCurtos((lista ?? []).map(a => a.motorista)), [lista])
  const semOs = (lista ?? []).filter(a => !a.osId).length
  const comAssinatura = (lista ?? []).filter(a => a.assinatura).length

  if (erro && !lista) return <ErroPagina mensagem={erro} tentarNovamente={carregar} />

  return <div className="page-enter">
    <CabecalhoPagina modulo="Porto Seguro" titulo="Atendimentos"
      descricao="A prova colhida no local: chegada, fotos do veículo do segurado e assinatura. Serve para contestar a Porto." />
    <section className="panel painel-filtros"><form className="ledger-filters" onSubmit={e => e.preventDefault()}>
      <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} />
    </form></section>

    {!lista ? <Carregando /> : <>
      <GradeIndicadores>
        <Indicador rotulo="Atendimentos registrados" valor={lista.length} apoio="No período, pela hora de chegada" />
        <Indicador rotulo="Com assinatura" valor={comAssinatura} tom={comAssinatura ? 'positivo' : 'neutro'}
          apoio={lista.length ? `${Math.round(comAssinatura / lista.length * 100)}% dos atendimentos` : 'Nenhum ainda'} />
        <Indicador rotulo="OS ainda não chegou" valor={semOs} tom={semOs ? 'atencao' : 'neutro'}
          apoio="O número não bate com nenhuma OS importada" />
      </GradeIndicadores>

      <Painel titulo="Atendimentos">
        {!lista.length
          ? <Vazio titulo="Nenhum atendimento registrado no período"
              descricao="O socorrista registra pelo celular, em Atendimento: número da OS, chegada, fotos e assinatura." />
          : <div className="table-scroll tabela-rolagem"><table>
              <thead><tr><th>OS</th><th>Socorrista</th><th>Chegada</th><th>Placa do segurado</th><th>Prova</th><th aria-label="Ações"></th></tr></thead>
              <tbody>{lista.map(a => {
                const fotos = a.fotos.antes.length + a.fotos.depois.length
                return <tr key={a.id}>
                  <td>{a.osId ? <LinkOs numero={a.numeroOs} /> : <span>{a.numeroOs}</span>}
                    <small className="celula-apoio">{a.osId
                      ? <>{[a.especialidade, a.numeroOp ? null : 'aguardando OP'].filter(Boolean).join(' · ')}{a.numeroOp ? <> · <LinkOp numero={a.numeroOp} rotulo={`OP ${a.numeroOp}`} /></> : null}</>
                      : 'OS ainda não chegou'}</small></td>
                  <td><LinkSocorrista id={a.motoristaId} nome={a.motorista}>{curtos.get(a.motorista) ?? a.motorista}</LinkSocorrista>
                    {a.viatura ? <small className="celula-apoio">{a.viatura}</small> : null}</td>
                  <td>{dia(a.chegadaEm)}<small className="celula-apoio">{hora(a.chegadaEm)}</small></td>
                  <td>{a.placa ?? '—'}</td>
                  <td>{a.arquivosApagados
                    ? <span className="celula-apoio">arquivos já apagados</span>
                    : <><Etiqueta tom={fotos ? 'ok' : 'neutro'}>{fotos} {fotos === 1 ? 'foto' : 'fotos'}</Etiqueta>{' '}
                        {a.assinatura ? <Etiqueta tom="ok">assinado</Etiqueta> : null}</>}</td>
                  <td className="acoes-contestacao">
                    {!a.arquivosApagados && (fotos || a.assinatura)
                      ? <button type="button" className="button button-ghost button-sm" onClick={() => setAberto(a)}>Ver prova</button> : null}
                  </td>
                </tr>
              })}</tbody>
            </table></div>}
      </Painel>
    </>}

    {aberto ? <ProvaDoAtendimento atendimento={aberto} aoFechar={() => setAberto(null)} /> : null}
  </div>
}

