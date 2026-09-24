import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CampoValor } from '../components/CampoValor'
import { Campo } from '../components/Campos'
import { ConfirmarAcao } from '../components/ConfirmarAcao'
import { Carregando, ErroPagina, Vazio } from '../components/EstadoPagina'
import { LinkOp, LinkOs, LinkSocorrista, LinkViatura } from '../components/LinksDeDado'
import { AcoesModal, Modal } from '../components/Modal'
import { CabecalhoPagina, Etiqueta, GradeIndicadores, Indicador, Painel } from '../components/ui/Pagina'
import {
  atualizarContestacao, detectarContestacoes, especialidadesVistas, listarContestacoes, resumoDasContestacoes, salvarPreco,
  type Contestacao, type EspecialidadeVista, type SituacaoContestacao,
} from '../dados/porto/contestacoes'
import { data, hojeIso, moeda } from '../utils/formatadores'
import { nomesCurtos } from '../utils/nomes'

/**
 * Contestacoes — o dinheiro que a Porto deixou de pagar (Kawa, 24/09/2026).
 *
 * O sistema ja apontava OS sem valor e divergente; o acompanhamento parava ali.
 * Aqui cada caso tem situacao, prazo e quanto voltou. Abrir a tela confere as
 * OPs: cria os casos novos e fecha sozinho o que a Porto acabou pagando.
 *
 * Os quadros do topo sao filtros: clicar mostra os casos que eles somam.
 */

type Filtro = 'abertos' | 'vencendo' | SituacaoContestacao | 'todas'

const ROTULO_FILTRO: Record<Filtro, string> = {
  abertos: 'Em aberto', vencendo: 'Prazo em 7 dias', A_CONTESTAR: 'A contestar', CONTESTADA: 'Contestadas',
  ACEITA: 'Aceitas', PERDIDA: 'Perdidas', todas: 'Todas',
}

const SITUACAO: Record<SituacaoContestacao, { texto: string; tom: 'ok' | 'neutro' | 'alerta' | 'atencao' }> = {
  A_CONTESTAR: { texto: 'A contestar', tom: 'atencao' },
  CONTESTADA: { texto: 'Contestada', tom: 'neutro' },
  ACEITA: { texto: 'Aceita', tom: 'ok' },
  PERDIDA: { texto: 'Perdida', tom: 'alerta' },
}

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

type Acao = { tipo: 'contestar' | 'aceitar' | 'perder' | 'reabrir'; caso: Contestacao }

