import { useEffect,useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardEmCache, lerDashboard, type ResumoPortoDashboard } from './dados/dashboard'
import { FaixaDeIndicadores, PainelDaProducao, PainelDeGastos, PainelDeKm,
  PainelPorSocorrista, PainelPorVeiculo, ResumoPorto } from './dashboard/PaineisDoResultado'
import type { Dashboard } from './types/modelos'


const meses=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
const rotuloMes=(mes:string)=>{const [ano,numeroMes]=mes.split('-').map(Number);return `${meses[numeroMes-1]}/${String(ano).slice(-2)}`}
/** Abre no mes corrente, que e o recorte mais pedido; a partir dai o periodo e livre. */
function mesCorrente(){const d=new Date(),mes=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  return {inicio:`${mes}-01`,fim:`${mes}-${String(new Date(d.getFullYear(),d.getMonth()+1,0).getDate()).padStart(2,'0')}`}}
/** "Março/26" quando o periodo e um mes inteiro; senao mostra as duas datas. */
function rotuloPeriodo(inicio:string,fim:string){
  if(!inicio||!fim)return ''
  const [ai,mi,di]=inicio.split('-').map(Number),[af,mf,df]=fim.split('-').map(Number)
  if(ai===af&&mi===mf&&di===1&&df===new Date(af,mf,0).getDate())return rotuloMes(`${ai}-${String(mi).padStart(2,'0')}`)
  const br=(v:string)=>v.split('-').reverse().join('/')
  return inicio===fim?br(inicio):`${br(inicio)} a ${br(fim)}`
}

export default function DashboardPage(){
  const [{inicio,fim},setPeriodo]=useState(mesCorrente)
  const [porto,setPorto]=useState<ResumoPortoDashboard|null>(null)
  const [financeiro,setFinanceiro]=useState<Dashboard|null>(null)
  const [erro,setErro]=useState('')
  // Enquanto revalida, a tela fica de pe com os numeros de antes em vez de
  // piscar o esqueleto a cada troca de periodo.
  const [atualizando,setAtualizando]=useState(false)
  const periodoValido=Boolean(inicio&&fim&&inicio<=fim)
  const avisoPeriodo=!inicio||!fim
    ? 'Informe a data inicial e a data final para consultar o período.'
    : inicio>fim?'A data inicial precisa ser anterior ou igual à data final.':''

  useEffect(()=>{
    if(!inicio||!fim||inicio>fim){
      setFinanceiro(null);setPorto(null);setErro('');setAtualizando(false);return
    }
    let valeu=true
    const guardado=dashboardEmCache(inicio,fim)
    if(guardado){setFinanceiro(guardado.financeiro);setPorto(guardado.porto);setAtualizando(true)}
    else{setFinanceiro(null);setPorto(null)}
    setErro('')
    lerDashboard(inicio,fim)
      .then(r=>{if(!valeu)return;setFinanceiro(r.financeiro);setPorto(r.porto)})
      .catch(e=>{if(valeu)setErro(e.message)})
      .finally(()=>{if(valeu)setAtualizando(false)})
    return()=>{valeu=false}
  },[inicio,fim])

  const margem=financeiro?.receitaRecebida
    ? financeiro.saldoRealizado/financeiro.receitaRecebida*100
    : 0

  return <div className={atualizando?'page-enter dashboard-tech atualizando':'page-enter dashboard-tech'}>
    <header className="page-heading dashboard-heading">
      <div>
        <span className="eyebrow">Central financeira · {rotuloPeriodo(inicio,fim)}</span>
        <h1>Visão financeira</h1>
        <p>
          Quanto entrou, quanto saiu e o lucro real da operação — sem misturar faturamento
          com resultado.
        </p>
      </div>
      <div className="heading-actions">
        <label className="month-picker">
          <span>De</span>
          <input aria-label="Data inicial" type="date" value={inicio}
            max={fim||undefined}
            onChange={e=>setPeriodo(p=>({...p,inicio:e.target.value}))}/>
        </label>
        <label className="month-picker">
          <span>Até</span>
          <input aria-label="Data final" type="date" value={fim}
            min={inicio||undefined}
            onChange={e=>setPeriodo(p=>({...p,fim:e.target.value}))}/>
        </label>
        <Link className="button button-primary" to="/despesas?novo=1">+ Registrar despesa</Link>
      </div>
    </header>

    {avisoPeriodo
      ? <div className="form-alert">{avisoPeriodo}</div>
      : erro
      ? <div className="form-alert">
          Não foi possível carregar todos os indicadores oficiais. {erro}
        </div>
      : null}

    {periodoValido&&financeiro
      ? <>
          {/* Leitura de dez segundos primeiro; o resto explica de onde ela saiu. */}
          <FaixaDeIndicadores dados={financeiro} margem={margem}/>

          {/* Duas perguntas que andam juntas: no que o dinheiro foi, e quanto do
              rodado nao foi pago. Lado a lado enquanto couber. */}
          <div className="grade-painel grade-8-4">
            <PainelDeGastos dados={financeiro} inicio={inicio} fim={fim}/>
            <PainelDeKm dados={financeiro}/>
          </div>

          {/* Desempenho, o pedido do cliente: viatura e pessoa, mesma forma,
              lado a lado para comparar sem rolar de um para o outro. */}
          <div className="grade-painel grade-6-6">
            <PainelPorVeiculo dados={financeiro}/>
            <PainelPorSocorrista dados={financeiro}/>
          </div>

          <PainelDaProducao dados={financeiro}/>
        </>
      : !periodoValido
        ? null
        : erro
        ? <div className="loading-card" role="status">Não foi possível carregar os indicadores deste período.</div>
        : <div className="loading-card" role="status">Carregando indicadores financeiros oficiais…</div>}

    {porto ? <ResumoPorto porto={porto}/> : null}

    <p className="calculation-note">
      <strong>Como calculamos:</strong> lucro operacional = receitas recebidas − despesas
      aprovadas e pagas. A data financeira da OP vem do recebimento, não da data do atendimento.
    </p>
  </div>
}
