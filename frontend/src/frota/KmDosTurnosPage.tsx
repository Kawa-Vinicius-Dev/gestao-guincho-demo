import { useCallback, useEffect, useMemo, useState } from 'react'
import { LinkSocorrista, LinkViatura } from '../components/LinksDeDado'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { Selecao } from '../components/Campos'
import { Carregando, ErroPagina, Vazio } from '../components/EstadoPagina'
import { Etiqueta, GradeIndicadores, Indicador } from '../components/ui/Pagina'
import { VerFoto } from '../aprovacoes/AprovacoesPage'
import { kmDosTurnos, resumoKmDoTurno, type ServicoComKm, type TurnoComKm } from '../dados/kmDosTurnos'
import type { Localizacao } from '../dados/turnos'
import { listarMotoristas } from '../dados/motoristas'
import { listarVeiculos } from '../dados/veiculos'
import type { Motorista, Veiculo } from '../types/modelos'
import { usePeriodoGlobal } from '../utils/periodoGlobal'
import { data } from '../utils/formatadores'

/**
 * KM dos turnos (Kawa, 15/10/2026): para cada turno, quanto a viatura rodou,
 * quanto foi em servico e o km morto, com os servicos um a um para conferir —
 * odometro, hora, local e foto do painel no inicio e no fim.
 *
 * As fotos abrem so quando alguem clica (bucket privado, link temporario) e,
 * como as do turno, sao apagadas na aprovacao.
 */

const km = (valor: number | null) => valor == null ? '—'
  : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
const hora = (iso: string | null) => iso
  ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'
const SITUACAO: Record<TurnoComKm['situacao'], string> = {
  ABERTO: 'Aberto', AGUARDANDO_APROVACAO: 'Aguardando aprovação', APROVADO: 'Aprovado', DEVOLVIDO: 'Devolvido',
}

function Local({ local }: { local: Localizacao | null }) {
  if (!local) return <>—</>
  if ('semLocal' in local) return <>{local.semLocal === 'NEGADA' ? 'Sem permissão no celular' : 'Celular não localizou'}</>
  return <a href={`https://www.google.com/maps?q=${local.latitude},${local.longitude}`} target="_blank" rel="noreferrer">
    Ver no mapa
  </a>
}

function Servico({ turno, s }: { turno: TurnoComKm; s: ServicoComKm }) {
  const pelaDigitacao = s.kmInicial == null
  const fotosApagadas = turno.situacao === 'APROVADO'
  const nome = (etapa: string) => `servico-${turno.dataTurno}-OS-${s.numeroOs}-${etapa}.jpg`
  return <li className="km-turno-servico">
    <header>
      <strong>OS {s.numeroOs}</strong>
      <span>{s.km != null ? km(s.km) : <Etiqueta tom="atencao">Não finalizado</Etiqueta>}</span>
    </header>
    {pelaDigitacao
      ? <p className="aprovacao-apoio">Lançado antes do registro pelo painel: km digitado do GPS.</p>
      : <dl className="aprovacao-numeros">
          <div><dt>Início</dt><dd>{hora(s.iniciadoEm)} · {km(s.kmInicial)}</dd></div>
          <div><dt>Fim</dt><dd>{hora(s.finalizadoEm)} · {km(s.kmFinal)}</dd></div>
          <div><dt>Local do início</dt><dd><Local local={s.localInicio}/></dd></div>
          <div><dt>Local do fim</dt><dd><Local local={s.localFim}/></dd></div>
        </dl>}
    {pelaDigitacao ? null
      : fotosApagadas
        ? <p className="aprovacao-apoio">Fotos apagadas na aprovação do turno.</p>
        : <span className="aprovacao-fotos">
            {s.fotoInicio ? <VerFoto caminho={s.fotoInicio} rotulo="Foto do início" nomeDoArquivo={nome('inicio')}/> : null}
            {s.fotoFim ? <VerFoto caminho={s.fotoFim} rotulo="Foto do fim" nomeDoArquivo={nome('fim')}/> : null}
          </span>}
  </li>
}

