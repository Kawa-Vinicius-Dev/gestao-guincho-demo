import { useEffect, useState, type FormEvent } from 'react'
import { baixarRelatorioPorto, listarCalendarioPorto, obterDashboardPorto } from '../dados/porto'
import type { CalendarioPorto, DashboardPorto } from '../types/modelos'
import { hojeIso, moeda } from '../utils/formatadores'
import { Carregando } from '../components/EstadoPagina'
import { Campo, Selecao } from '../components/Campos'

/**
 * O periodo do painel e o ciclo de pagamento da Porto, nao um mes do calendario
 * comum: e o ciclo que define em qual recorte um servico entra, porque e ele que
 * decide quando o dinheiro cai e em qual comissao o servico conta. Escolher o
 * ciclo preenche as duas datas; quem precisar de outro recorte edita as datas a
 * mao, e ai o periodo volta a ser "Personalizado".
 */
const primeiroDiaDoMes = () => `${hojeIso().slice(0, 8)}01`

export default function PortoDashboardPage(){
  const [dados,setDados]=useState<DashboardPorto|null>(null),[erro,setErro]=useState(''),[parametros,setParametros]=useState(new URLSearchParams())
  const [visao,setVisao]=useState<'PRODUCAO'|'PAGAMENTOS'>('PRODUCAO'),[baixando,setBaixando]=useState('')
  const [ciclos,setCiclos]=useState<CalendarioPorto[]>([]),[ciclo,setCiclo]=useState('')
  const [inicio,setInicio]=useState(primeiroDiaDoMes()),[fim,setFim]=useState(hojeIso())
  async function carregar(params:URLSearchParams){setErro('');try{setDados(await obterDashboardPorto(params));setParametros(new URLSearchParams(params))}catch(e){setErro((e as Error).message)}}
  const [carregando,setCarregando]=useState(true)
  // O calendario e conveniencia: se nao carregar, as datas continuam valendo.
  useEffect(()=>{listarCalendarioPorto().then(setCiclos).catch(()=>setCiclos([]))},[])
  useEffect(()=>{const params=new URLSearchParams({periodo:'PERSONALIZADO',visao:'PRODUCAO',dataInicio:primeiroDiaDoMes(),dataFim:hojeIso()});void carregar(params).finally(()=>setCarregando(false))},[])
  async function trocarVisao(nova:'PRODUCAO'|'PAGAMENTOS'){setVisao(nova);const params=new URLSearchParams(parametros);params.set('visao',nova);await carregar(params)}
  /** Escolher o ciclo preenche as datas; a competencia manda, e a data de pagamento e o recuo quando o ciclo nao a declara. */
  function escolherCiclo(id:string){setCiclo(id);const c=ciclos.find(x=>String(x.id)===id);if(!c)return;setInicio(c.competenciaInicio||c.dataPagamento);setFim(c.competenciaFim||c.dataPagamento)}
  function editarData(qual:'inicio'|'fim',valor:string){setCiclo('');if(qual==='inicio')setInicio(valor);else setFim(valor)}
  async function aplicar(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget),params=new URLSearchParams({periodo:'PERSONALIZADO',visao,dataInicio:inicio,dataFim:fim});for(const nome of ['numeroOs','numeroOp','especialidade','socorrista','statusOperacional','statusFinanceiro','statusConciliacao']){const valor=String(form.get(nome)??'');if(valor)params.set(nome,valor)}await carregar(params)}
  async function exportar(formato:'excel'|'pdf'){setErro('');setBaixando(formato);try{await baixarRelatorioPorto(formato,parametros)}catch(e){setErro((e as Error).message)}finally{setBaixando('')}}
  return <div className="page-enter dashboard-tech"><header className="page-heading"><div><span className="eyebrow">Porto Seguro</span><h1>Dashboard Porto</h1><p>Serviços realizados, pagamentos programados e valores efetivamente recebidos.</p></div><div className="heading-actions"><button className="button button-ghost" disabled={baixando!==''} onClick={()=>void exportar('pdf')}>{baixando==='pdf'?'Gerando PDF…':'Exportar PDF'}</button><button className="button button-primary" disabled={baixando!==''} onClick={()=>void exportar('excel')}>{baixando==='excel'?'Gerando Excel…':'Exportar Excel'}</button></div></header>{erro?<div className="form-alert">{erro}</div>:null}{carregando?<Carregando/>:null}
    <section className="panel"><div className="porto-view-switch" role="group" aria-label="Linha do tempo Porto"><button className={visao==='PRODUCAO'?'active':''} onClick={()=>void trocarVisao('PRODUCAO')}>Produção</button><button className={visao==='PAGAMENTOS'?'active':''} onClick={()=>void trocarVisao('PAGAMENTOS')}>Pagamentos</button></div><form className="ledger-filters porto-dashboard-filters" onSubmit={aplicar}>
      <Selecao rotulo="Período" vazio="Personalizado" value={ciclo} onChange={e=>escolherCiclo(e.target.value)}
        opcoes={ciclos.map(c=>({valor:String(c.id),texto:c.descricao}))}/>
      <Campo rotulo="Data inicial"><input name="dataInicio" type="date" value={inicio} onChange={e=>editarData('inicio',e.target.value)} required/></Campo>
      <Campo rotulo="Data final"><input name="dataFim" type="date" value={fim} onChange={e=>editarData('fim',e.target.value)} required/></Campo>
      <Campo rotulo="Número da OS" className="filter-grow"><input name="numeroOs"/></Campo>
      <Campo rotulo="Número da OP"><input name="numeroOp"/></Campo>
      <Campo rotulo="Especialidade"><input name="especialidade"/></Campo>
      <Campo rotulo="Socorrista"><input name="socorrista"/></Campo>
      <button className="button button-primary">Aplicar filtros</button>
    </form></section>
    {dados?<><section className="porto-finance-lane"><article><span>Realizado</span><strong>{moeda(dados.valorTotalRealizado)}</strong><small>{dados.quantidadeTotalServicos} serviços executados</small></article><article><span>Programado</span><strong>{moeda(dados.valorProgramado)}</strong><small>{dados.quantidadePagamentoProgramado} ordens de pagamento</small></article><article><span>Recebido</span><strong>{moeda(dados.valorRecebido)}</strong><small>{dados.quantidadeRecebidas} recebimentos confirmados</small></article></section>
      <section className="metric-grid porto-dashboard-metrics"><article className="metric"><span>Serviços realizados</span><strong>{dados.quantidadeTotalServicos}</strong></article><article className="metric"><span>Aguardando OP</span><strong>{dados.quantidadeAguardandoOp}</strong><small>{moeda(dados.valorAguardandoOp)}</small></article><article className="metric"><span>OPs com divergência</span><strong>{dados.quantidadeComDivergencia}</strong><small>{moeda(dados.valorTotalDivergencias)}</small></article><article className="metric"><span>Serviços pendentes</span><strong>{dados.quantidadeServicosPendentes}</strong><small>{moeda(dados.valorServicosPendentes)}</small></article><article className="metric"><span>Serviços devolvidos</span><strong>{dados.quantidadeServicosDevolvidos}</strong></article><article className="metric"><span>OPs vencidas</span><strong>{dados.quantidadeVencidasNaoRecebidas}</strong><small>{moeda(dados.valorVencidoNaoRecebido)}</small></article></section>
      <section className="porto-breakdowns"><article className="panel"><header className="panel-title"><h2>Por especialidade</h2></header><div className="table-scroll"><table><thead><tr><th>Especialidade</th><th>Quantidade</th><th>Valor</th></tr></thead><tbody>{dados.porEspecialidade.map(x=><tr key={x.chave}><td>{x.chave}</td><td>{x.quantidade}</td><td>{moeda(x.valor)}</td></tr>)}</tbody></table></div></article><article className="panel"><header className="panel-title"><h2>Por socorrista</h2></header><div className="table-scroll"><table><thead><tr><th>Socorrista</th><th>Quantidade</th><th>Valor</th></tr></thead><tbody>{dados.porSocorrista.map(x=><tr key={x.chave}><td>{x.chave}</td><td>{x.quantidade}</td><td>{moeda(x.valor)}</td></tr>)}</tbody></table></div></article></section></>:null}
  </div>
}
