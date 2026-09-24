import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmarAcao } from '../components/ConfirmarAcao'
import { Carregando, ErroPagina } from '../components/EstadoPagina'
import {
  lancarServico, meuTurnoDoDia, removerServico, servicosDoTurno, somaDosKm,
  type ServicoDoTurno, type TurnoAberto,
} from '../dados/turnos'

/**
 * Servicos do turno, no celular do socorrista (Kawa, 24/09/2026).
 *
 * Para cada servico: o numero da OS (ele tem no app da Porto) e o km que o GPS
 * marcou, da saida para o chamado ate a entrega. A soma e o km produtivo do
 * turno; o resto do que o caminhao rodou e km morto. Sem aprovacao: divergencia
 * grande o operador confere no sistema da Porto.
 */

const km = (valor: number) => `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`

/** "12,5" ou "12.5" viram 12.5; o resto do que nao e numero sai. */
function lerKm(texto: string) {
  const limpo = texto.replace(/[^\d,.]/g, '').replace(',', '.')
  return limpo ? Number(limpo) : NaN
}

export default function ServicosPage() {
  const [turno, setTurno] = useState<TurnoAberto | null | undefined>(undefined)
  const [servicos, setServicos] = useState<ServicoDoTurno[]>([])
  const [erro, setErro] = useState('')
  const [numero, setNumero] = useState('')
  const [kmDigitado, setKmDigitado] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [falha, setFalha] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [tirando, setTirando] = useState<ServicoDoTurno | null>(null)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const dados = await meuTurnoDoDia()
      setTurno(dados.turnoAberto ?? null)
      setServicos(dados.turnoAberto ? await servicosDoTurno([dados.turnoAberto.id]) : [])
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  if (erro) return <ErroPagina mensagem={erro} tentarNovamente={() => void carregar()} />
  if (turno === undefined) return <Carregando />

  const valor = lerKm(kmDigitado)
  const pronto = numero.trim().length > 0 && valor > 0 && !salvando

  async function lancar(evento: FormEvent) {
    evento.preventDefault()
    if (!pronto) return
    setSalvando(true)
    setFalha('')
    setMensagem('')
    try {
      const jaTinha = servicos.some(s => s.numeroOs === numero.trim())
      await lancarServico(numero, valor)
      setMensagem(`OS ${numero.trim()} ${jaTinha ? 'corrigida' : 'lançada'}: ${km(valor)}.`)
      setNumero('')
      setKmDigitado('')
      await carregar()
    } catch (e) {
      setFalha((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const total = somaDosKm(servicos)

  return <div className="socorrista">
    <header className="socorrista-topo">
      <span className="socorrista-dia">Turno do dia</span>
      <h1>Km dos serviços</h1>
    </header>

    {!turno
      ? <section className="socorrista-cartao">
          <h2>Nenhum turno aberto</h2>
          <p className="socorrista-intro">Os serviços entram no turno do dia. Abra o turno primeiro.</p>
          <Link to="/turno" className="socorrista-acao servicos-ir-turno">Ir para o turno</Link>
        </section>
      : <>
          <form className="socorrista-cartao" onSubmit={e => void lancar(e)}>
            <h2>Lançar serviço</h2>
            <p className="socorrista-intro">
              O km que o GPS marcou, da saída para o chamado até a entrega do veículo.
            </p>

            <div className="socorrista-campo">
              <label htmlFor="servico-os">Número da OS</label>
              <input id="servico-os" className="servico-numero" type="text" inputMode="numeric"
                autoComplete="off" placeholder="Ex.: 1234567-26"
                value={numero} onChange={e => setNumero(e.target.value)} />
            </div>

            <div className="socorrista-campo">
              <label htmlFor="servico-km">Km do serviço</label>
              <div className="socorrista-odometro-caixa">
                <input id="servico-km" className="socorrista-odometro" type="text" inputMode="decimal"
                  autoComplete="off" value={kmDigitado}
                  onChange={e => setKmDigitado(e.target.value.replace(/[^\d,.]/g, ''))} />
                <span className="socorrista-odometro-unidade" aria-hidden="true">km</span>
              </div>
            </div>

            {falha ? <p className="socorrista-alerta" role="alert">{falha}</p> : null}
            {mensagem ? <p className="socorrista-apoio servicos-lancado" role="status">{mensagem}</p> : null}

            <div className="socorrista-rodape-acao">
              <button type="submit" className="socorrista-acao" disabled={!pronto}>
                {salvando ? 'Lançando…' : 'Lançar serviço'}
              </button>
              <p className="socorrista-apoio">A mesma OS de novo corrige o km.</p>
            </div>
          </form>

          <section className="socorrista-cartao">
            <h2>Lançados no turno</h2>
            {servicos.length
              ? <>
                  <ul className="socorrista-historico servicos-lista">
                    {servicos.map(s => <li key={s.id}>
                      <span className="socorrista-historico-dia">OS {s.numeroOs}</span>
                      <span className="socorrista-historico-km">{km(s.km)}</span>
                      <button type="button" className="servicos-tirar" onClick={() => setTirando(s)}>Tirar</button>
                    </li>)}
                  </ul>
                  <p className="servicos-total">
                    <span>{servicos.length} {servicos.length === 1 ? 'serviço' : 'serviços'}</span>
                    <strong>{km(total)}</strong>
                  </p>
                </>
              : <p className="socorrista-intro">Nenhum serviço lançado neste turno.</p>}
          </section>
        </>}

    {tirando
      ? <ConfirmarAcao
          titulo="Tirar o serviço?"
          efeito={`Os ${km(tirando.km)} da OS ${tirando.numeroOs} saem da soma do turno.`}
          textoConfirmar="Tirar"
          aoConfirmar={async () => {
            await removerServico(tirando.id)
            setMensagem('')
            await carregar()
          }}
          aoFechar={() => setTirando(null)}
        />
      : null}
  </div>
}
