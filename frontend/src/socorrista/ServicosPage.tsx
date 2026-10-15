import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmarAcao } from '../components/ConfirmarAcao'
import { Carregando, ErroPagina } from '../components/EstadoPagina'
import { BotaoFoto } from './BlocoFoto'
import {
  emAndamento, enviarFotoInicioServico, finalizarServico, iniciarServico, meuTurnoDoDia, obterLocalizacao,
  removerServico, servicosDoTurno, somaDosKm, type Localizacao, type ServicoDoTurno, type TurnoAberto,
} from '../dados/turnos'
import { mascararOs, osCompleta } from '../dados/porto/importacao'

/**
 * Km dos servicos, no celular do socorrista.
 *
 * Kawa, 15/10/2026: em cada servico ele aponta o odometro duas vezes, com foto:
 * ao sair para o chamado ("Iniciar servico", com o numero da OS) e na entrega
 * ("Finalizar servico"). O km do servico e final - inicial. A soma dos servicos
 * e o km em servico do turno; o resto do que a viatura rodou e km morto.
 * Um servico por vez. Data, hora e local sao do proprio celular, na hora.
 */

const km = (valor: number) => `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
const hora = (iso?: string | null) => iso
  ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''

/** Guarda so os digitos; a tela mostra com ponto de milhar, como no turno. */
const lerKm = (digitos: string) => (digitos ? Number(digitos) : NaN)

const avisoDoLocal = (local: Localizacao) => !('semLocal' in local) ? ''
  : local.semLocal === 'NEGADA'
    ? ' Sem localização: o celular não deu permissão.'
    : ' Sem localização: o celular não conseguiu achar.'

function CampoKm({ id, rotulo, valor, aoMudar }: { id: string; rotulo: string; valor: string; aoMudar: (v: string) => void }) {
  return <div className="socorrista-campo">
    <label htmlFor={id}>{rotulo}</label>
    <div className="socorrista-odometro-caixa">
      <input id={id} className="socorrista-odometro" type="text" inputMode="numeric" autoComplete="off"
        value={valor ? new Intl.NumberFormat('pt-BR').format(Number(valor)) : ''}
        onChange={e => aoMudar(e.target.value.replace(/\D/g, '').slice(0, 9))} />
      <span className="socorrista-odometro-unidade" aria-hidden="true">km</span>
    </div>
  </div>
}

export default function ServicosPage() {
  const [turno, setTurno] = useState<TurnoAberto | null | undefined>(undefined)
  const [servicos, setServicos] = useState<ServicoDoTurno[]>([])
  const [erro, setErro] = useState('')
  const [numero, setNumero] = useState('')
  const [kmDigitado, setKmDigitado] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [falha, setFalha] = useState('')
  const [etapa, setEtapa] = useState('')
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

  const atual = servicos.find(emAndamento)
  const valor = lerKm(kmDigitado)
  const ocupado = etapa !== ''
  const limpar = () => { setNumero(''); setKmDigitado(''); setFoto(null) }

  async function executar(acao: () => Promise<string>) {
    setFalha('')
    setMensagem('')
    try {
      setMensagem(await acao())
      limpar()
    } catch (e) {
      setFalha((e as Error).message)
    } finally {
      setEtapa('')
      await carregar()
    }
  }

  function iniciar(evento: FormEvent) {
    evento.preventDefault()
    if (!turno || !osCompleta(numero) || !(valor >= 0) || !foto || ocupado) return
    void executar(async () => {
      setEtapa('Pegando a localização…')
      const local = await obterLocalizacao()
      setEtapa('Enviando…')
      await iniciarServico({ turnoId: turno.id, numeroOs: numero, kmInicial: valor, foto, local })
      return `Serviço da OS ${numero.trim()} iniciado.${avisoDoLocal(local)}`
    })
  }

  function finalizar(evento: FormEvent) {
    evento.preventDefault()
    if (!turno || !atual || !(valor >= 0) || !foto || ocupado) return
    void executar(async () => {
      setEtapa('Pegando a localização…')
      const local = await obterLocalizacao()
      setEtapa('Enviando…')
      const rodado = await finalizarServico({ turnoId: turno.id, servicoId: atual.id, kmFinal: valor, foto, local })
      return `Serviço da OS ${atual.numeroOs} finalizado: ${km(rodado)}.${avisoDoLocal(local)}`
    })
  }

  function reenviarFoto() {
    if (!turno || !atual || !foto || ocupado) return
    void executar(async () => {
      setEtapa('Enviando…')
      await enviarFotoInicioServico(turno.id, atual.id, foto)
      return 'Foto enviada.'
    })
  }

  const total = somaDosKm(servicos)
  const concluidos = servicos.filter(s => s.km != null)
  const previa = atual?.kmInicial != null && valor >= atual.kmInicial ? valor - atual.kmInicial : null

  return <div className="socorrista">
    <header className="socorrista-topo">
      <span className="socorrista-dia">Turno do dia</span>
      <h1>Km dos serviços</h1>
    </header>

    {!turno
      ? <section className="socorrista-cartao">
          <h2>Nenhum turno aberto</h2>
          <p className="socorrista-intro">Abra o turno antes de registrar os serviços.</p>
          <Link to="/turno" className="socorrista-acao servicos-ir-turno">Ir para o turno</Link>
        </section>
      : atual
        ? atual.fotoInicio
          ? <form className="socorrista-cartao" onSubmit={finalizar}>
              <h2>Serviço em andamento</h2>
              <p className="socorrista-intro">
                OS <strong>{atual.numeroOs}</strong> · início às {hora(atual.iniciadoEm)} com {km(atual.kmInicial ?? 0)}.
              </p>
              <CampoKm id="servico-km-final" rotulo="Quilometragem do painel agora" valor={kmDigitado} aoMudar={setKmDigitado}/>
              {previa != null ? <p className="socorrista-apoio">Este serviço: <strong>{km(previa)}</strong></p> : null}
              <BotaoFoto id="servico-foto-fim" rotulo="Foto do painel" arquivo={foto} aoEscolher={setFoto} obrigatoria/>
              {falha ? <p className="socorrista-alerta" role="alert">{falha}</p> : null}
              {mensagem ? <p className="socorrista-apoio servicos-lancado" role="status">{mensagem}</p> : null}
              <div className="socorrista-rodape-acao">
                <button type="submit" className="socorrista-acao" disabled={!(valor >= 0) || !foto || ocupado}>
                  {etapa || 'Finalizar serviço'}
                </button>
              </div>
            </form>
          : <section className="socorrista-cartao">
              <h2>Falta a foto do início</h2>
              <p className="socorrista-intro">
                O serviço da OS <strong>{atual.numeroOs}</strong> foi iniciado, mas a foto do painel não chegou.
                Envie a foto para poder finalizar.
              </p>
              <BotaoFoto id="servico-foto-inicio-reenvio" rotulo="Foto do painel" arquivo={foto} aoEscolher={setFoto} obrigatoria/>
              {falha ? <p className="socorrista-alerta" role="alert">{falha}</p> : null}
              <div className="socorrista-rodape-acao">
                <button type="button" className="socorrista-acao" disabled={!foto || ocupado} onClick={reenviarFoto}>
                  {etapa || 'Enviar foto'}
                </button>
              </div>
            </section>
        : <form className="socorrista-cartao" onSubmit={iniciar}>
            <h2>Novo serviço</h2>
            <p className="socorrista-intro">Ao sair para o chamado, registre a OS e a quilometragem do painel.</p>
            <div className="socorrista-campo">
              <label htmlFor="servico-os">Número da OS</label>
              <input id="servico-os" className="servico-numero" type="text" inputMode="numeric"
                autoComplete="off" placeholder="01/4312215-26"
                value={numero} onChange={e => setNumero(mascararOs(e.target.value))} />
            </div>
            <CampoKm id="servico-km-inicial" rotulo="Quilometragem do painel" valor={kmDigitado} aoMudar={setKmDigitado}/>
            <BotaoFoto id="servico-foto-inicio" rotulo="Foto do painel" arquivo={foto} aoEscolher={setFoto} obrigatoria/>
            {falha ? <p className="socorrista-alerta" role="alert">{falha}</p> : null}
            {mensagem ? <p className="socorrista-apoio servicos-lancado" role="status">{mensagem}</p> : null}
            <div className="socorrista-rodape-acao">
              <button type="submit" className="socorrista-acao"
                disabled={!osCompleta(numero) || !(valor >= 0) || !foto || ocupado}>
                {etapa || 'Iniciar serviço'}
              </button>
            </div>
          </form>}

    {turno
      ? <section className="socorrista-cartao">
          <h2>Serviços do turno</h2>
          {servicos.length
            ? <>
                <ul className="socorrista-historico servicos-lista">
                  {servicos.map(s => <li key={s.id}>
                    <span className="socorrista-historico-dia">OS {s.numeroOs}</span>
                    <span className="socorrista-historico-km">{s.km != null ? km(s.km) : 'em andamento'}</span>
                    <button type="button" className="servicos-tirar" onClick={() => setTirando(s)}>Tirar</button>
                  </li>)}
                </ul>
                <p className="servicos-total">
                  <span>{concluidos.length} {concluidos.length === 1 ? 'serviço finalizado' : 'serviços finalizados'}</span>
                  <strong>{km(total)}</strong>
                </p>
              </>
            : <p className="socorrista-intro">Nenhum serviço neste turno.</p>}
        </section>
      : null}

    {tirando
      ? <ConfirmarAcao
          titulo="Tirar o serviço?"
          efeito={tirando.km != null
            ? `Os ${km(tirando.km)} da OS ${tirando.numeroOs} saem da soma do turno.`
            : `O serviço da OS ${tirando.numeroOs} é cancelado.`}
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