export default function PortoContestacoesPage() {
  const hoje = hojeIso()
  const [busca, setBusca] = useSearchParams()
  const filtro = (busca.get('filtro') ?? 'abertos') as Filtro
  const [casos, setCasos] = useState<Contestacao[] | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [acao, setAcao] = useState<Acao | null>(null)

  const carregar = useCallback(async (conferir: boolean) => {
    setErro('')
    try {
      const novos = conferir ? await detectarContestacoes() : 0
      setCasos(await listarContestacoes())
      if (novos) setAviso(`${novos} ${novos === 1 ? 'caso novo encontrado' : 'casos novos encontrados'} nas OPs.`)
    } catch (e) { setErro((e as Error).message) }
  }, [])
  useEffect(() => { void carregar(true) }, [carregar])

  const resumo = useMemo(() => resumoDasContestacoes(casos ?? [], hoje), [casos, hoje])
  const limiteVencendo = somarDias(hoje, 7)
  const visiveis = useMemo(() => (casos ?? []).filter(c => {
    const aberto = c.situacao === 'A_CONTESTAR' || c.situacao === 'CONTESTADA'
    if (filtro === 'todas') return true
    if (filtro === 'abertos') return aberto
    if (filtro === 'vencendo') return aberto && Boolean(c.prazo && c.prazo <= limiteVencendo)
    return c.situacao === filtro
  }), [casos, filtro, limiteVencendo])
  const curtos = useMemo(() => nomesCurtos((casos ?? []).map(c => c.os.motorista ?? undefined)), [casos])

  if (erro && !casos) return <ErroPagina mensagem={erro} tentarNovamente={() => void carregar(true)} />
  if (!casos) return <Carregando mensagem="Conferindo as OPs…" />

  const link = (f: Filtro) => `/porto/contestacoes?filtro=${f}`
  const escolher = (f: Filtro) => setBusca(f === 'abertos' ? {} : { filtro: f }, { replace: true })

  return <div className="page-enter">
    <CabecalhoPagina modulo="Porto Seguro" titulo="Contestações"
      descricao="OS que a Porto não pagou ou pagou abaixo da tabela, e o que voltou."
      contexto={`${resumo.abertos} em aberto`} />

    {aviso ? <div className="success-notice" role="status">{aviso}</div> : null}
    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}

    <GradeIndicadores>
      <Indicador rotulo="A Porto deve" valor={moeda(resumo.valorAberto)} link={link('abertos')}
        tom={resumo.abertos ? 'atencao' : 'neutro'}
        apoio={`${resumo.abertos} ${resumo.abertos === 1 ? 'OS' : 'OS'} em aberto${resumo.semValorEsperado ? ` · ${resumo.semValorEsperado} sem preço na tabela` : ''}`} />
      <Indicador rotulo="Prazo em 7 dias" valor={resumo.vencendo} link={link('vencendo')}
        tom={resumo.vencendo ? 'alerta' : 'neutro'} apoio="Contestar antes de vencer" />
      <Indicador rotulo="Recuperado no mês" valor={moeda(resumo.recuperadoNoMes)} link={link('ACEITA')}
        tom={resumo.recuperadoNoMes ? 'positivo' : 'neutro'} apoio="Casos aceitos pela Porto" />
      <Indicador rotulo="Perdido no mês" valor={moeda(resumo.perdidoNoMes)} link={link('PERDIDA')}
        apoio="Casos que não voltaram" />
    </GradeIndicadores>

    <Painel titulo="Casos" aoLado={
      <div className="atalhos-periodo" role="group" aria-label="Filtrar casos">
        {(['abertos', 'A_CONTESTAR', 'CONTESTADA', 'ACEITA', 'PERDIDA', 'todas'] as Filtro[]).map(f =>
          <button key={f} type="button" aria-pressed={filtro === f}
            className={`atalho-periodo${filtro === f ? ' esta-marcado' : ''}`} onClick={() => escolher(f)}>
            {ROTULO_FILTRO[f]}
          </button>)}
      </div>}>
      {!visiveis.length
        ? <Vazio titulo={filtro === 'abertos' ? 'Nada para cobrar da Porto' : `Nenhum caso em "${ROTULO_FILTRO[filtro]}"`}
            descricao={filtro === 'abertos'
              ? 'Toda OS feita veio numa OP com o valor da tabela. Os casos aparecem aqui sozinhos quando isso muda.'
              : 'Escolha outro filtro acima.'} />
        : <div className="table-scroll tabela-rolagem"><table>
            <thead><tr>
              <th>OS</th><th>Socorrista</th><th>Motivo</th>
              <th className="th-numero">Esperado</th><th className="th-numero">Pago</th><th className="th-numero">Falta</th>
              <th>Prazo</th><th>Situação</th><th aria-label="Ações"></th>
            </tr></thead>
            <tbody>{visiveis.map(c => {
              const aberto = c.situacao === 'A_CONTESTAR' || c.situacao === 'CONTESTADA'
              const vencido = aberto && c.prazo !== null && c.prazo < hoje
              return <tr key={c.id}>
                <td><LinkOs numero={c.os.numero} />
                  <small className="celula-apoio">{[c.os.data ? data(c.os.data) : null, c.os.especialidade].filter(Boolean).join(' · ')}</small></td>
                <td><LinkSocorrista id={c.os.motoristaId} nome={c.os.motorista}>{curtos.get(c.os.motorista ?? '') ?? c.os.motorista}</LinkSocorrista>
                  <small className="celula-apoio"><LinkViatura sigla={c.os.viatura} /></small></td>
                <td>{c.tipo === 'NAO_PAGA' ? 'Não veio na OP'
                  : <>Pago a menos<small className="celula-apoio"><LinkOp numero={c.os.numeroOp} rotulo={`OP ${c.os.numeroOp}`} /></small></>}</td>
                <td className="col-numero">{c.valorEsperado === null ? <span className="celula-apoio">sem tabela</span> : moeda(c.valorEsperado)}</td>
                <td className="col-numero">{moeda(c.valorPago)}</td>
                <td className="col-numero"><strong>{c.diferenca === null ? '—' : moeda(c.diferenca)}</strong></td>
                <td className={vencido ? 'prazo-vencido' : undefined}>
                  {c.prazo ? data(c.prazo) : '—'}{vencido ? <small className="celula-apoio">vencido</small> : null}
                </td>
                <td>
                  <Etiqueta tom={SITUACAO[c.situacao].tom}>{SITUACAO[c.situacao].texto}</Etiqueta>
                  {c.protocolo ? <small className="celula-apoio">Protocolo {c.protocolo}</small> : null}
                  {c.situacao === 'ACEITA' && c.valorRecuperado !== null ? <small className="celula-apoio">voltou {moeda(c.valorRecuperado)}</small> : null}
                  {c.observacao ? <small className="celula-apoio" title={c.observacao}>{c.observacao}</small> : null}
                </td>
                <td className="acoes-contestacao">
                  {c.situacao === 'A_CONTESTAR'
                    ? <button type="button" className="button button-primary button-sm" onClick={() => setAcao({ tipo: 'contestar', caso: c })}>Contestei</button> : null}
                  {aberto
                    ? <>
                        <button type="button" className="button button-ghost button-sm" onClick={() => setAcao({ tipo: 'aceitar', caso: c })}>Pagou</button>
                        <button type="button" className="button button-ghost button-sm acao-recusar" onClick={() => setAcao({ tipo: 'perder', caso: c })}>Perdida</button>
                      </>
                    : <button type="button" className="button button-ghost button-sm" onClick={() => setAcao({ tipo: 'reabrir', caso: c })}>Reabrir</button>}
                </td>
              </tr>
            })}</tbody>
          </table></div>}
    </Painel>

    <TabelaDePrecos aoSalvar={() => void carregar(true)} />

    {acao ? <AcaoDoCaso acao={acao} hoje={hoje} aoFechar={() => setAcao(null)}
      aoConcluir={async mensagem => { setAcao(null); setAviso(mensagem); await carregar(false) }} /> : null}
  </div>
}

