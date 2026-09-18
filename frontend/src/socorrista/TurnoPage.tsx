import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ConfirmarAcao } from '../components/ConfirmarAcao'
import { Carregando, ErroPagina } from '../components/EstadoPagina'
import {
  abrirTurno, enviarFotoAbertura, fecharTurno, meuTurnoDoDia,
  type MeuTurnoDoDia, type ViaturaDoTurno,
} from '../dados/turnos'

/**
 * Turno do dia — a tela que o socorrista abre no celular.
 *
 * Ela e o inicio do sistema para quem esta na rua: ao entrar, ele cai aqui. Por
 * isso o desenho e diferente do resto do sistema, que e de escritorio. Aqui vale
 * uma acao por tela, alvo de toque grande, contraste alto e teclado numerico —
 * quem usa esta em pe, ao lado da viatura, com uma mao no celular e sol na tela.
 *
 * O estado manda no que aparece:
 *   sem turno aberto   -> abrir turno (viatura + odometro + foto, tudo obrigatorio)
 *   aberto sem foto    -> enviar a foto da saida, que falhou no envio
 *   turno aberto       -> fechar turno (odometro + foto obrigatoria)
 *   turno devolvido    -> corrigir e reenviar, com o motivo do administrador
 *
 * Nada aqui vira km oficial: o que ele fecha fica aguardando aprovacao.
 */

function apenasNumero(texto: string) {
  return texto.replace(/[^\d]/g, '')
}

/**
 * A tela e dele: o nome completo em caixa alta, como vem do cadastro, ocupava
 * duas linhas de titulo e empurrava o turno para baixo da dobra. O primeiro nome
 * identifica sem custar altura.
 */
function primeiroNome(nome: string) {
  const parte = nome.trim().split(/\s+/)[0] ?? nome
  return parte.charAt(0) + parte.slice(1).toLowerCase()
}

function formatarKm(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return '—'
  return `${new Intl.NumberFormat('pt-BR').format(valor)} km`
}

/**
 * Quanto o numero digitado foge do ultimo registro da viatura. Nao bloqueia —
 * painel trocado existe —, mas avisa: odometro menor que o ultimo, ou muitos
 * mil km acima, e quase sempre um digito trocado ou a mais.
 */
const SALTO_SUSPEITO_KM = 1500

function avisoDoOdometro(digitado: number | null, referencia: number | null | undefined) {
  if (digitado === null || referencia === null || referencia === undefined) return null
  if (digitado < referencia) {
    return `Menor que o último registro desta viatura (${formatarKm(referencia)}). Confira o número.`
  }
  if (digitado - referencia > SALTO_SUSPEITO_KM) {
    return `${formatarKm(digitado - referencia)} acima do último registro. Confira se não sobrou um dígito.`
  }
  return null
}

function CampoOdometro({
  id, rotulo, valor, aoMudar, apoio, aviso,
}: {
  id: string; rotulo: string; valor: string
  aoMudar: (v: string) => void; apoio?: string; aviso?: string | null
}) {
  return <div className="socorrista-campo">
    <label htmlFor={id}>{rotulo}</label>
    <div className={`socorrista-odometro-caixa${aviso ? ' com-aviso' : ''}`}>
      <input
        id={id}
        className="socorrista-odometro"
        // Teclado numerico no celular sem perder o comportamento de texto: `type
        // number` no Android aceita vírgula, sinal e notacao cientifica, e o
        // odometro nao tem nada disso.
        type="text" inputMode="numeric" autoComplete="off"
        aria-describedby={`${id}-apoio`}
        value={valor ? new Intl.NumberFormat('pt-BR').format(Number(valor)) : ''}
        onChange={e => aoMudar(apenasNumero(e.target.value))}
      />
      <span className="socorrista-odometro-unidade" aria-hidden="true">km</span>
    </div>
    <p id={`${id}-apoio`} className={aviso ? 'socorrista-aviso' : 'socorrista-apoio'}
      role={aviso ? 'alert' : undefined}>
      {aviso ?? apoio ?? ''}
    </p>
  </div>
}

