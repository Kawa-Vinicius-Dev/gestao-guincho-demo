import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { INICIO_DO_HISTORICO, mapaDoDiario, type DiaDoDiario } from '../dados/porto/diario'
import { data as dataBr } from '../utils/formatadores'
import { CabecalhoPagina, Painel } from '../components/ui/Pagina'
import { Carregando } from '../components/EstadoPagina'
import { OsDoDia } from './diario/OsDoDia'

/**
 * Diario Operacional.
 *
 * O que a Porto mostra na consulta de servicos: quem atendeu, com que viatura,
 * em que dia. Nada de dinheiro — o valor so existe quando a OP chega, semanas
 * depois. Colar o Diario e o que faz o servico existir no sistema: ele conta na
 * producao do socorrista e da viatura mesmo antes de ser pago.
 *
 * Esta tela e so o calendario: que dias ja foram colados, para nenhum ficar de
 * fora sem ninguem perceber, e as OS de cada dia ao clicar. A colagem mora em
 * Importar relatorios > Importacao diaria (Kawa, 23/09/2026: "essa tela fica
 * muito poluida, melhor ficar apenas o calendario").
 */

const dois = (n: number) => String(n).padStart(2, '0')
const mesCorrente = () => {
  const d = new Date()
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}`
}
const rotuloMes = (mes: string) => new Date(`${mes}-15T12:00:00`)
  .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
const fimDoMes = (mes: string) => {
  const [ano, numero] = mes.split('-').map(Number)
  return `${mes}-${dois(new Date(ano, numero, 0).getDate())}`
}
const mesVizinho = (mes: string, passo: number) => {
  const [ano, numero] = mes.split('-').map(Number)
  const d = new Date(ano, numero - 1 + passo, 1)
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}`
}

/** Um mes de dias, cada um dizendo se o Diario ja passou por ali. */
function MapaDoMes({ mes, dias, aoEscolher }: { mes: string; dias: DiaDoDiario[]; aoEscolher: (dia: string) => void }) {
  const hoje = new Date().toISOString().slice(0, 10)
  // Alinha o dia 1 na coluna do dia da semana certo.
  const vazios = new Date(`${mes}-01T12:00:00`).getDay()
  return <div className="diario-mapa">
    <div className="diario-mapa-semana" aria-hidden="true">
      {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((letra, i) => <span key={i}>{letra}</span>)}
    </div>
    <ol className="diario-mapa-dias">
      {Array.from({ length: vazios }, (_, i) => <li key={`vazio${i}`} className="diario-dia-vazio" aria-hidden="true"/>)}
      {dias.map(d => {
        const futuro = d.dia > hoje
        const estado = futuro ? 'futuro' : d.importado ? 'ok' : 'falta'
        const texto = futuro ? 'ainda não aconteceu'
          : d.importado ? `${d.os} ${d.os === 1 ? 'serviço' : 'serviços'}${d.semValor ? `, ${d.semValor} sem valor` : ''}`
          : 'sem Diário importado'
        // Dia que ja aconteceu e clicavel: abre as OS daquele dia.
        const conteudoDoDia = <>
          <span className="diario-dia-numero">{Number(d.dia.slice(8))}</span>
          <span className="diario-dia-os">{futuro ? '' : d.os || ''}</span>
          <span className="apenas-leitor">{dataBr(d.dia)}: {texto}</span>
        </>
        return <li key={d.dia} className={`diario-dia diario-dia-${estado}`}
          title={`${dataBr(d.dia)} — ${texto}`}>
          {futuro ? conteudoDoDia
            : <button type="button" className="diario-dia-botao" onClick={() => aoEscolher(d.dia)}>{conteudoDoDia}</button>}
        </li>
      })}
    </ol>
  </div>
}

export default function PortoDiarioPage() {
  const [erro, setErro] = useState('')

  const [mes, setMes] = useState(mesCorrente)
  const [dias, setDias] = useState<DiaDoDiario[]>([])
  const [carregandoMapa, setCarregandoMapa] = useState(true)
  const [diaAberto, setDiaAberto] = useState<string | null>(null)

  const carregarMapa = useCallback(() => {
    setCarregandoMapa(true)
    const inicio = `${mes}-01` < INICIO_DO_HISTORICO ? INICIO_DO_HISTORICO : `${mes}-01`
    mapaDoDiario(inicio, fimDoMes(mes))
      .then(setDias)
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregandoMapa(false))
  }, [mes])
  useEffect(carregarMapa, [carregarMapa])

  const faltando = dias.filter(d => !d.importado && d.dia <= new Date().toISOString().slice(0, 10)).length

  return <div className="page-enter">
    <CabecalhoPagina modulo="Porto Seguro" titulo="Diário Operacional"
      descricao="Os dias já importados. Clique num dia para ver as OS dele."
      acoes={<Link className="button button-primary" to="/porto/importacoes?tipo=diario">Importar diário</Link>}/>

    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}

    <Painel etiqueta="Cobertura" titulo="Dias já importados"
      aoLado={<div className="diario-mapa-navegacao">
        <button className="button button-ghost" type="button" disabled={`${mes}-01` <= INICIO_DO_HISTORICO}
          onClick={() => setMes(m => mesVizinho(m, -1))}>Mês anterior</button>
        <strong>{rotuloMes(mes)}</strong>
        <button className="button button-ghost" type="button" disabled={mes >= mesCorrente()}
          onClick={() => setMes(m => mesVizinho(m, 1))}>Próximo mês</button>
      </div>}>
      {carregandoMapa ? <Carregando/> : <>
        <MapaDoMes mes={mes} dias={dias} aoEscolher={setDiaAberto}/>
        <p className="empty-inline">
          {faltando
            ? `${faltando} ${faltando === 1 ? 'dia ainda sem Diário importado' : 'dias ainda sem Diário importado'} neste mês.`
            : 'Todos os dias do mês já têm Diário importado.'}
          {' '}O histórico começa em {dataBr(INICIO_DO_HISTORICO)}.
        </p>
      </>}
    </Painel>

    {diaAberto ? <OsDoDia dia={diaAberto} aoFechar={() => setDiaAberto(null)}/> : null}
  </div>
}
