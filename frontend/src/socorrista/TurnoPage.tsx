import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmarAcao } from '../components/ConfirmarAcao'
import { Carregando, ErroPagina } from '../components/EstadoPagina'
import {
  abrirTurno, fecharTurno, meuTurnoDoDia,
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
 *   sem turno aberto   -> abrir turno (viatura + odometro, foto opcional)
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

function CampoOdometro({
  id, rotulo, valor, aoMudar, apoio,
}: {
  id: string; rotulo: string; valor: string
  aoMudar: (v: string) => void; apoio?: string
}) {
  return <div className="socorrista-campo">
    <label htmlFor={id}>{rotulo}</label>
    <input
      id={id}
      className="socorrista-odometro"
      // Teclado numerico no celular sem perder o comportamento de texto: `type
      // number` no Android aceita vírgula, sinal e notacao cientifica, e o
      // odometro nao tem nada disso.
      type="text" inputMode="numeric" autoComplete="off"
      value={valor}
      onChange={e => aoMudar(apenasNumero(e.target.value))}
    />
    {apoio ? <p className="socorrista-apoio">{apoio}</p> : null}
  </div>
}

function BotaoFoto({
  id, rotulo, arquivo, aoEscolher, obrigatoria,
}: {
  id: string; rotulo: string; arquivo: File | null
  aoEscolher: (f: File | null) => void; obrigatoria?: boolean
}) {
  const entrada = useRef<HTMLInputElement>(null)
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
    <button type="button" className="socorrista-botao-foto" onClick={() => entrada.current?.click()}>
      {arquivo ? 'Trocar foto' : 'Tirar foto do odômetro'}
    </button>
    {arquivo ? <p className="socorrista-apoio socorrista-ok">Foto pronta para enviar.</p> : null}
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
  const pronto = veiculoId !== null && hodometro.length > 0

  return <section className="socorrista-cartao">
    <h2>Abrir turno</h2>
    <p className="socorrista-intro">
      Escolha a viatura e informe o odômetro agora, antes de sair.
    </p>

    <div className="socorrista-campo">
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
    </div>

    <CampoOdometro
      id="odometro-abertura" rotulo="Odômetro na saída" valor={hodometro} aoMudar={setHodometro}
      apoio={viatura?.ultimoHodometro
        ? `Último registro desta viatura: ${formatarKm(viatura.ultimoHodometro)}.`
        : undefined}
    />

    <BotaoFoto id="foto-abertura" rotulo="Foto do painel" arquivo={foto} aoEscolher={setFoto} />

    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}

    <button
      type="button" className="socorrista-acao" disabled={!pronto}
      onClick={() => { setErro(''); setConfirmar(true) }}>
      Abrir turno
    </button>

    {confirmar && veiculoId !== null
      ? <ConfirmarAcao
          titulo="Abrir o turno?"
          efeito="O turno começa agora nesta viatura. No fim do dia você volta aqui para fechar com o odômetro e a foto."
          resumo={[
            ['Viatura', viatura?.identificacao ?? '—'],
            ['Odômetro na saída', formatarKm(Number(hodometro))],
            ['Foto do painel', foto ? 'Enviada' : 'Sem foto'],
          ]}
          textoConfirmar="Abrir turno"
          aoConfirmar={async () => {
            await abrirTurno({ veiculoId, hodometro: Number(hodometro), foto })
            aoAbrir()
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
      apoio={rodado !== null && rodado >= 0 ? `Você rodou ${formatarKm(rodado)} neste turno.` : undefined}
    />

    {rodado !== null && rodado < 0
      ? <p className="socorrista-alerta" role="alert">
          O odômetro de chegada não pode ser menor que o da saída.
        </p>
      : null}

    <BotaoFoto
      id="foto-fechamento" rotulo="Foto do painel" arquivo={foto} aoEscolher={setFoto} obrigatoria />

    <button
      type="button" className="socorrista-acao" disabled={!pronto}
      onClick={() => setConfirmar(true)}>
      Fechar turno
    </button>

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