function AcaoDoCaso({ acao, hoje, aoFechar, aoConcluir }: {
  acao: Acao; hoje: string; aoFechar: () => void; aoConcluir: (mensagem: string) => Promise<void>
}) {
  const { caso } = acao
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [recuperado, setRecuperado] = useState(caso.diferenca ?? 0)
  const resumo: [string, string][] = [
    ['OS', caso.os.numero],
    ['Motivo', caso.tipo === 'NAO_PAGA' ? 'Não veio na OP' : 'Pago a menos'],
    ['Falta', caso.diferenca === null ? 'sem preço na tabela' : moeda(caso.diferenca)],
  ]

  if (acao.tipo === 'perder' || acao.tipo === 'reabrir') {
    return <ConfirmarAcao
      titulo={acao.tipo === 'perder' ? 'Dar este caso como perdido?' : 'Reabrir este caso?'}
      efeito={acao.tipo === 'perder'
        ? <>A diferença deixa de ser cobrada e entra em <strong>Perdido no mês</strong>. Dá para reabrir depois.</>
        : <>O caso volta para {caso.contestadaEm ? 'contestada' : 'a contestar'} e sai dos totais de recuperado e perdido.</>}
      resumo={resumo}
      textoConfirmar={acao.tipo === 'perder' ? 'Dar como perdido' : 'Reabrir'}
      perigo={acao.tipo === 'perder'}
      aoConfirmar={async () => {
        await atualizarContestacao(caso.id, { situacao: acao.tipo === 'perder' ? 'PERDIDA' : caso.contestadaEm ? 'CONTESTADA' : 'A_CONTESTAR' })
        await aoConcluir(acao.tipo === 'perder' ? `OS ${caso.os.numero} dada como perdida.` : `OS ${caso.os.numero} reaberta.`)
      }}
      aoFechar={aoFechar} />
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const texto = (nome: string) => String(f.get(nome) ?? '').trim() || null
    setSalvando(true); setErro('')
    try {
      if (acao.tipo === 'contestar') {
        await atualizarContestacao(caso.id, {
          situacao: 'CONTESTADA', protocolo: texto('protocolo'), contestadaEm: texto('data') ?? hoje,
          observacao: texto('observacao') ?? caso.observacao,
        })
        await aoConcluir(`OS ${caso.os.numero} marcada como contestada.`)
      } else {
        await atualizarContestacao(caso.id, { situacao: 'ACEITA', valorRecuperado: recuperado, observacao: texto('observacao') ?? caso.observacao })
        await aoConcluir(`OS ${caso.os.numero}: ${moeda(recuperado)} recuperados.`)
      }
    } catch (x) { setErro((x as Error).message) } finally { setSalvando(false) }
  }

  return <Modal etiqueta="Contestação" titulo={acao.tipo === 'contestar' ? `Contestei a OS ${caso.os.numero}` : `A Porto pagou a OS ${caso.os.numero}`} aoFechar={aoFechar}>
    <form className="form-grid two-columns" onSubmit={salvar}>
      <dl className="resumo-contestacao field-wide">
        {resumo.map(([r, v]) => <div key={r}><dt>{r}</dt><dd>{v}</dd></div>)}
      </dl>
      {acao.tipo === 'contestar'
        ? <>
            <Campo rotulo="Protocolo na Porto"><input name="protocolo" placeholder="Opcional" autoComplete="off" defaultValue={caso.protocolo ?? ''} /></Campo>
            <Campo rotulo="Contestada em"><input name="data" type="date" defaultValue={hoje} max={hoje} /></Campo>
          </>
        : <CampoValor rotulo="Quanto voltou" name="recuperado" className="field-wide" defaultValue={caso.diferenca ?? 0}
            exigirPositivo={false} onValor={setRecuperado}
            ajuda="O que a Porto pagou a mais por causa da contestação. Normalmente, a diferença inteira." />}
      <Campo rotulo="Observação" className="field-wide"><input name="observacao" placeholder="Opcional" autoComplete="off" /></Campo>
      {erro ? <div className="form-alert field-wide" role="alert">{erro}</div> : null}
      <AcoesModal aoCancelar={aoFechar}>
        <button className="button button-primary" disabled={salvando}>
          {salvando ? 'Salvando…' : acao.tipo === 'contestar' ? 'Marcar como contestada' : 'Registrar pagamento'}
        </button>
      </AcoesModal>
    </form>
  </Modal>
}

