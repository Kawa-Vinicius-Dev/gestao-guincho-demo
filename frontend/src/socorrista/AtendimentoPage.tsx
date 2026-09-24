import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  MAXIMO_DE_FOTOS, meusAtendimentosDeHoje, registrarAtendimento, type MeuAtendimento,
} from '../dados/atendimentos'
import { BlocoFoto } from './BlocoFoto'
import { CampoAssinatura } from './CampoAssinatura'

/**
 * Registro do atendimento — a prova que o socorrista colhe no local
 * (Kawa, 24/09/2026). Tela de celular: grande, redonda e simples.
 *
 * So o numero da OS, a chegada e uma foto de antes sao obrigatorios; o resto
 * ajuda numa contestacao, mas nem sempre da (o segurado pode nao estar la).
 */

const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function paraCampoHora(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function GradeDeFotos({ id, rotulo, fotos, aoMudar }: {
  id: string; rotulo: string; fotos: File[]; aoMudar: (f: File[]) => void
}) {
  const vagas = Math.min(fotos.length + 1, MAXIMO_DE_FOTOS)
  return <div className="checklist">
    <div className="checklist-topo">
      <span className="socorrista-rotulo">{rotulo}</span>
      <span className={`checklist-contagem${fotos.length ? ' completa' : ''}`}>{fotos.length} de {MAXIMO_DE_FOTOS}</span>
    </div>
    <div className="checklist-grade">
      {Array.from({ length: vagas }, (_, i) =>
        <BlocoFoto key={i} id={`${id}-${i}`} rotulo={fotos[i] ? `Foto ${i + 1}` : i === 0 ? 'Tirar foto' : 'Mais uma'}
          arquivo={fotos[i]} aoEscolher={f => { const novas = [...fotos]; novas[i] = f; aoMudar(novas) }} />)}
    </div>
  </div>
}

export default function AtendimentoPage() {
  const [numeroOs, setNumeroOs] = useState('')
  const [chegada, setChegada] = useState<Date | null>(null)
  const [placa, setPlaca] = useState('')
  const [antes, setAntes] = useState<File[]>([])
  const [depois, setDepois] = useState<File[]>([])
  const [assinatura, setAssinatura] = useState<Blob | null>(null)
  const [nome, setNome] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState('')
  const [hoje, setHoje] = useState<MeuAtendimento[]>([])
  // Troca a chave para o campo de assinatura recomecar em branco depois de salvar.
  const [rodada, setRodada] = useState(0)

  const carregarHoje = useCallback(() => { meusAtendimentosDeHoje().then(setHoje).catch(() => setHoje([])) }, [])
  useEffect(carregarHoje, [carregarHoje])

  const falta = !numeroOs.trim() ? 'Digite o número da OS.'
    : !chegada ? 'Marque a chegada.'
    : !antes.length ? 'Tire pelo menos uma foto do veículo antes.' : ''

  async function salvar() {
    if (falta || !chegada) return
    setSalvando(true); setErro('')
    try {
      await registrarAtendimento({ numeroOs, chegadaEm: chegada, placa, nomeAssinante: nome, observacao, antes, depois, assinatura })
      setSalvo(numeroOs.trim())
      setNumeroOs(''); setChegada(null); setPlaca(''); setAntes([]); setDepois([]); setAssinatura(null)
      setNome(''); setObservacao(''); setRodada(r => r + 1)
      carregarHoje()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }

  return <div className="socorrista">
    <header className="socorrista-topo">
      <span className="socorrista-dia">Prova do atendimento</span>
      <h1>Atendimento</h1>
      <Link to="/turno" className="socorrista-qra">← Turno do dia</Link>
    </header>

    {salvo ? <section className="socorrista-cartao atendimento-salvo" role="status">
      <strong>✓ Atendimento da OS {salvo} salvo</strong>
      <span>As fotos ajudam a cobrar a Porto se ela não pagar esse serviço.</span>
    </section> : null}

    <section className="socorrista-cartao">
      <h2>Registrar atendimento</h2>

      <div className="socorrista-campo">
        <label htmlFor="numero-os">Número da OS</label>
        <input id="numero-os" className="atendimento-campo-grande" value={numeroOs} autoComplete="off"
          placeholder="Ex.: 5673329/26" onChange={e => setNumeroOs(e.target.value)} />
        <p className="socorrista-apoio">O número que aparece no app da Porto.</p>
      </div>

      <div className="socorrista-campo">
        <span className="socorrista-rotulo">Chegada no local</span>
        {chegada
          ? <div className="atendimento-chegada">
              <strong>Chegou às {hora(chegada)}</strong>
              <input type="time" aria-label="Corrigir a hora da chegada" value={paraCampoHora(chegada)}
                onChange={e => {
                  const [h, m] = e.target.value.split(':').map(Number)
                  if (Number.isNaN(h) || Number.isNaN(m)) return
                  const d = new Date(chegada); d.setHours(h, m, 0, 0); setChegada(d)
                }} />
            </div>
          : <button type="button" className="checklist-opcao atendimento-cheguei" onClick={() => setChegada(new Date())}>
              Cheguei agora
            </button>}
      </div>

      <div className="socorrista-campo">
        <label htmlFor="placa-segurado">Placa do veículo do segurado <span>opcional</span></label>
        <input id="placa-segurado" className="atendimento-campo-grande" value={placa} autoComplete="off"
          autoCapitalize="characters" placeholder="ABC1D23" onChange={e => setPlaca(e.target.value.toUpperCase())} />
      </div>

      <GradeDeFotos id="antes" rotulo="Fotos do veículo: antes" fotos={antes} aoMudar={setAntes} />
      <GradeDeFotos id="depois" rotulo="Fotos do veículo: depois" fotos={depois} aoMudar={setDepois} />

      <div className="socorrista-campo">
        <span className="socorrista-rotulo">Assinatura do segurado <span className="socorrista-apoio">opcional</span></span>
        <CampoAssinatura key={rodada} aoMudar={setAssinatura} />
        <input className="atendimento-campo-grande" value={nome} autoComplete="off" autoCapitalize="words"
          placeholder="Nome de quem assinou" aria-label="Nome de quem assinou" onChange={e => setNome(e.target.value)} />
      </div>

      <div className="socorrista-campo">
        <label htmlFor="observacao-atendimento">Observação <span>opcional</span></label>
        <input id="observacao-atendimento" className="atendimento-campo-grande" value={observacao} autoComplete="off"
          placeholder="Ex.: veículo já estava com o para-choque solto" onChange={e => setObservacao(e.target.value)} />
      </div>

      {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
      <div className="socorrista-rodape-acao">
        <button type="button" className="socorrista-acao" disabled={Boolean(falta) || salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar atendimento'}
        </button>
        {falta ? <p className="socorrista-apoio">{falta}</p> : null}
      </div>
    </section>

    {hoje.length
      ? <section className="socorrista-cartao">
          <h2>Seus atendimentos de hoje</h2>
          <ul className="socorrista-historico">
            {hoje.map(a => <li key={a.id}>
              <span className="socorrista-historico-dia">OS {a.numeroOs}</span>
              <span className="socorrista-historico-km">{hora(new Date(a.chegadaEm))}</span>
              <span className="socorrista-situacao situacao-aprovado">{a.fotos} {a.fotos === 1 ? 'foto' : 'fotos'}{a.assinado ? ' · assinado' : ''}</span>
            </li>)}
          </ul>
        </section>
      : null}
  </div>
}