function Turno({ turno }: { turno: TurnoComKm }) {
  const r = resumoKmDoTurno(turno)
  return <article className="aprovacao-item">
    <header>
      <h3><LinkSocorrista id={turno.motoristaId} nome={turno.socorrista}/></h3>
      <span className="aprovacao-data">
        {data(turno.dataTurno)} · <LinkViatura id={turno.veiculoId} sigla={turno.viatura}/> · {SITUACAO[turno.situacao]}
      </span>
    </header>

    <dl className="aprovacao-numeros">
      <div><dt>Km inicial do turno</dt><dd>{km(r.kmInicial)}</dd></div>
      <div><dt>Km final do turno</dt><dd>{km(r.kmFinal)}</dd></div>
      <div><dt>Km total</dt><dd className="aprovacao-destaque">{km(r.kmTotal)}</dd></div>
      <div><dt>Km em serviço</dt><dd className="aprovacao-destaque">{km(r.kmEmServico)}</dd></div>
      <div><dt>Km morto</dt><dd className="aprovacao-destaque">
        {km(r.kmMorto)}{' '}
        {r.inconsistente ? <Etiqueta tom="alerta">Conferir</Etiqueta>
          : r.incompleto ? <Etiqueta tom="atencao">Incompleto</Etiqueta> : null}
      </dd></div>
    </dl>
    {r.avisos.map(a => <p key={a} className="aprovacao-apoio" role="alert">{a}</p>)}

    {turno.servicos.length
      ? <ul className="km-turno-servicos">{turno.servicos.map(s => <Servico key={s.id} turno={turno} s={s}/>)}</ul>
      : <p className="aprovacao-apoio">Nenhum serviço registrado neste turno.</p>}
  </article>
}

export default function KmDosTurnosPage() {
  const [periodo, setPeriodo] = usePeriodoGlobal()
  const [motoristaId, setMotoristaId] = useState('')
  const [veiculoId, setVeiculoId] = useState('')
  const [motoristas, setMotoristas] = useState<Motorista[]>([])
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [turnos, setTurnos] = useState<TurnoComKm[] | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    void Promise.all([listarMotoristas(), listarVeiculos()])
      .then(([m, v]) => { setMotoristas(m); setVeiculos(v) })
      .catch(() => {})
  }, [])

  const carregar = useCallback(() => {
    if (!periodo.inicio || !periodo.fim || periodo.inicio > periodo.fim) return
    setErro('')
    setTurnos(null)
    kmDosTurnos({ inicio: periodo.inicio, fim: periodo.fim, motoristaId: Number(motoristaId) || null, veiculoId: Number(veiculoId) || null })
      .then(setTurnos)
      .catch(e => setErro((e as Error).message))
  }, [periodo.inicio, periodo.fim, motoristaId, veiculoId])

  useEffect(carregar, [carregar])

  // Os totais somam so os turnos com a conta fechada: turno aberto ou com
  // servico sem finalizar ainda nao tem km morto definitivo.
  const totais = useMemo(() => {
    const resumos = (turnos ?? []).map(resumoKmDoTurno)
    const fechados = resumos.filter(r => !r.incompleto)
    const soma = (f: (r: typeof resumos[number]) => number | null) =>
      Math.round(fechados.reduce((t, r) => t + (f(r) ?? 0), 0) * 10) / 10
    return {
      total: soma(r => r.kmTotal), emServico: soma(r => r.kmEmServico), morto: soma(r => r.kmMorto),
      incompletos: resumos.length - fechados.length, conferir: resumos.filter(r => r.inconsistente).length,
    }
  }, [turnos])

  return <div className="page-enter">
    <header className="page-heading"><div>
      <span className="eyebrow">Viaturas</span>
      <h1>Km dos turnos</h1>
      <p>Quanto a viatura rodou no turno, quanto foi em serviço e o km morto: a diferença que não ficou registrada em serviço.</p>
    </div></header>

    <section className="panel painel-filtros"><form className="ledger-filters" onSubmit={e => e.preventDefault()}>
      <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/>
      <Selecao rotulo="Socorrista" vazio="Todos" value={motoristaId} onChange={e => setMotoristaId(e.target.value)}
        opcoes={motoristas.map(m => ({ valor: String(m.id), texto: m.nome }))}/>
      <Selecao rotulo="Viatura" vazio="Todas" value={veiculoId} onChange={e => setVeiculoId(e.target.value)}
        opcoes={veiculos.map(v => ({ valor: String(v.id), texto: v.identificacao }))}/>
    </form></section>

    {erro ? <ErroPagina mensagem={erro} tentarNovamente={carregar}/>
      : !turnos ? <Carregando/>
      : !turnos.length ? <Vazio titulo="Nenhum turno no período" descricao="Escolha outro período ou tire os filtros."/>
      : <>
          <GradeIndicadores>
            <Indicador rotulo="Km total" valor={km(totais.total)}/>
            <Indicador rotulo="Km em serviço" valor={km(totais.emServico)}/>
            <Indicador rotulo="Km morto" valor={km(totais.morto)} tom={totais.morto < 0 ? 'alerta' : 'neutro'}/>
            <Indicador rotulo="Turnos" valor={turnos.length}
              apoio={[totais.incompletos ? `${totais.incompletos} fora da soma (incompletos)` : '',
                totais.conferir ? `${totais.conferir} para conferir` : ''].filter(Boolean).join(' · ') || 'Todos completos'}
              tom={totais.conferir ? 'alerta' : totais.incompletos ? 'atencao' : 'neutro'}/>
          </GradeIndicadores>
          <div className="km-turnos">{turnos.map(t => <Turno key={t.id} turno={t}/>)}</div>
        </>}
  </div>
}
