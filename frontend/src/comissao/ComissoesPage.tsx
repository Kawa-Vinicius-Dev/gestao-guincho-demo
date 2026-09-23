import { useEffect,useState } from 'react'
import { Carregando } from '../components/EstadoPagina'
import { Selecao } from '../components/Campos'
import { listarMotoristas } from '../dados/motoristas'
import { baixarRelatorioComissoes } from '../dados/relatorios'
import { lerComissaoDaOp, lerPercentualPadrao, listarComissaoPrevista, listarPeriodosComissao, resumirComissoes, type ComissaoPrevista } from '../dados/comissoes'
import { PercentualDasOps } from './PercentualDasOps'
import type { Comissao,Motorista,ResumoComissao } from '../types/modelos'
import { data,moeda } from '../utils/formatadores'
import { rotuloPeriodo, type PeriodoPorto } from '../utils/periodos'
import { globalDoPeriodoPorto, periodoPortoDoGlobal, usePeriodoGlobal } from '../utils/periodoGlobal'
import { Modal } from '../components/Modal'
import { useAoVivo } from '../dados/aoVivo'

/**
 * Comissoes da OP.
 *
 * Nao ha botao de pagar: quando a OP chega, a comissao de cada socorrista ja
 * nasce como despesa paga no fim do periodo, e se recalcula sozinha quando uma
 * OS ganha dono ou entra um gasto marcado para descontar. Esta tela confere.
 */
