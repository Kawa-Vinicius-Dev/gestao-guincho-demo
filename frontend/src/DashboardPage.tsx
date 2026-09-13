import { useEffect,useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from './api/http'
import { resumirOrdensPagamentoPorto } from './api/porto'
import { CustoPorSocorrista,ProporcaoServicos,ResultadoPorVeiculo } from './components/Graficos'
import type { Dashboard,ResumoOpsPorto } from './types/modelos'
import { moeda,numero } from './utils/formatadores'

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

function CartaoMetrica({titulo,valor,apoio,tom=''}:{titulo:string;valor:string;apoio:string;tom?:string}){
  return <article className={`metric metric-v2 ${tom}`}><span>{titulo}</span><strong>{valor}</strong><small>{apoio}</small></article>
}

export default function DashboardPage(){
  const [{inicio,fim},setPeriodo]=useState(mesCorrente),[porto,setPorto]=useState<ResumoOpsPorto|null>(null),[financeiro,setFinanceiro]=useState<Dashboard|null>(null),[erro,setErro]=useState('')
  useEffect(()=>{
    if(!inicio||!fim||inicio>fim)return
    const params=new URLSearchParams({dataInicio:inicio,dataFim:fim})
    setErro('');setFinanceiro(null);setPorto(null)
    resumirOrdensPagamentoPorto(params).then(setPorto).catch(e=>setErro(atual=>atual||`Porto: ${e.message}`))
    api<Dashboard>(`/api/dashboard?inicio=${inicio}&fim=${fim}`).then(setFinanceiro).catch(e=>setErro(atual=>atual||`Financeiro: ${e.message}`))
  },[inicio,fim])
  const margem=financeiro?.receitaRecebida?financeiro.saldoRealizado/financeiro.receitaRecebida*100:0
  return <div className="page-enter dashboard-tech">
    <header className="page-heading dashboard-heading"><div><span className="eyebrow">Central financeira · {rotuloPeriodo(inicio,fim)}</span><h1>Visão financeira</h1><p>Quanto entrou, quanto saiu e o lucro real da operação — sem misturar faturamento com resultado.</p></div><div className="heading-actions"><label className="month-picker"><span>De</span><input aria-label="Data inicial" type="date" value={inicio} onChange={e=>setPeriodo(p=>({...p,inicio:e.target.value}))}/></label><label className="month-picker"><span>Até</span><input aria-label="Data final" type="date" value={fim} onChange={e=>setPeriodo(p=>({...p,fim:e.target.value}))}/></label><Link className="button button-primary" to="/despesas?novo=1">+ Registrar despesa</Link></div></header>
    {erro?<div className="form-alert">Não foi possível carregar todos os indicadores oficiais. {erro}</div>:null}
    {financeiro?<><section className="finance-lane" aria-label="Fluxo do resultado operacional"><div><span>Receita do mês</span><strong>{moeda(financeiro.receitaRecebida)}</strong><small>Recebimentos confirmados no financeiro</small></div><i className="lane-separator">−</i><div><span>Despesas do mês</span><strong>{moeda(financeiro.despesasPagas)}</strong><small>{financeiro.receitaRecebida?((financeiro.despesasPagas/financeiro.receitaRecebida)*100).toFixed(1):0}% da receita</small></div><i className="lane-separator">=</i><div className="lane-result"><span>Lucro operacional</span><strong>{moeda(financeiro.saldoRealizado)}</strong><small>Margem de {margem.toFixed(1)}%</small></div></section>
      <section className="metric-grid metric-grid-v2"><CartaoMetrica titulo="Km rodado" valor={`${numero(financeiro.quilometragemTotal)} km`} apoio="Percurso total da frota"/><CartaoMetrica titulo="Km morto" valor={`${numero(financeiro.kmMorto)} km`} apoio={`${financeiro.quilometragemTotal?(financeiro.kmMorto/financeiro.quilometragemTotal*100).toFixed(1):0}% do percurso total`}/><CartaoMetrica titulo="Custo do km morto" valor={moeda(financeiro.custoKmMorto)} apoio="Km improdutivo × custo por km"/><CartaoMetrica titulo="Despesas previstas" valor={moeda(financeiro.despesasPrevistas)} apoio="Aprovadas e ainda não pagas" tom="metric-neutral"/></section>
      {/* Serviço e comissão andam juntos: uma é 20% da outra, e ver só a receita esconde
          metade do que o dia custou. Nenhum dos dois entra de novo no saldo — a receita já
          está em "recebido" e a comissão vira despesa quando é paga. */}
      <section className="panel"><header className="panel-title"><div><span className="eyebrow">Serviços do período</span><h2>Produção e comissão</h2></div><Link to="/comissoes">Abrir comissões</Link></header>
        <div className="fleet-summary">
          <div><span>Serviços pagos</span><strong>{moeda(financeiro.producaoPaga??0)}</strong><small>Valor total do serviço</small></div>
          <div><span>Comissão sobre eles</span><strong>{moeda(financeiro.comissaoSobreProducao??0)}</strong><small>20% do valor acima</small></div>
          <div><span>Ainda não pagos</span><strong>{financeiro.servicosPendentes??0} de {financeiro.servicosDoPeriodo??0}</strong><small>{(financeiro.producaoPendente??0)>0?`${moeda(financeiro.producaoPendente)} aguardando OP`:'Valor só sai quando a Porto fecha a OP'}</small></div>
          <div><span>Comissão a repassar</span><strong>{moeda(financeiro.comissaoAPagar??0)}</strong><small>Já devida, ainda não paga à equipe</small></div>
        </div>
        <ProporcaoServicos pagos={(financeiro.servicosDoPeriodo??0)-(financeiro.servicosPendentes??0)} pendentes={financeiro.servicosPendentes??0} valorPago={financeiro.producaoPaga??0} valorPendente={financeiro.producaoPendente??0}/>
        {(financeiro.servicosPendentes??0)>0?<p className="empty-inline">Serviço prestado não é serviço pago: a Porto só fecha a OP semanas depois. Estes entram na comissão do ciclo em que forem pagos, não no ciclo em que aconteceram.</p>:null}
      </section>
      <section className="panel"><header className="panel-title"><div><span className="eyebrow">Custo por pessoa</span><h2>Gasto por socorrista</h2></div><Link to="/equipe">Abrir socorristas</Link></header>
        <CustoPorSocorrista itens={financeiro.resultadoPorSocorrista??[]}/>
        {financeiro.resultadoPorSocorrista?.length?<div className="table-scroll"><table><thead><tr><th>Socorrista</th><th>Serviços</th><th>Produção</th><th>Comissão</th><th>Outras despesas</th><th>Custo total</th></tr></thead>
          <tbody>{financeiro.resultadoPorSocorrista.map(p=><tr key={p.motoristaId}><td><strong>{p.socorrista}</strong></td><td>{p.servicos}</td><td>{moeda(p.producao)}</td><td>{moeda(p.comissao)}</td><td>{moeda(p.despesas)}</td><td><strong>{moeda(p.custoTotal)}</strong></td></tr>)}</tbody></table></div>
          :null}
      </section>
      <section className="panel vehicle-results vehicle-results-v2"><header className="panel-title"><div><span className="eyebrow">Resultado individual</span><h2>Resultado real por veículo</h2></div><Link to="/veiculos">Abrir veículos</Link></header><ResultadoPorVeiculo itens={financeiro.resultadoPorVeiculo}/>{financeiro.resultadoPorVeiculo.length?<div className="table-scroll"><table><thead><tr><th>Veículo</th><th>Receitas</th><th>Despesas</th><th>Resultado</th><th>Km morto</th><th>Custo km morto</th></tr></thead><tbody>{financeiro.resultadoPorVeiculo.map(item=><tr key={item.veiculoId}><td><strong>{item.veiculo}</strong></td><td>{moeda(item.receitas)}</td><td>{moeda(item.despesas)}</td><td className={item.resultado>=0?'positive':'negative'}><strong>{moeda(item.resultado)}</strong></td><td>{numero(item.kmMorto)} km</td><td>{moeda(item.custoKmMorto)}</td></tr>)}</tbody></table></div>:null}</section></>:<div className="loading-card">Carregando indicadores financeiros oficiais…</div>}
    {porto?<section className="porto-finance-summary" aria-label="Faturamento Porto"><header><div><span className="eyebrow">Porto Seguro</span><h2>Faturamento separado do caixa</h2></div><Link to="/porto/dashboard">Abrir módulo Porto →</Link></header><div><span>Previsto<strong>{moeda(porto.valorTotalPrevisto)}</strong><small>{porto.quantidadeTotalOps} OPs</small></span><span>Programado<strong>{moeda(porto.valorProgramado)}</strong><small>Ainda não recebido</small></span><span>Recebido no banco<strong>{moeda(porto.valorRecebido)}</strong><small>Confirmação financeira</small></span></div><p>Valores previstos e programados não compõem o caixa, a DRE ou o lucro até o recebimento confirmado.</p></section>:null}
    <p className="calculation-note"><strong>Como calculamos:</strong> lucro operacional = receitas recebidas − despesas aprovadas e pagas. A data financeira da OP vem do recebimento, não da data do atendimento.</p>
  </div>
}