function BotaoFoto({
  id, rotulo, arquivo, aoEscolher, obrigatoria,
}: {
  id: string; rotulo: string; arquivo: File | null
  aoEscolher: (f: File | null) => void; obrigatoria?: boolean
}) {
  const entrada = useRef<HTMLInputElement>(null)
  // A miniatura existe para ele conferir, ali mesmo, se o odometro saiu legivel:
  // descobrir que a foto ficou tremida so quando o administrador devolve o turno
  // custa uma volta inteira.
  const [previa, setPrevia] = useState('')
  useEffect(() => {
    if (!arquivo) { setPrevia(''); return }
    const url = URL.createObjectURL(arquivo)
    setPrevia(url)
    return () => URL.revokeObjectURL(url)
  }, [arquivo])

  return <div className="socorrista-campo">
    <label htmlFor={id}>
      {rotulo} {obrigatoria ? <em className="socorrista-exigido">obrigatória</em> : <span>opcional</span>}
    </label>
    <input
      ref={entrada} id={id} type="file" accept="image/*"
      // `capture` abre a camera direto, em vez da galeria: a foto e do painel
      // agora, nao de um arquivo antigo do celular.
      capture="environment"
      className="socorrista-arquivo"
      onChange={e => aoEscolher(e.target.files?.[0] ?? null)}
    />
    {previa
      ? <div className="socorrista-foto-pronta">
          <img src={previa} alt="Foto do painel que será enviada"/>
          <div>
            <strong>Foto pronta</strong>
            <span>Confira se o número do odômetro aparece.</span>
            <button type="button" className="socorrista-trocar-foto" onClick={() => entrada.current?.click()}>
              Tirar outra
            </button>
          </div>
        </div>
      : <button type="button" className="socorrista-botao-foto" onClick={() => entrada.current?.click()}>
          Tirar foto do odômetro
        </button>}
  </div>
}

/** Um passo numerado: viatura, odometro e foto sao uma sequencia de verdade. */
function Passo({ numero, children }: { numero: number; children: ReactNode }) {
  return <div className="socorrista-passo">
    <span className="socorrista-passo-numero" aria-hidden="true">{numero}</span>
    <div className="socorrista-passo-corpo">{children}</div>
  </div>
}

function AbrirTurno({
  dados, aoAbrir,
}: { dados: MeuTurnoDoDia; aoAbrir: () => void }) {
  const [veiculoId, setVeiculoId] = useState<number | null>(dados.veiculoSugerido)
  const [hodometro, setHodometro] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [confirmar, setConfirmar] = useState(false)
  const [erro, setErro] = useState('')

  const viatura = dados.viaturas.find(v => v.id === veiculoId) ?? null
  const pronto = veiculoId !== null && hodometro.length > 0 && foto !== null

  const digitado = hodometro ? Number(hodometro) : null
  const aviso = avisoDoOdometro(digitado, viatura?.ultimoHodometro)
  const falta = veiculoId === null ? 'Escolha a viatura para abrir o turno.'
    : !hodometro ? 'Informe o odômetro para abrir o turno.'
    : !foto ? 'Tire a foto do painel para abrir o turno.' : ''

  return <section className="socorrista-cartao">
    <h2>Abrir turno</h2>
    <p className="socorrista-intro">Antes de sair, em três passos.</p>

    <Passo numero={1}>
      <span className="socorrista-rotulo">Viatura</span>
      <div className="socorrista-viaturas" role="radiogroup" aria-label="Viatura">
        {dados.viaturas.map((v: ViaturaDoTurno) =>
          <button
            key={v.id} type="button" role="radio" aria-checked={v.id === veiculoId}
            className={`socorrista-viatura${v.id === veiculoId ? ' esta-marcada' : ''}`}
            onClick={() => setVeiculoId(v.id)}>
            <strong>{v.identificacao}</strong>
            {v.ultimoHodometro !== null
              ? <span>último {formatarKm(v.ultimoHodometro)}</span>
              : <span>sem registro</span>}
          </button>)}
      </div>
    </Passo>

    <Passo numero={2}>
      <CampoOdometro
        id="odometro-abertura" rotulo="Odômetro na saída" valor={hodometro} aoMudar={setHodometro}
        aviso={aviso}
        apoio={viatura?.ultimoHodometro
          ? `Último registro desta viatura: ${formatarKm(viatura.ultimoHodometro)}.`
          : 'Digite o número que aparece no painel.'}
      />
    </Passo>

    <Passo numero={3}>
      <BotaoFoto id="foto-abertura" rotulo="Foto do painel" arquivo={foto} aoEscolher={setFoto} obrigatoria />
    </Passo>

    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}

    <div className="socorrista-rodape-acao">
      <button
        type="button" className="socorrista-acao" disabled={!pronto}
        onClick={() => { setErro(''); setConfirmar(true) }}>
        Abrir turno
      </button>
      {falta ? <p className="socorrista-apoio">{falta}</p> : null}
    </div>

    {confirmar && veiculoId !== null && foto
      ? <ConfirmarAcao
          titulo="Abrir o turno?"
          efeito="O turno começa agora nesta viatura. No fim do dia você volta aqui para fechar com o odômetro e a foto."
          resumo={[
            ['Viatura', viatura?.identificacao ?? '—'],
            ['Odômetro na saída', formatarKm(Number(hodometro))],
            ['Foto do painel', 'Vai junto'],
          ]}
          avisos={[aviso]}
          textoConfirmar="Abrir turno"
          aoConfirmar={async () => {
            if (!foto) return
            // Recarrega mesmo se a foto falhar: o turno ja existe, e a tela passa
            // a mostrar o pedido da foto da saida em vez deste formulario.
            try { await abrirTurno({ veiculoId, hodometro: Number(hodometro), foto }) }
            finally { aoAbrir() }
          }}
          aoFechar={() => setConfirmar(false)}
        />
      : null}
  </section>
}

