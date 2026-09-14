import { useEffect,useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from './api/http'
import { resumirOrdensPagamentoPorto } from './api/porto'
import { FaixaDoResultado, IndicadoresDeKm, PainelDaProducao, PainelPorSocorrista,
  PainelPorVeiculo, ResumoPorto } from './dashboard/PaineisDoResultado'
import type { Dashboard,ResumoOpsPorto } from './types/modelos'


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
  const [porto,setPorto]=useState<ResumoOpsPorto|null>(null)
  const [financeiro,setFinanceiro]=useState<Dashboard|null>(null)
  const [erro,setErro]=useState('')

  useEffect(()=>{
    if(!inicio||!fim||inicio>fim)return
    const params=new URLSearchParams({dataInicio:inicio,dataFim:fim})
    setErro('');setFinanceiro(null);setPorto(null)
    resumirOrdensPagamentoPorto(params).then(setPorto)
      .catch(e=>setErro(atual=>atual||`Porto: ${e.message}`))
    api<Dashboard>(`/api/dashboard?inicio=${inicio}&fim=${fim}`).then(setFinanceiro)
      .catch(e=>setErro(atual=>atual||`Financeiro: ${e.message}`))
  },[inicio,fim])

  const margem=financeiro?.receitaRecebida
    ? financeiro.saldoRealizado/financeiro.receitaRecebida*100
    : 0

  return <div className="page-enter dashboard-tech">
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
            onChange={e=>setPeriodo(p=>({...p,inicio:e.target.value}))}/>
        </label>
        <label className="month-picker">
          <span>Até</span>
          <input aria-label="Data final" type="date" value={fim}
            onChange={e=>setPeriodo(p=>({...p,fim:e.target.value}))}/>
        </label>
        <Link className="button button-primary" to="/despesas?novo=1">+ Registrar despesa</Link>
      </div>
    </header>

    {erro
      ? <div className="form-alert">
          Não foi possível carregar todos os indicadores oficiais. {erro}
        </div>
      : null}

    {financeiro
      ? <>
          <FaixaDoResultado dados={financeiro} margem={margem}/>
          <IndicadoresDeKm dados={financeiro}/>
          <PainelDaProducao dados={financeiro}/>
          <PainelPorSocorrista dados={financeiro}/>
          <PainelPorVeiculo dados={financeiro}/>
        </>
      : <div className="loading-card">Carregando indicadores financeiros oficiais…</div>}

    {porto ? <ResumoPorto porto={porto}/> : null}

    <p className="calculation-note">
      <strong>Como calculamos:</strong> lucro operacional = receitas recebidas − despesas
      aprovadas e pagas. A data financeira da OP vem do recebimento, não da data do atendimento.
    </p>
  </div>
}