export default function ComissoesPage(){
  const [periodos,setPeriodos]=useState<PeriodoPorto[]>([]),[motoristas,setMotoristas]=useState<Motorista[]>([]),[motoristaId,setMotoristaId]=useState(0),[itens,setItens]=useState<ResumoComissao[]>([]),[detalhe,setDetalhe]=useState<Comissao|null>(null),[erro,setErro]=useState(''),[exportando,setExportando]=useState('')
  const [global,setGlobal]=usePeriodoGlobal()
  const [prevista,setPrevista]=useState<ComissaoPrevista[]>([])
  const [padrao,setPadrao]=useState(0.2)
  useEffect(()=>{lerPercentualPadrao().then(setPadrao).catch(()=>{})},[])
  const periodoId=periodoPortoDoGlobal(periodos,global)?.id??''
  const setPeriodoId=(id:string)=>{const p=periodos.find(x=>x.id===id);const novo=p&&globalDoPeriodoPorto(p);if(novo)setGlobal(novo)}
  const ids=periodos.find(p=>p.id===periodoId)?.ids??[]
  useEffect(()=>{Promise.all([listarPeriodosComissao(),listarMotoristas()]).then(([p,m])=>{setPeriodos(p);setMotoristas(m);if(!p.length)setCarregando(false)}).catch(e=>{setErro(e.message);setCarregando(false)})},[])
  const [carregando,setCarregando]=useState(true)
  // Prevista sai do periodo, e nao das OPs: o que ainda nao tem OP e justamente
  // o que nao esta em nenhuma delas.
  useEffect(()=>{if(!global.inicio||!global.fim)return
    listarComissaoPrevista(global.inicio,global.fim,motoristaId||undefined).then(setPrevista).catch(()=>setPrevista([]))},[global.inicio,global.fim,motoristaId])
  useEffect(()=>{if(!ids.length)return;setCarregando(true);resumirComissoes(ids,motoristaId||undefined).then(setItens).catch(e=>setErro(e.message)).finally(()=>setCarregando(false))},[periodoId,motoristaId,periodos])
  // OS que ganha dono ou gasto marcado muda a comissao na hora, detalhe aberto inclusive.
  useAoVivo(()=>{if(!ids.length)return
    resumirComissoes(ids,motoristaId||undefined).then(setItens).catch(e=>setErro(e.message))
    if(detalhe)lerComissaoDaOp(ids,detalhe.motoristaId).then(setDetalhe).catch(e=>setErro(e.message))})
  async function abrir(id:number){try{setDetalhe(await lerComissaoDaOp(ids,id))}catch(e){setErro((e as Error).message)}}
  async function exportar(formato:'excel'|'pdf'){setErro('');setExportando(formato)
    const escolhido=periodos.find(p=>p.id===periodoId)
    try{await baixarRelatorioComissoes(ids,escolhido?rotuloPeriodo(escolhido):'',formato)}
    catch(e){setErro((e as Error).message)}
    finally{setExportando('')}
  }
  return <div className="page-enter commission-page"><header className="page-heading"><div><span className="eyebrow">Equipe e pagamentos</span><h1>Comissões</h1><p>A porcentagem da OP (ou a de cada socorrista) sobre os serviços pagos, menos os gastos marcados para descontar. Já entra em despesas sozinha.</p></div><div className="heading-actions"><button className="button button-ghost" disabled={!periodoId||exportando!==''} onClick={()=>void exportar('pdf')}>{exportando==='pdf'?'Gerando PDF…':'Exportar PDF'}</button><button className="button button-primary" disabled={!periodoId||exportando!==''} onClick={()=>void exportar('excel')}>{exportando==='excel'?'Gerando Excel…':'Exportar Excel'}</button></div></header>{erro?<div className="form-alert">{erro}</div>:null}{carregando?<Carregando/>:null}
    <section className="panel"><div className="ledger-filters"><Selecao rotulo="Período" vazio="Selecione" value={periodoId} onChange={e=>setPeriodoId(e.target.value)}
      opcoes={periodos.map(p=>({valor:p.id,texto:rotuloPeriodo(p)}))}/>
      <Selecao rotulo="Socorrista" vazio="Todos" value={motoristaId||''} onChange={e=>setMotoristaId(Number(e.target.value))}
      opcoes={motoristas.map(m=>({valor:m.id,texto:m.nome}))}/></div>
      <div className="table-scroll"><table><thead><tr><th>Socorrista</th><th>Serviços pagos</th><th>Produção paga</th><th>Comissão</th><th>Descontos</th><th>Líquido</th><th>Em despesas</th><th/></tr></thead><tbody>{itens.map(item=><tr key={item.motoristaId}><td><strong>{item.socorrista}</strong></td><td>{item.quantidadeServicosPagos}</td><td>{moeda(item.producaoPaga)}</td><td>{moeda(item.comissaoBruta)}</td><td>{moeda(item.descontos)}</td><td className={item.liquido<0?'negative':'positive'}><strong>{moeda(item.liquido)}</strong></td><td>{item.pagamento?`Lançada em ${data(item.pagamento.dataPagamento)}`:'Sem valor a lançar'}</td><td><button className="table-action" onClick={()=>void abrir(item.motoristaId)}>Detalhar</button></td></tr>)}</tbody></table></div></section>
    {ids.length?<PercentualDasOps ids={ids} padrao={padrao} aoMudar={()=>{resumirComissoes(ids,motoristaId||undefined).then(setItens).catch(e=>setErro(e.message))}}/>:null}
    {prevista.length?<section className="panel"><header className="panel-title"><div><span className="eyebrow">Ainda sem OP</span><h2>Comissão prevista</h2><p>A comissão sobre o que já foi informado para os serviços desta competência que ainda não entraram numa OP. Não entra em despesas: só vira comissão quando a OP chegar.</p></div></header>
      <div className="table-scroll"><table><thead><tr><th>Socorrista</th><th>Serviços</th><th>Sem valor</th><th>Valor previsto</th><th>Comissão prevista</th></tr></thead>
      <tbody>{prevista.map(p=><tr key={p.motoristaId}><td><strong>{p.socorrista}</strong></td><td>{p.servicos}</td><td>{p.semValor||'—'}</td><td>{moeda(p.valorPrevisto)}</td><td>{moeda(p.comissaoPrevista)}</td></tr>)}</tbody></table></div></section>:null}
    {detalhe?<Modal etiqueta={detalhe.periodo} titulo={detalhe.socorrista} className="commission-detail" fecharAoClicarFora aoFechar={()=>setDetalhe(null)}><div className="porto-detail-summary"><span>Produção<strong>{moeda(detalhe.producaoPaga)}</strong></span><span>Comissão<strong>{moeda(detalhe.comissaoBruta)}</strong></span><span>Descontos<strong>{moeda(detalhe.descontos)}</strong></span><span>Líquido<strong>{moeda(detalhe.liquido)}</strong></span></div>
      {detalhe.pagamento
        ?<div className="success-notice"><strong>Lançada em despesas</strong> em {data(detalhe.pagamento.dataPagamento)}, no valor de {moeda(detalhe.pagamento.valorPago)}.</div>
        :<div className="form-alert">Sem valor positivo: os descontos são maiores que a comissão, e nada entra em despesas.</div>}
      <h3>Serviços que formam a comissão</h3><div className="table-scroll"><table><thead><tr><th>OS</th><th>Atendimento</th><th>OP</th><th>Valor</th><th>Comissão</th></tr></thead><tbody>{detalhe.servicos.map(s=><tr key={s.id}><td>{s.numeroOs}</td><td>{data(s.dataAtendimento)}</td><td>{s.numeroOp}</td><td>{moeda(s.valorServico)}</td><td>{moeda(s.comissaoServico)}</td></tr>)}</tbody></table></div>
      <h3>Gastos do período</h3>
      {detalhe.gastos.length
        ?<div className="table-scroll"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Viatura</th><th>Valor</th><th>Desconta da comissão</th></tr></thead><tbody>{detalhe.gastos.map(g=><tr key={g.id}><td>{data(g.data)}</td><td><strong>{g.descricao}</strong>{g.observacoes?<small>{g.observacoes}</small>:null}</td><td>{g.categoria}</td><td>{g.veiculo||'—'}</td><td>{moeda(g.valor)}</td><td>{g.descontaDaComissao?(g.aprovada?'Sim':'Sim, aguardando aprovação'):g.descontaEmOutraOp?'Em outra OP do período':'Não'}</td></tr>)}</tbody></table></div>
        :<p className="empty-inline">Nenhum gasto no nome dele neste período.</p>}
    </Modal>:null}
  </div>
}