/**
 * Tabela de precos: o valor esperado de cada especialidade. Mostra as que a Porto
 * ja mandou, com o valor que ela mais pagou, para preencher sem adivinhar.
 */
function TabelaDePrecos({ aoSalvar }: { aoSalvar: () => void }) {
  const [lista, setLista] = useState<EspecialidadeVista[] | null>(null)
  const [aberta, setAberta] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState('')

  useEffect(() => {
    especialidadesVistas().then(l => { setLista(l); if (!l.some(e => e.valorTabela !== null)) setAberta(true) })
      .catch(e => setErro((e as Error).message))
  }, [])

  const semPreco = (lista ?? []).filter(e => e.valorTabela === null).length

  async function gravar(especialidade: string, valor: number | null) {
    setSalvando(especialidade); setErro('')
    try {
      await salvarPreco(especialidade, valor)
      setLista(l => (l ?? []).map(e => e.especialidade === especialidade ? { ...e, valorTabela: valor } : e))
      aoSalvar()
    } catch (e) { setErro((e as Error).message) } finally { setSalvando('') }
  }

  return <Painel titulo="Tabela de preços da Porto" etiqueta={semPreco ? `${semPreco} sem preço` : 'Completa'}
    aoLado={<button type="button" className="button button-ghost button-sm" aria-expanded={aberta}
      onClick={() => setAberta(a => !a)}>{aberta ? 'Recolher' : 'Editar preços'}</button>}>
    <p className="painel-apoio">
      É o valor que a Porto paga por especialidade. O sistema compara cada OS paga com esta tabela; sem preço, só aparecem as OS que não vieram na OP.
    </p>
    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
    {!aberta ? null : !lista ? <Carregando /> : !lista.length
      ? <Vazio titulo="Nenhuma especialidade ainda" descricao="Elas aparecem aqui depois da primeira importação da Porto." />
      : <div className="table-scroll"><table>
          <thead><tr><th>Especialidade</th><th className="th-numero">OS</th><th className="th-numero">Mais pago pela Porto</th><th>Preço da tabela</th></tr></thead>
          <tbody>{lista.map(e => <LinhaPreco key={e.especialidade} e={e} salvando={salvando === e.especialidade} aoGravar={gravar} />)}</tbody>
        </table></div>}
  </Painel>
}

function LinhaPreco({ e, salvando, aoGravar }: {
  e: EspecialidadeVista; salvando: boolean; aoGravar: (especialidade: string, valor: number | null) => Promise<void>
}) {
  const [valor, setValor] = useState(e.valorTabela ?? 0)
  // Troca a chave so quando o valor vem de fora (botao "mais pago"), para o campo
  // recomecar com ele; digitando, o campo continua o mesmo e nao perde o foco.
  const [semente, setSemente] = useState(0)
  const mudou = (e.valorTabela ?? 0) !== valor
  return <tr>
    <td>{e.especialidade}</td>
    <td className="col-numero">{e.servicos}</td>
    <td className="col-numero">
      {e.valorMaisComum === null ? '—' : <button type="button" className="link-dado botao-texto" title="Usar este valor"
        onClick={() => { setValor(e.valorMaisComum ?? 0); setSemente(n => n + 1) }}>{moeda(e.valorMaisComum)}</button>}
    </td>
    <td className="celula-preco">
      <CampoValor key={semente} rotulo={`Preço de ${e.especialidade}`} name={`preco-${e.especialidade}`} defaultValue={valor}
        exigirPositivo={false} onValor={setValor} className="campo-sem-rotulo" />
      <button type="button" className="button button-primary button-sm" disabled={!mudou || salvando}
        onClick={() => void aoGravar(e.especialidade, valor > 0 ? valor : null)}>{salvando ? 'Salvando…' : 'Salvar'}</button>
    </td>
  </tr>
}
