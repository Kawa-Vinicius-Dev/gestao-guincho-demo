import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { LinkSocorrista, LinkViatura } from '../components/LinksDeDado'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { Campo, Selecao } from '../components/Campos'
import { CampoValor } from '../components/CampoValor'
import { CampoArquivo } from '../components/CampoArquivo'
import { Carregando, ErroPagina, Vazio } from '../components/EstadoPagina'
import { Modal, AcoesModal } from '../components/Modal'
import { Etiqueta, GradeIndicadores, Indicador } from '../components/ui/Pagina'
import { listarMultas, quemEstavaNaViatura, registrarMulta, type Multa, type QuemDirigia } from '../dados/multas'
import { listarMotoristas } from '../dados/motoristas'
import { listarVeiculos } from '../dados/veiculos'
import type { Motorista, Veiculo } from '../types/modelos'
import { usePeriodoGlobal } from '../utils/periodoGlobal'
import { data, moeda } from '../utils/formatadores'

/**
 * Multas (Kawa, 15/10/2026): o administrador lanca a viatura, a data e a hora
 * da infracao; o sistema diz quem estava com ela pelo turno aberto naquele
 * horario. A multa entra como despesa a pagar, na data da infracao, no nome
 * dele e com o desconto da comissao ja marcado.
 */

const hora = (iso: string | null) => iso
  ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'agora'

