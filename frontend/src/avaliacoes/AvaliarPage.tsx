import { useState, type FormEvent } from 'react'
import { MarcaJms } from '../components/MarcaJms'
import { avaliar } from '../dados/avaliacoes'

/**
 * Pagina publica, sem login: o cliente do guincho da a nota do atendimento
 * (03/11/2026). O link sai de Visao geral → Avaliacoes.
 */

const ROTULOS = ['', 'Muito ruim', 'Ruim', 'Regular', 'Bom', 'Ótimo']

export default function AvaliarPage() {
  const [nota, setNota] = useState(0)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviada, setEnviada] = useState(false)

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!nota) { setErro('Escolha de 1 a 5 estrelas.'); return }
    const campos = new FormData(evento.currentTarget)
    setErro(''); setEnviando(true)
    try {
      await avaliar({
        nota,
        nome: String(campos.get('nome') ?? ''),
        placa: String(campos.get('placa') ?? ''),
        comentario: String(campos.get('comentario') ?? ''),
      })
      setEnviada(true)
    } catch (e) { setErro((e as Error).message) }
    finally { setEnviando(false) }
  }

  return <main className="login-page">
    <section className="login-brand">
      <MarcaJms className="login-mark"/>
      <span className="eyebrow">J M S · guincho</span>
      <h1>Sua opinião faz a diferença.</h1>
      <p>Sua nota leva menos de um minuto e ajuda a gente a melhorar o socorro na estrada.</p>
    </section>
    <section className="login-panel">
      {enviada
        ? <div className="avaliar-obrigado" role="status">
            <span className="eyebrow">Avaliação enviada</span>
            <h2>Obrigado!</h2>
            <p>Recebemos sua nota de {nota} {nota === 1 ? 'estrela' : 'estrelas'}.</p>
          </div>
        : <form onSubmit={enviar}>
            <span className="eyebrow">Avaliação</span><h2>Como foi o atendimento?</h2>
            <p>Só a nota é obrigatória.</p>
            {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
            <fieldset className="estrelas">
              <legend>Nota</legend>
              {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" aria-pressed={nota === n}
                aria-label={`${n} – ${ROTULOS[n]}`} className={n <= nota ? 'estrela estrela-acesa' : 'estrela'}
                onClick={() => setNota(n)}>★</button>)}
              <span className="estrelas-rotulo">{ROTULOS[nota]}</span>
            </fieldset>
            <label className="field"><span>Seu nome</span><input id="nome" name="nome" maxLength={80} autoComplete="name"/></label>
            <label className="field"><span>Placa do veículo</span><input id="placa" name="placa" maxLength={10} autoCapitalize="characters"/></label>
            <label className="field"><span>Comentário</span><textarea id="comentario" name="comentario" rows={4} maxLength={1000}/></label>
            <button className="button button-primary button-block" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar avaliação'}</button>
          </form>}
    </section>
  </main>
}
