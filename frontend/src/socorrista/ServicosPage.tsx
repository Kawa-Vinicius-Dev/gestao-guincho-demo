import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmarAcao } from '../components/ConfirmarAcao'
import { Carregando, ErroPagina } from '../components/EstadoPagina'
import { BotaoFoto } from './BlocoFoto'
import {
  enviarFotoInicioServico, meuTurnoDoDia, obterLocalizacao,
  removerServico, servicosDoTurno, type Localizacao, type ServicoDoTurno, type TurnoAberto,
} from '../dados/turnos'
import {
  combinarComFila, ehSemRede, emAndamentoNaTela, finalizarOuEnfileirar, iniciarOuEnfileirar, type ServicoNaTela,
} from '../dados/filaOffline'
import { useFilaOffline } from './useFilaOffline'
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

/**
 * Ultimo estado que o banco deu. Sem sinal, a tela abre com ele (e com o que esta
 * na fila) em vez de um erro: o socorrista precisa conseguir registrar o servico
 * justamente quando nao ha sinal. Fica na aba, como a sessao.
 */
const CHAVE_CACHE = 'fluxo-gestao:servicos:v1'
type Estado = { turno: TurnoAberto | null; servicos: ServicoDoTurno[] }
const guardarEstado = (e: Estado) => { try { sessionStorage.setItem(CHAVE_CACHE, JSON.stringify(e)) } catch { /* sem cache */ } }
const lerEstado = (): Estado | null => {
  try { const t = sessionStorage.getItem(CHAVE_CACHE); return t ? JSON.parse(t) as Estado : null } catch { return null }
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
  const [tirando, setTirando] = useState<ServicoNaTela | null>(null)
  const [semSinal, setSemSinal] = useState(false)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const dados = await meuTurnoDoDia()
      const lista = dados.turnoAberto ? await servicosDoTurno([dados.turnoAberto.id]) : []
      setTurno(dados.turnoAberto ?? null)
      setServicos(lista)
      setSemSinal(false)
      guardarEstado({ turno: dados.turnoAberto ?? null, servicos: lista })
    } catch (e) {
      // Sem sinal nao e erro da tela: segue com o ultimo estado conhecido, para
      // nao jogar fora a foto e o km que a pessoa acabou de preencher.
      const guardado = ehSemRede(e) ? lerEstado() : null
      if (guardado) {
        setTurno(guardado.turno); setServicos(guardado.servicos); setSemSinal(true)
        return
      }
      setErro((e as Error).message)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])
  const { usuarioId, itens: naFila, enviar } = useFilaOffline(() => void carregar())

  if (erro) return <ErroPagina mensagem={erro} tentarNovamente={() => void carregar()} />
  if (turno === undefined) return <Carregando />

  const lista = combinarComFila(servicos, naFila)
  const atual = lista.find(emAndamentoNaTela)
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
    if (!turno || !usuarioId || !osCompleta(numero) || !(valor >= 0) || inicioMenorQueOUltimo || !foto || ocupado) return
    // A hora e a do toque no botao, nao a do fim da espera pelo GPS nem a do envio.
    const ocorridoEm = new Date().toISOString()
    void executar(async () => {
      setEtapa('Pegando a localização…')
      const local = await obterLocalizacao()
      setEtapa('Enviando…')
      const { enfileirado } = await iniciarOuEnfileirar({
        usuarioId, turnoId: turno.id, numeroOs: numero, kmInicial: valor, foto, local, ocorridoEm,
      })
      if (enfileirado) void enviar()
      return enfileirado
        ? `Sem sinal. O serviço da OS ${numero.trim()} ficou salvo no celular e vai sozinho quando o sinal voltar.${avisoDoLocal(local)}`
        : `Serviço da OS ${numero.trim()} iniciado.${avisoDoLocal(local)}`
    })
  }

  function finalizar(evento: FormEvent) {
    evento.preventDefault()
    if (!turno || !usuarioId || !atual || !(valor >= 0) || fimMenorQueOInicio || !foto || ocupado) return
    const ocorridoEm = new Date().toISOString()
    void executar(async () => {
      setEtapa('Pegando a localização…')
      const local = await obterLocalizacao()
      setEtapa('Enviando…')
      const r = await finalizarOuEnfileirar({
        usuarioId, turnoId: turno.id, servicoId: atual.id, refInicio: atual.seq, kmFinal: valor, foto, local, ocorridoEm,
      })
      if (r.enfileirado) void enviar()
      return r.enfileirado
        ? `Serviço da OS ${atual.numeroOs} finalizado: ${km(valor - (atual.kmInicial ?? 0))}. Ficou salvo no celular e vai sozinho quando o sinal voltar.${avisoDoLocal(local)}`
        : `Serviço da OS ${atual.numeroOs} finalizado: ${km(r.rodado ?? 0)}.${avisoDoLocal(local)}`
    })
  }

  function reenviarFoto() {
    if (!turno || atual?.id == null || !foto || ocupado) return
    const servicoId = atual.id
    void executar(async () => {
      setEtapa('Enviando…')
      await enviarFotoInicioServico(turno.id, servicoId, foto)
      return 'Foto enviada.'
    })
  }

  const concluidos = lista.filter(s => s.km != null)
  const total = Math.round(concluidos.reduce((soma, s) => soma + (s.km ?? 0), 0) * 10) / 10
  const previa = atual?.kmInicial != null && valor >= atual.kmInicial ? valor - atual.kmInicial : null
  // O odometro nao volta (o banco recusa): nem para antes do inicio do turno, nem
  // para antes do fim do ultimo servico. A tela avisa na hora, antes de gastar a
  // espera da localizacao e o envio da foto para so entao receber a recusa.
  const minimoParaIniciar = Math.max(turno?.hodometroInicial ?? 0, ...lista.map(s => s.kmFinal ?? 0))
  const inicioMenorQueOUltimo = !atual && valor < minimoParaIniciar
  const fimMenorQueOInicio = atual?.kmInicial != null && valor < atual.kmInicial

  return <div className="socorrista">
    <header className="socorrista-topo">
      <span className="socorrista-dia">Turno do dia</span>
      <h1>Km dos serviços</h1>
    </header>
    {semSinal
      ? <p className="socorrista-apoio" role="status">Sem sinal. Você pode registrar normalmente: o que ficar salvo vai sozinho quando o sinal voltar.</p>
      : null}

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
              {fimMenorQueOInicio
                ? <p className="socorrista-alerta" role="alert">
                    Menor que a quilometragem do início deste serviço ({km(atual.kmInicial ?? 0)}). Confira o painel.
                  </p>
                : null}
              <BotaoFoto id="servico-foto-fim" rotulo="Foto do painel" arquivo={foto} aoEscolher={setFoto} obrigatoria/>
              {falha ? <p className="socorrista-alerta" role="alert">{falha}</p> : null}
              {mensagem ? <p className="socorrista-apoio servicos-lancado" role="status">{mensagem}</p> : null}
              <div className="socorrista-rodape-acao">
                <button type="submit" className="socorrista-acao" disabled={!(valor >= 0) || fimMenorQueOInicio || !foto || ocupado}>
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
            {inicioMenorQueOUltimo
              ? <p className="socorrista-alerta" role="alert">
                  Menor que o último registro do turno ({km(minimoParaIniciar)}). Confira o painel.
                </p>
              : null}
            <BotaoFoto id="servico-foto-inicio" rotulo="Foto do painel" arquivo={foto} aoEscolher={setFoto} obrigatoria/>
            {falha ? <p className="socorrista-alerta" role="alert">{falha}</p> : null}
            {mensagem ? <p className="socorrista-apoio servicos-lancado" role="status">{mensagem}</p> : null}
            <div className="socorrista-rodape-acao">
              <button type="submit" className="socorrista-acao"
                disabled={!osCompleta(numero) || !(valor >= 0) || inicioMenorQueOUltimo || !foto || ocupado}>
                {etapa || 'Iniciar serviço'}
              </button>
            </div>
          </form>}

    {turno
      ? <section className="socorrista-cartao">
          <h2>Serviços do turno</h2>
          {lista.length
            ? <>
                <ul className="socorrista-historico servicos-lista">
                  {lista.map(s => <li key={s.chave}>
                    <span className="socorrista-historico-dia">
                      OS {s.numeroOs}
                      {s.pendente ? <small className="servicos-pendente">aguardando envio</small> : null}
                    </span>
                    <span className="socorrista-historico-km">{s.km != null ? km(s.km) : 'em andamento'}</span>
                    {s.pendente || s.id == null
                      ? <span aria-hidden="true"/>
                      : <button type="button" className="servicos-tirar" onClick={() => setTirando(s)} aria-label={`Remover o serviço da OS ${s.numeroOs}`}>Remover</button>}
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
          titulo="Remover o serviço?"
          efeito={tirando.km != null
            ? `Os ${km(tirando.km)} da OS ${tirando.numeroOs} saem da soma do turno.`
            : `O serviço da OS ${tirando.numeroOs} é cancelado.`}
          textoConfirmar="Remover"
          aoConfirmar={async () => {
            await removerServico(tirando.id as number)
            setMensagem('')
            await carregar()
          }}
          aoFechar={() => setTirando(null)}
        />
      : null}
  </div>
}