function LancarMulta({ veiculos, motoristas, aoFechar, aoSalvar }: {
  veiculos: Veiculo[]; motoristas: Motorista[]; aoFechar: () => void; aoSalvar: (mensagem: string) => void
}) {
  const [veiculoId, setVeiculoId] = useState('')
  const [dia, setDia] = useState('')
  const [horario, setHorario] = useState('')
  const [valor, setValor] = useState(0)
  const [quem, setQuem] = useState<QuemDirigia[] | null>(null)
  const [motoristaId, setMotoristaId] = useState('')
  const [desconta, setDesconta] = useState(true)
  const [notificacao, setNotificacao] = useState<File | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Viatura, dia e hora preenchidos: pergunta ao banco quem estava com ela.
  useEffect(() => {
    setQuem(null)
    if (!veiculoId || !dia || !horario) return
    let valido = true
    quemEstavaNaViatura(Number(veiculoId), dia, horario)
      .then(lista => {
        if (!valido) return
        setQuem(lista)
        setMotoristaId(lista.length === 1 ? String(lista[0].motoristaId) : '')
      })
      .catch(e => { if (valido) setErro((e as Error).message) })
    return () => { valido = false }
  }, [veiculoId, dia, horario])

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const campos = new FormData(evento.currentTarget)
    setErro('')
    setSalvando(true)
    try {
      const { semNotificacao } = await registrarMulta({
        veiculoId: Number(veiculoId), data: dia, hora: horario, valor,
        auto: String(campos.get('auto') ?? ''),
        vencimento: String(campos.get('vencimento') ?? '') || null,
        motoristaId: Number(motoristaId) || null,
        descontaComissao: desconta && Boolean(motoristaId),
        observacoes: String(campos.get('observacoes') ?? ''),
        notificacao,
      })
      const nome = motoristas.find(m => m.id === Number(motoristaId))?.nome
      aoSalvar(`Multa de ${moeda(valor)} lançada${nome ? ` no nome de ${nome}` : ''}.`
        + (semNotificacao ? ` A foto da notificação não foi anexada: ${semNotificacao}` : ''))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const sozinho = quem?.length === 1 ? quem[0] : null

  return <Modal etiqueta="Viaturas" titulo="Lançar multa" aoFechar={aoFechar}>
    <form className="form-grid" onSubmit={e => void salvar(e)}>
      <Selecao rotulo="Viatura" required vazio="Escolha" value={veiculoId} onChange={e => setVeiculoId(e.target.value)}
        opcoes={veiculos.map(v => ({ valor: String(v.id), texto: v.placa ? `${v.identificacao} · ${v.placa}` : v.identificacao }))}/>
      <Campo rotulo="Data da infração"><input type="date" required value={dia} onChange={e => setDia(e.target.value)} /></Campo>
      <Campo rotulo="Hora da infração"><input type="time" required value={horario} onChange={e => setHorario(e.target.value)} /></Campo>
      <CampoValor rotulo="Valor" name="valor" required onValor={setValor} />
      <Campo rotulo="Número do auto de infração"><input name="auto" required autoComplete="off" /></Campo>
      <Campo rotulo="Vencimento" ajuda="Opcional: a data para pagar, da notificação."><input name="vencimento" type="date" /></Campo>

      <div className="field-wide multa-quem">
        {!veiculoId || !dia || !horario
          ? <p className="aprovacao-apoio">Escolha a viatura, a data e a hora para ver quem estava com ela.</p>
          : quem === null
            ? <p className="aprovacao-apoio">Procurando o turno…</p>
            : sozinho
              ? <p className="multa-achou" role="status">
                  <strong>{sozinho.socorrista}</strong> estava com a viatura
                  (turno de {hora(sozinho.abertoEm)} a {hora(sozinho.fechadoEm)}).
                </p>
              : <p className="aprovacao-apoio" role="alert">
                  {quem.length
                    ? 'Mais de um turno aberto nesse horário. Escolha quem estava dirigindo.'
                    : 'Ninguém estava com a viatura nesse horário. Escolha o socorrista, ou deixe só na viatura.'}
                </p>}
        {quem && !sozinho
          ? <Selecao rotulo="Socorrista" vazio="Só a viatura" value={motoristaId} onChange={e => setMotoristaId(e.target.value)}
              opcoes={(quem.length ? motoristas.filter(m => quem.some(q => q.motoristaId === m.id)) : motoristas)
                .map(m => ({ valor: String(m.id), texto: m.nome }))}/>
          : null}
        <label className="check-line">
          <input type="checkbox" checked={desconta && Boolean(motoristaId)} disabled={!motoristaId}
            onChange={e => setDesconta(e.target.checked)} />
          <span>Descontar da comissão de quem estava dirigindo</span>
        </label>
      </div>

      <div className="field-wide">
        <CampoArquivo rotulo="Foto da notificação (opcional)" accept="image/*,application/pdf"
          aoEscolher={setNotificacao} nome={notificacao?.name} />
      </div>
      <Campo rotulo="Observações" className="field-wide"><textarea name="observacoes" rows={2} /></Campo>

      {erro ? <div className="form-alert field-wide" role="alert">{erro}</div> : null}
      <AcoesModal aoCancelar={aoFechar}>
        <button type="submit" className="button button-primary" disabled={salvando || !veiculoId || quem === null}>
          {salvando ? 'Lançando…' : 'Lançar multa'}
        </button>
      </AcoesModal>
    </form>
  </Modal>
}

export default function MultasPage() {
  const [periodo, setPeriodo] = usePeriodoGlobal()
  const [multas, setMultas] = useState<Multa[] | null>(null)
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [motoristas, setMotoristas] = useState<Motorista[]>([])
  const [lancando, setLancando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    void Promise.all([listarVeiculos(), listarMotoristas()])
      .then(([v, m]) => { setVeiculos(v); setMotoristas(m) })
      .catch(() => {})
  }, [])

  const carregar = useCallback(() => {
    if (!periodo.inicio || !periodo.fim || periodo.inicio > periodo.fim) return
    setErro('')
    setMultas(null)
    listarMultas(periodo.inicio, periodo.fim).then(setMultas).catch(e => setErro((e as Error).message))
  }, [periodo.inicio, periodo.fim])
  useEffect(carregar, [carregar])

  const lista = multas ?? []
  const aPagar = lista.filter(m => m.situacao !== 'PAGO')
  const descontadas = lista.filter(m => m.descontaComissao)
  const soma = (l: Multa[]) => l.reduce((t, m) => t + m.valor, 0)

  return <div className="page-enter">
    <header className="page-heading"><div>
      <span className="eyebrow">Viaturas</span>
      <h1>Multas</h1>
      <p>Lance a multa com a viatura, a data e a hora: o sistema diz quem estava com ela pelo turno.</p>
    </div>
      <div className="heading-actions">
        <button type="button" className="button button-primary" onClick={() => { setMensagem(''); setLancando(true) }}>Lançar multa</button>
      </div>
    </header>

    <section className="panel painel-filtros"><form className="ledger-filters" onSubmit={e => e.preventDefault()}>
      <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/>
    </form></section>

    {mensagem ? <div className="success-notice" role="status">{mensagem}</div> : null}

    {erro ? <ErroPagina mensagem={erro} tentarNovamente={carregar}/>
      : !multas ? <Carregando/>
      : <>
          <GradeIndicadores>
            <Indicador rotulo="Multas no período" valor={lista.length} apoio={moeda(soma(lista))}/>
            <Indicador rotulo="A pagar" valor={aPagar.length} apoio={moeda(soma(aPagar))} tom={aPagar.length ? 'atencao' : 'neutro'}/>
            <Indicador rotulo="Descontadas da comissão" valor={descontadas.length} apoio={moeda(soma(descontadas))}/>
          </GradeIndicadores>

          {lista.length
            ? <section className="panel"><div className="table-scroll"><table>
                <thead><tr><th>Infração</th><th>Auto</th><th>Viatura</th><th>Quem dirigia</th><th>Valor</th><th>Vencimento</th><th>Situação</th><th>Comissão</th></tr></thead>
                <tbody>{lista.map(m => <tr key={m.id}>
                  <td>{data(m.data)}</td>
                  <td>{m.auto}</td>
                  <td>{m.veiculoId ? <LinkViatura id={m.veiculoId} sigla={m.viatura ?? ''}/> : '—'}</td>
                  <td>{m.motoristaId ? <LinkSocorrista id={m.motoristaId} nome={m.socorrista ?? ''}/> : 'Só a viatura'}</td>
                  <td>{moeda(m.valor)}</td>
                  <td>{m.vencimento ? data(m.vencimento) : '—'}</td>
                  <td>{m.situacao === 'PAGO'
                    ? <Etiqueta tom="ok">Paga</Etiqueta>
                    : <Etiqueta tom="atencao">A pagar</Etiqueta>}</td>
                  <td>{m.descontaComissao ? 'Desconta' : '—'}</td>
                </tr>)}</tbody>
              </table></div>
              <p className="aprovacao-apoio">Para registrar o pagamento, use o <Link to="/lancamentos">Extrato</Link>.</p>
              </section>
            : <Vazio titulo="Nenhuma multa no período" descricao="Lance a primeira em “Lançar multa”."/>}
        </>}

    {lancando
      ? <LancarMulta veiculos={veiculos} motoristas={motoristas} aoFechar={() => setLancando(false)}
          aoSalvar={texto => { setLancando(false); setMensagem(texto); carregar() }}/>
      : null}
  </div>
}
