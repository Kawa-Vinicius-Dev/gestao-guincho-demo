import { useCallback, useEffect, useState } from 'react'
import { confirmarImportacaoPorto, criarPreviaConteudoPorto } from '../dados/porto'
import { diasColados, INICIO_DO_HISTORICO, LIMITE_DE_DIAS, mapaDoDiario, type DiaDoDiario } from '../dados/porto/diario'
import type { PreviaPorto } from '../types/modelos'
import { data as dataBr } from '../utils/formatadores'
import { ConfirmarAcao, type PedidoConfirmacao } from '../components/ConfirmarAcao'
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
 * Duas coisas separam esta tela da de Importar relatorios: aqui so entra o
 * painel do dia (nunca uma OP), e a colagem e limitada a uma quinzena, porque a tela
 * de origem trunca intervalos grandes sem avisar. O mapa embaixo mostra que dias
 * ja foram colados, para nenhum dia ficar de fora sem ninguem perceber.
 */

const dois = (n: number) => String(n).padStart(2, '0')
const mesDe = (dia: string) => dia.slice(0, 7)
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
  const [conteudo, setConteudo] = useState('')
  const [previa, setPrevia] = useState<PreviaPorto | null>(null)
  const [resumoColado, setResumoColado] = useState<{ inicio: string; fim: string; dias: number } | null>(null)
  const [erro, setErro] = useState(''), [mensagem, setMensagem] = useState('')
  const [carregando, setCarregando] = useState(false), [etapa, setEtapa] = useState('')
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)

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

  async function analisar() {
    if (!conteudo.trim()) return
    setCarregando(true); setEtapa('Lendo o Diário…'); setErro(''); setMensagem(''); setPrevia(null); setResumoColado(null)
    try {
      const colado = await diasColados(conteudo)
      if (colado.intervalo > LIMITE_DE_DIAS) {
        throw new Error(`A colagem cobre ${colado.intervalo} dias (${dataBr(colado.inicio)} a ${dataBr(colado.fim)}). `
          + `Cole no máximo ${LIMITE_DE_DIAS} dias por vez — uma quinzena: a consulta da Porto corta intervalos maiores sem avisar.`)
      }
      const lida = await criarPreviaConteudoPorto(conteudo)
      if (lida.tipo !== 'PAINEL_DIARIO') {
        throw new Error('Isto não é o Diário da Porto. Para importar uma OP, use a tela Importar relatórios.')
      }
      setPrevia(lida)
      setResumoColado({ inicio: colado.inicio, fim: colado.fim, dias: colado.dias.length })
    } catch (e) { setErro((e as Error).message) }
    finally { setEtapa(''); setCarregando(false) }
  }

  async function importar() {
    if (!previa) return
    setCarregando(true); setEtapa('Importando o Diário…'); setErro('')
    try {
      const r = await confirmarImportacaoPorto(previa)
      setMensagem(`${r.importados} ${r.importados === 1 ? 'serviço importado' : 'serviços importados'}`
        + `${r.ignorados ? ` · ${r.ignorados} já existiam` : ''}`
        + `${r.viaturasNovas?.length ? ` · ${r.viaturasNovas.length === 1 ? 'viatura nova cadastrada' : 'viaturas novas cadastradas'}: ${r.viaturasNovas.join(', ')}` : ''}`
        + '. Os valores entram quando a OP chegar.')
      // Gravou: o texto colado sai e o mapa recarrega com os dias novos.
      setPrevia(null); setConteudo(''); setResumoColado(null)
      if (resumoColado && mesDe(resumoColado.inicio) !== mes) setMes(mesDe(resumoColado.inicio))
      else carregarMapa()
    } catch (e) { setErro((e as Error).message) }
    finally { setEtapa(''); setCarregando(false) }
  }

  // Importar cria OS que passam a contar na producao e nas pendencias: pergunta antes.
  function pedirConfirmacao() {
    if (!previa || !resumoColado) return
    const novas = previa.linhas.filter(l => l.acao === 'IMPORTAR').length
    const existentes = previa.linhas.length - novas
    const semSocorrista = (previa.orfas ?? []).length
    setPedido({
      titulo: 'Importar o Diário?',
      efeito: <>Os serviços entram no sistema <strong>sem valor</strong>, aguardando a OP da Porto. Eles já contam na
        produção do socorrista e da viatura, e aparecem como pendentes de valor.</>,
      resumo: [
        ['Período colado', `${dataBr(resumoColado.inicio)} a ${dataBr(resumoColado.fim)}`],
        ['Dias', String(resumoColado.dias)],
        ['Serviços novos', String(novas)],
        ['Já existentes', String(existentes)],
      ],
      avisos: [
        semSocorrista
          ? <><strong>{semSocorrista}</strong> {semSocorrista === 1 ? 'serviço veio' : 'serviços vieram'} sem socorrista e {semSocorrista === 1 ? 'vai' : 'vão'} para o <strong>Auxiliar</strong>.</>
          : null,
      ],
      textoConfirmar: 'Sim, importar',
      aoConfirmar: importar,
    })
  }

  const faltando = dias.filter(d => !d.importado && d.dia <= new Date().toISOString().slice(0, 10)).length

  return <div className="page-enter">
    <CabecalhoPagina modulo="Módulo Porto" titulo="Diário Operacional"
      descricao={`Cole a consulta de serviços da Porto, uma quinzena por vez (até ${LIMITE_DE_DIAS} dias). Os serviços entram sem valor; o valor vem na OP.`}/>

    {carregando ? <span role="status">{etapa}</span> : null}
    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
    {mensagem ? <div className="success-notice">{mensagem}</div> : null}

    <Painel etiqueta="Importar" titulo="Colar o Diário">
      <div className="porto-paste">
        <label className="field"><span>Consulta de serviços copiada da Porto</span>
          <textarea aria-label="Consulta de serviços copiada da Porto" rows={10} value={conteudo}
            onChange={e => { setConteudo(e.target.value); setPrevia(null); setMensagem('') }}
            placeholder="Cole aqui a consulta copiada com Ctrl+C"/>
        </label>
        <div className="porto-paste-actions">
          <button className="button button-ghost" type="button"
            onClick={() => { setConteudo(''); setPrevia(null); setResumoColado(null); setErro(''); setMensagem('') }}>Limpar</button>
          <button className="button button-primary" disabled={!conteudo.trim() || carregando} onClick={() => void analisar()}>
            {carregando ? 'Lendo…' : 'Analisar Diário'}
          </button>
        </div>
      </div>

      {previa && resumoColado ? <div className="porto-preview">
        <div className="porto-preview-summary">
          <span><strong>{resumoColado.dias}</strong> {resumoColado.dias === 1 ? 'dia' : 'dias'}</span>
          <span>de <strong>{dataBr(resumoColado.inicio)}</strong> a <strong>{dataBr(resumoColado.fim)}</strong></span>
          <span><strong>{previa.totalLinhas}</strong> serviços</span>
          <span><strong>{previa.linhas.filter(l => l.acao === 'IMPORTAR').length}</strong> novos</span>
        </div>
        {previa.erros.length ? <div className="form-alert"><strong>Confira a colagem.</strong> {previa.erros.join(' · ')}</div> : null}
        <div className="table-scroll porto-preview-table"><table>
          <thead><tr><th>OS</th><th>Especialidade</th><th>Viatura</th><th>Socorrista</th><th>Data</th><th>Situação</th></tr></thead>
          <tbody>{previa.linhas.map(l => <tr key={l.hashRegistro}>
            <td><strong>{l.dados.numero_os}</strong></td>
            <td>{l.dados.especialidade || '—'}</td>
            <td>{l.dados.sigla_viatura || '—'}</td>
            <td>{l.dados.socorrista || '—'}</td>
            <td>{dataBr(l.dados.data_atendimento)}</td>
            <td>{l.dados.situacao_porto || '—'}</td>
          </tr>)}</tbody>
        </table></div>
        <footer className="porto-confirm" aria-label="Ações da prévia">
          <button className="button button-primary" disabled={carregando || !previa.linhas.length} onClick={pedirConfirmacao}>
            Importar Diário
          </button>
        </footer>
      </div> : null}
    </Painel>

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

    {pedido ? <ConfirmarAcao {...pedido} aoFechar={() => setPedido(null)}/> : null}
    {diaAberto ? <OsDoDia dia={diaAberto} aoFechar={() => setDiaAberto(null)}/> : null}
  </div>
}
