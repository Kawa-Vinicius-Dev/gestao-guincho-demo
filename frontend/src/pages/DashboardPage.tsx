import { useEffect,useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/http'
import { resumirOrdensPagamentoPorto } from '../api/porto'
import type { Dashboard,ResumoOpsPorto } from '../types/modelos'
import { moeda,numero } from '../utils/formatadores'

const meses=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
const rotuloMes=(mes:string)=>{const [ano,numeroMes]=mes.split('-').map(Number);return `${meses[numeroMes-1]}/${String(ano).slice(-2)}`}

function CartaoMetrica({titulo,valor,apoio,tom=''}:{titulo:string;valor:string;apoio:string;tom?:string}){
  return <article className={`metric metric-v2 ${tom}`}><span>{titulo}</span><strong>{valor}</strong><small>{apoio}</small></article>
}

export default function DashboardPage(){
  const [mes,setMes]=useState('2026-07'),[porto,setPorto]=useState<ResumoOpsPorto|null>(null),[financeiro,setFinanceiro]=useState<Dashboard|null>(null),[erro,setErro]=useState('')
  useEffect(()=>{
    const [ano,numeroMes]=mes.split('-').map(Number),inicio=`${mes}-01`,fim=`${mes}-${String(new Date(ano,numeroMes,0).getDate()).padStart(2,'0')}`,params=new URLSearchParams({dataInicio:inicio,dataFim:fim})
    setErro('');setFinanceiro(null);setPorto(null)
    resumirOrdensPagamentoPorto(params).then(setPorto).catch(e=>setErro(atual=>atual||`Porto: ${e.message}`))
    api<Dashboard>(`/api/dashboard?inicio=${inicio}&fim=${fim}`).then(setFinanceiro).catch(e=>setErro(atual=>atual||`Financeiro: ${e.message}`))
  },[mes])
  const margem=financeiro?.receitaRecebida?financeiro.saldoRealizado/financeiro.receitaRecebida*100:0
  return <div className="page-enter">
    <header className="page-heading dashboard-heading"><div><span className="eyebrow">Central financeira · {rotuloMes(mes)}</span><h1>Visão financeira</h1><p>Quanto entrou, quanto saiu e o lucro real da operação — sem misturar faturamento com resultado.</p></div><div className="heading-actions"><label className="month-picker"><span>Competência</span><input aria-label="Competência" type="month" value={mes} onChange={e=>setMes(e.target.value)}/></label><Link className="button button-primary" to="/lancamentos?novo=1">+ Nova entrada ou saída</Link></div></header>
    {erro?<div className="form-alert">Não foi possível carregar todos os indicadores oficiais. {erro}</div>:null}
    {financeiro?<><section className="finance-lane" aria-label="Fluxo do resultado operacional"><div><span>Receita do mês</span><strong>{moeda(financeiro.receitaRecebida)}</strong><small>Recebimentos confirmados no financeiro</small></div><i className="lane-separator">−</i><div><span>Despesas do mês</span><strong>{moeda(financeiro.despesasPagas)}</strong><small>{financeiro.receitaRecebida?((financeiro.despesasPagas/financeiro.receitaRecebida)*100).toFixed(1):0}% da receita</small></div><i className="lane-separator">=</i><div className="lane-result"><span>Lucro operacional</span><strong>{moeda(financeiro.saldoRealizado)}</strong><small>Margem de {margem.toFixed(1)}%</small></div></section>
      <section className="metric-grid metric-grid-v2"><CartaoMetrica titulo="Valores a receber" valor={moeda(financeiro.totalReceber)} apoio="Receitas ainda não liquidadas" tom="metric-warn"/><CartaoMetrica titulo="Km rodado" valor={`${numero(financeiro.quilometragemTotal)} km`} apoio="Percurso total da frota"/><CartaoMetrica titulo="Km morto" valor={`${numero(financeiro.kmMorto)} km`} apoio={`${financeiro.quilometragemTotal?(financeiro.kmMorto/financeiro.quilometragemTotal*100).toFixed(1):0}% do percurso total`}/><CartaoMetrica titulo="Custo do km morto" valor={moeda(financeiro.custoKmMorto)} apoio="Km improdutivo × custo por km"/><CartaoMetrica titulo="Receitas previstas" valor={moeda(financeiro.receitaPrevista)} apoio="Ainda não realizadas" tom="metric-neutral"/><CartaoMetrica titulo="Despesas previstas" valor={moeda(financeiro.despesasPrevistas)} apoio="Aprovadas e ainda não pagas" tom="metric-neutral"/></section>
      <section className="panel vehicle-results vehicle-results-v2"><header className="panel-title"><div><span className="eyebrow">Resultado individual</span><h2>Resultado real por veículo</h2></div><Link to="/veiculos">Abrir veículos</Link></header>{financeiro.resultadoPorVeiculo.length?<div className="table-scroll"><table><thead><tr><th>Veículo</th><th>Receitas</th><th>Despesas</th><th>Resultado</th><th>Km morto</th><th>Custo km morto</th></tr></thead><tbody>{financeiro.resultadoPorVeiculo.map(item=><tr key={item.veiculoId}><td><strong>{item.veiculo}</strong></td><td>{moeda(item.receitas)}</td><td>{moeda(item.despesas)}</td><td className={item.resultado>=0?'positive':'negative'}><strong>{moeda(item.resultado)}</strong></td><td>{numero(item.kmMorto)} km</td><td>{moeda(item.custoKmMorto)}</td></tr>)}</tbody></table></div>:<p className="empty-inline">Nenhum resultado por veículo no período.</p>}</section></>:<div className="loading-card">Carregando indicadores financeiros oficiais…</div>}
    {porto?<section className="porto-finance-summary" aria-label="Faturamento Porto"><header><div><span className="eyebrow">Porto Seguro</span><h2>Faturamento separado do caixa</h2></div><Link to="/porto/dashboard">Abrir módulo Porto →</Link></header><div><span>Previsto<strong>{moeda(porto.valorTotalPrevisto)}</strong><small>{porto.quantidadeTotalOps} OPs</small></span><span>Programado<strong>{moeda(porto.valorProgramado)}</strong><small>Ainda não recebido</small></span><span>Recebido no banco<strong>{moeda(porto.valorRecebido)}</strong><small>Confirmação financeira</small></span></div><p>Valores previstos e programados não compõem o caixa, a DRE ou o lucro até o recebimento confirmado.</p></section>:null}
    <p className="calculation-note"><strong>Como calculamos:</strong> lucro operacional = receitas recebidas − despesas aprovadas e pagas. A data financeira da OP vem do recebimento, não da data do atendimento.</p>
  </div>
}