function FecharTurno({
  turno, aoFechar,
}: {
  turno: { id: number; veiculo: string; hodometroInicial: number; data: string; deDiaAnterior: boolean }
  aoFechar: () => void
}) {
  const [hodometro, setHodometro] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [confirmar, setConfirmar] = useState(false)

  const rodado = hodometro ? Number(hodometro) - turno.hodometroInicial : null
  const pronto = hodometro.length > 0 && foto !== null && rodado !== null && rodado >= 0

  return <section className="socorrista-cartao">
    <h2>Fechar turno</h2>
    {turno.deDiaAnterior
      ? <p className="socorrista-alerta" role="alert">
          Este turno é de {new Date(`${turno.data}T12:00`).toLocaleDateString('pt-BR')} e
          continua aberto. Feche-o para poder abrir o de hoje.
        </p>
      : null}

    <dl className="socorrista-resumo">
      <div><dt>Viatura</dt><dd>{turno.veiculo}</dd></div>
      <div><dt>Odômetro na saída</dt><dd>{formatarKm(turno.hodometroInicial)}</dd></div>
    </dl>

    <CampoOdometro
      id="odometro-fechamento" rotulo="Odômetro na chegada"
      valor={hodometro} aoMudar={setHodometro}
      apoio={rodado !== null && rodado >= 0 ? `Você rodou ${formatarKm(rodado)} neste turno.` : 'Digite o número que aparece no painel.'}
      aviso={rodado !== null && rodado > SALTO_SUSPEITO_KM
        ? `${formatarKm(rodado)} num turno só. Confira se não sobrou um dígito.` : null}
    />

    {rodado !== null && rodado < 0
      ? <p className="socorrista-alerta" role="alert">
          O odômetro de chegada não pode ser menor que o da saída.
        </p>
      : null}

    <BotaoFoto
      id="foto-fechamento" rotulo="Foto do painel" arquivo={foto} aoEscolher={setFoto} obrigatoria />

    <div className="socorrista-rodape-acao">
      <button
        type="button" className="socorrista-acao" disabled={!pronto}
        onClick={() => setConfirmar(true)}>
        Fechar turno
      </button>
      {!pronto && !(rodado !== null && rodado < 0)
        ? <p className="socorrista-apoio">
            {!hodometro ? 'Informe o odômetro de chegada.' : 'Tire a foto do painel para fechar.'}
          </p>
        : null}
    </div>

    {confirmar && foto
      ? <ConfirmarAcao
          titulo="Fechar o turno?"
          efeito="O turno vai para a administração conferir. O km só entra no sistema depois que for aprovado."
          resumo={[
            ['Viatura', turno.veiculo],
            ['Odômetro na chegada', formatarKm(Number(hodometro))],
            ['Km rodado no turno', formatarKm(rodado)],
          ]}
          textoConfirmar="Fechar turno"
          aoConfirmar={async () => {
            await fecharTurno({ turnoId: turno.id, hodometro: Number(hodometro), foto })
            aoFechar()
          }}
          aoFechar={() => setConfirmar(false)}
        />
      : null}
  </section>
}

