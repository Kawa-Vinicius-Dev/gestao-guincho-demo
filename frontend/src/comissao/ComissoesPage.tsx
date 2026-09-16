import { useEffect,useState } from 'react'
import { Carregando } from '../components/EstadoPagina'
import { Selecao } from '../components/Campos'
import { listarMotoristas } from '../dados/motoristas'
import { baixarRelatorioComissoes } from '../dados/relatorios'
import { lerComissaoDaOp, listarOpsComissao, resumirComissoes } from '../dados/comissoes'
import type { Comissao,Motorista,OrdemPagamentoPorto,ResumoComissao } from '../types/modelos'
import { data,moeda } from '../utils/formatadores'
import { opCorrente, rotuloOp } from '../utils/periodos'
import { Modal } from '../components/Modal'

/**
 * Comissoes da OP.
 *
 * Nao ha botao de pagar: quando a OP chega, a comissao de cada socorrista ja
 * nasce como despesa paga no fim do periodo, e se recalcula sozinha quando uma
 * OS ganha dono ou entra um gasto marcado para descontar. Esta tela confere.
 */
export default function ComissoesPage(){
  const [periodos,setPeriodos]=useState<OrdemPagamentoPorto[]>([]),[motoristas,setMotoristas]=useState<Motorista[]>([]),[periodoId,setPeriodoId]=useState(0),[motoristaId,setMotoristaId]=useState(0),[itens,setItens]=useState<ResumoComissao[]>([]),[detalhe,setDetalhe]=useState<Comissao|null>(null),[erro,setErro]=useState(''),[exportando,setExportando]=useState(false)
  useEffect(()=>{Promise.all([listarOpsComissao(),listarMotoristas()]).then(([p,m])=>{setPeriodos(p);setMotoristas(m);const atual=opCorrente(p);if(atual)setPeriodoId(atual.id);if(!atual)setCarregando(false)}).catch(e=>{setErro(e.message);setCarregando(false)})},[])
  const [carregando,setCarregando]=useState(true)
  useEffect(()=>{if(!periodoId)return;setCarregando(true);resumirComissoes(periodoId,motoristaId||undefined).then(setItens).catch(e=>setErro(e.message)).finally(()=>setCarregando(false))},[periodoId,motoristaId])
  async function abrir(id:number){try{setDetalhe(await lerComissaoDaOp(periodoId,id))}catch(e){setErro((e as Error).message)}}
  async function exportar(){setErro('');setExportando(true)
    try{await baixarRelatorioComissoes(periodoId)}
    catch(e){setErro((e as Error).message)}
    finally{setExportando(false)}
  }
  return <div className="page-enter commission-page"><header className="page-heading"><div><span className="eyebrow">Equipe e pagamentos</span><h1>Comissões</h1><p>20% dos serviços pagos na OP, menos os gastos marcados para descontar. Já entra em despesas sozinha.</p></div><button className="button button-ghost" disabled={!periodoId||exportando} onClick={()=>void exportar()}>{exportando?'Gerando CSV…':'Exportar CSV'}</button></header>{erro?<div className="form-alert">{erro}</div>:null}{carregando?<Carregando/>:null}
    <section className="panel"><div className="ledger-filters"><Selecao rotulo="Ordem de pagamento" vazio="Selecione" value={periodoId||''} onChange={e=>setPeriodoId(Number(e.target.value))}
      opcoes={periodos.map(p=>({valor:p.id,texto:rotuloOp(p)}))}/>
      <Selecao rotulo="Socorrista" vazio="Todos" value={motoristaId||''} onChange={e=>setMotoristaId(Number(e.target.value))}
      opcoes={motoristas.map(m=>({valor:m.id,texto:m.nome}))}/></div>
      <div className="table-scroll"><table><thead><tr><th>Socorrista</th><th>Serviços pagos</th><th>Produção paga</th><th>Comissão 20%</th><th>Descontos</th><th>Líquido</th><th>Em despesas</th><th/></tr></thead><tbody>{itens.map(item=><tr key={item.motoristaId}><td><strong>{item.socorrista}</strong></td><td>{item.quantidadeServicosPagos}</td><td>{moeda(item.producaoPaga)}</td><td>{moeda(item.comissaoBruta)}</td><td>{moeda(item.descontos)}</td><td className={item.liquido<0?'negative':'positive'}><strong>{moeda(item.liquido)}</strong></td><td>{item.pagamento?`Lançada em ${data(item.pagamento.dataPagamento)}`:'Sem valor a lançar'}</td><td><button className="table-action" onClick={()=>void abrir(item.motoristaId)}>Detalhar</button></td></tr>)}</tbody></table></div></section>
    {detalhe?<Modal etiqueta={detalhe.periodo} titulo={detalhe.socorrista} className="commission-detail" aoFechar={()=>setDetalhe(null)}><div className="porto-detail-summary"><span>Produção<strong>{moeda(detalhe.producaoPaga)}</strong></span><span>Comissão<strong>{moeda(detalhe.comissaoBruta)}</strong></span><span>Descontos<strong>{moeda(detalhe.descontos)}</strong></span><span>Líquido<strong>{moeda(detalhe.liquido)}</strong></span></div>
      {detalhe.pagamento
        ?<div className="success-notice"><strong>Lançada em despesas</strong> em {data(detalhe.pagamento.dataPagamento)}, no valor de {moeda(detalhe.pagamento.valorPago)}.</div>
        :<div className="form-alert">Sem valor positivo: os descontos são maiores que a comissão, e nada entra em despesas.</div>}
      <h3>Serviços que formam a comissão</h3><div className="table-scroll"><table><thead><tr><th>OS</th><th>Atendimento</th><th>OP</th><th>Valor</th><th>Comissão</th></tr></thead><tbody>{detalhe.servicos.map(s=><tr key={s.id}><td>{s.numeroOs}</td><td>{data(s.dataAtendimento)}</td><td>{s.numeroOp}</td><td>{moeda(s.valorServico)}</td><td>{moeda(s.comissaoServico)}</td></tr>)}</tbody></table></div>
      <h3>Gastos do período</h3>
      {detalhe.gastos.length
        ?<div className="table-scroll"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Viatura</th><th>Valor</th><th>Desconta da comissão</th></tr></thead><tbody>{detalhe.gastos.map(g=><tr key={g.id}><td>{data(g.data)}</td><td><strong>{g.descricao}</strong>{g.observacoes?<small>{g.observacoes}</small>:null}</td><td>{g.categoria}</td><td>{g.veiculo||'—'}</td><td>{moeda(g.valor)}</td><td>{g.descontaDaComissao?(g.aprovada?'Sim':'Sim, aguardando aprovação'):'Não'}</td></tr>)}</tbody></table></div>
        :<p className="empty-inline">Nenhum gasto no nome dele neste período.</p>}
    </Modal>:null}
  </div>
}
