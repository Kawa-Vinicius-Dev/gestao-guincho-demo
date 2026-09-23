import { useEffect, useState, type FormEvent } from 'react'
import { ConfirmarAcao } from '../components/ConfirmarAcao'
import { definirPercentualPadrao, lerPercentualPadrao } from '../dados/comissoes'

const emPorcento = (p: number) => `${String(Math.round(p * 1000) / 10).replace('.', ',')}%`

/**
 * A comissao padrao da empresa (hoje 20%), editavel.
 *
 * Kawa, 22/09/2026: "como o padrao hoje e 20, eu quero que seja editavel". Vale
 * para quem nao tem % propria e para as OPs sem % definida em Comissoes. OP que
 * ja fechou guarda a taxa dela; so o que nao fechou muda.
 */
export function ComissaoPadrao() {
  const [atual, setAtual] = useState<number | null>(null)
  const [novo, setNovo] = useState<number | null>(null)
  const [erro, setErro] = useState(''), [mensagem, setMensagem] = useState('')

  useEffect(() => { lerPercentualPadrao().then(setAtual).catch((e: Error) => setErro(e.message)) }, [])

  function pedir(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setErro(''); setMensagem('')
    const digitado = String(new FormData(evento.currentTarget).get('padrao') || '').replace(',', '.')
    const percentual = Number(digitado) / 100
    if (!(percentual > 0) || percentual > 0.2) { setErro('A comissão tem que ficar entre 0 e 20%.'); return }
    setNovo(percentual)
  }

  return <section className="panel settings-card">
    <header><h2>Comissão padrão</h2>
      <p>Vale para quem não tem porcentagem própria e para as OPs sem porcentagem definida em Comissões.</p></header>
    {atual === null ? null : <form onSubmit={pedir} className="form-grid">
      <label className="field"><span>Comissão padrão (%)</span>
        <input name="padrao" type="number" min="0" max="20" step="0.5" inputMode="decimal" required
          key={atual} defaultValue={String(Math.round(atual * 1000) / 10)}/>
        <small>Máximo de 20%.</small>
      </label>
      {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
      {mensagem ? <div className="success-notice">{mensagem}</div> : null}
      <button className="button button-primary">Salvar comissão padrão</button>
    </form>}
    {novo !== null && atual !== null ? <ConfirmarAcao
      titulo="Mudar a comissão padrão?"
      efeito={<>As OPs que <strong>ainda não fecharam</strong> passam a calcular com {emPorcento(novo)}. As que já fecharam
        continuam com a porcentagem da época, e as OPs com porcentagem própria não mudam.</>}
      resumo={[['De', emPorcento(atual)], ['Para', emPorcento(novo)]]}
      textoConfirmar="Mudar comissão padrão"
      aoConfirmar={async () => {
        await definirPercentualPadrao(novo)
        setAtual(novo); setMensagem(`Comissão padrão agora é ${emPorcento(novo)}.`)
      }}
      aoFechar={() => setNovo(null)}/> : null}
  </section>
}