/**
 * Turno aberto sem a foto da saida — o envio falhou depois que o turno ja
 * existia. A foto e obrigatoria, e o banco nao deixa fechar sem ela, entao a
 * tela pede a foto antes de qualquer outra coisa.
 */
function FaltaFotoAbertura({
  turno, aoEnviar,
}: { turno: { id: number; veiculo: string; hodometroInicial: number }; aoEnviar: () => void }) {
  const [foto, setFoto] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  return <section className="socorrista-cartao">
    <h2>Falta a foto da saída</h2>
    <p className="socorrista-alerta" role="alert">
      O turno na {turno.veiculo} foi aberto com {formatarKm(turno.hodometroInicial)}, mas a foto
      do painel não chegou. Sem ela o turno não pode ser fechado.
    </p>
    <BotaoFoto id="foto-abertura-pendente" rotulo="Foto do painel" arquivo={foto}
      aoEscolher={setFoto} obrigatoria />
    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
    <div className="socorrista-rodape-acao">
      <button type="button" className="socorrista-acao" disabled={!foto || enviando}
        onClick={async () => {
          if (!foto) return
          setEnviando(true); setErro('')
          try { await enviarFotoAbertura(turno.id, foto); aoEnviar() }
          catch (e) { setErro((e as Error).message) }
          finally { setEnviando(false) }
        }}>
        {enviando ? 'Enviando…' : 'Enviar foto'}
      </button>
    </div>
  </section>
}

export default function TurnoPage() {
  const [dados, setDados] = useState<MeuTurnoDoDia | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(() => {
    setErro('')
    meuTurnoDoDia().then(setDados).catch(e => setErro((e as Error).message))
  }, [])

  useEffect(carregar, [carregar])

  if (erro) return <ErroPagina mensagem={erro} tentarNovamente={carregar} />
  if (!dados) return <Carregando />

  const devolvido = dados.turnosDevolvidos[0] ?? null
  const aberto = dados.turnoAberto

  return <div className="socorrista">
    <header className="socorrista-topo">
      <span className="socorrista-dia">
        {new Date(`${dados.hoje}T12:00`).toLocaleDateString('pt-BR', {
          weekday: 'long', day: '2-digit', month: 'long',
        })}
      </span>
      <h1>{dados.socorrista ? primeiroNome(dados.socorrista.nome) : 'Turno do dia'}</h1>
      {dados.socorrista?.qra ? <span className="socorrista-qra">QRA {dados.socorrista.qra}</span> : null}
    </header>

    {devolvido
      ? <section className="socorrista-cartao socorrista-devolvido">
          <h2>Turno devolvido</h2>
          <p className="socorrista-alerta" role="alert">{devolvido.motivo}</p>
          <p className="socorrista-intro">
            Confira o odômetro e envie de novo com uma foto que mostre o painel.
          </p>
          <FecharTurno
            turno={{
              id: devolvido.id, veiculo: devolvido.veiculo, data: devolvido.data,
              hodometroInicial: devolvido.hodometroInicial, deDiaAnterior: false,
            }}
            aoFechar={carregar}
          />
        </section>
      : aberto && !aberto.temFotoAbertura
        ? <FaltaFotoAbertura turno={aberto} aoEnviar={carregar} />
      : aberto
        ? <FecharTurno turno={aberto} aoFechar={carregar} />
        : <AbrirTurno dados={dados} aoAbrir={carregar} />}

    {dados.ultimosTurnos.length
      ? <section className="socorrista-cartao">
          <h2>Seus últimos turnos</h2>
          <ul className="socorrista-historico">
            {dados.ultimosTurnos.map(t =>
              <li key={t.id}>
                <span className="socorrista-historico-dia">
                  {new Date(`${t.data}T12:00`).toLocaleDateString('pt-BR')}
                </span>
                <span className="socorrista-historico-km">{formatarKm(t.kmRodado)}</span>
                <span className={`socorrista-situacao situacao-${t.situacao.toLowerCase()}`}>
                  {t.situacao === 'APROVADO' ? 'Aprovado'
                    : t.situacao === 'DEVOLVIDO' ? 'Devolvido' : 'Aguardando'}
                </span>
              </li>)}
          </ul>
        </section>
      : null}
  </div>
}
