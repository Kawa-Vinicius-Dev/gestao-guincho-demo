import { useEffect,useState,type FormEvent } from 'react'
import { Carregando } from '../components/EstadoPagina'
import { Selecao } from '../components/Campos'
import { listarMotoristas } from '../dados/motoristas'
import { baixarRelatorioComissoes } from '../dados/relatorios'
import { lerComissaoDoCiclo, listarPeriodosComissoes, registrarPagamentoComissao, resumirComissoes } from '../dados/comissoes'
import type { CalendarioPorto,Comissao,Motorista,ResumoComissao } from '../types/modelos'
import { data,moeda } from '../utils/formatadores'
import { periodoCorrente } from '../utils/periodos'
import { Modal } from '../components/Modal'

export default function ComissoesPage(){
  const [periodos,setPeriodos]=useState<CalendarioPorto[]>([]),[motoristas,setMotoristas]=useState<Motorista[]>([]),[periodoId,setPeriodoId]=useState(0),[motoristaId,setMotoristaId]=useState(0),[itens,setItens]=useState<ResumoComissao[]>([]),[detalhe,setDetalhe]=useState<Comissao|null>(null),[erro,setErro]=useState(''),[mensagem,setMensagem]=useState(''),[exportando,setExportando]=useState(false)
  useEffect(()=>{Promise.all([listarPeriodosComissoes(),listarMotoristas()]).then(([p,m])=>{setPeriodos(p);setMotoristas(m);const atual=periodoCorrente(p);if(atual)setPeriodoId(atual.id);if(!atual)setCarregando(false)}).catch(e=>{setErro(e.message);setCarregando(false)})},[])
  const [carregando,setCarregando]=useState(true)
  useEffect(()=>{if(!periodoId)return;setCarregando(true);resumirComissoes(periodoId,motoristaId||undefined).then(setItens).catch(e=>setErro(e.message)).finally(()=>setCarregando(false))},[periodoId,motoristaId])
  async function abrir(id:number){try{setDetalhe(await lerComissaoDoCiclo(periodoId,id))}catch(e){setErro((e as Error).message)}}
  async function pagar(evento:FormEvent<HTMLFormElement>){evento.preventDefault();if(!detalhe)return;const form=new FormData(evento.currentTarget)
    try{await registrarPagamentoComissao(detalhe.motoristaId,periodoId,String(form.get('dataPagamento')),String(form.get('formaPagamento')),String(form.get('observacoes')||''));const [atualizado,resumo]=await Promise.all([lerComissaoDoCiclo(periodoId,detalhe.motoristaId),resumirComissoes(periodoId,motoristaId||undefined)]);setDetalhe(atualizado);setItens(resumo);setErro('');setMensagem('Pagamento registrado no financeiro oficial.')}
    catch(e){setErro((e as Error).message)}
  }
  async function exportar(){setErro('');setExportando(true)
    try{await baixarRelatorioComissoes(periodoId)}
    catch(e){setErro((e as Error).message)}
    finally{setExportando(false)}
  }
  return <div className="page-enter commission-page"><header className="page-heading"><div><span className="eyebrow">Equipe e pagamentos</span><h1>Comissões</h1><p>Conferência auditável das OS pagas e alimentações aprovadas.</p></div><button className="button button-ghost" disabled={!periodoId||exportando} onClick={()=>void exportar()}>{exportando?'Gerando CSV…':'Exportar CSV'}</button></header>{erro?<div className="form-alert">{erro}</div>:null}{carregando?<Carregando/>:null}
    {mensagem?<div className="success-notice">{mensagem}</div>:null}
    <section className="panel"><div className="ledger-filters"><Selecao rotulo="Período financeiro" vazio="Selecione" value={periodoId||''} onChange={e=>setPeriodoId(Number(e.target.value))}
      opcoes={periodos.map(p=>({valor:p.id,texto:`${p.descricao} · ${data(p.competenciaInicio)} a ${data(p.competenciaFim)}`}))}/>
      <Selecao rotulo="Socorrista" vazio="Todos" value={motoristaId||''} onChange={e=>setMotoristaId(Number(e.target.value))}
      opcoes={motoristas.map(m=>({valor:m.id,texto:m.nome}))}/></div>
      <div className="table-scroll"><table><thead><tr><th>Socorrista</th><th>Serviços pagos</th><th>Produção paga</th><th>Comissão 20%</th><th>Alimentação</th><th>Líquido</th><th>Pagamento</th><th/></tr></thead><tbody>{itens.map(item=><tr key={item.motoristaId}><td><strong>{item.socorrista}</strong></td><td>{item.quantidadeServicosPagos}</td><td>{moeda(item.producaoPaga)}</td><td>{moeda(item.comissaoBruta)}</td><td>{moeda(item.alimentacaoAprovada)}</td><td className={item.liquido<0?'negative':'positive'}><strong>{moeda(item.liquido)}</strong></td><td>{item.pagamento?`Pago em ${data(item.pagamento.dataPagamento)}`:item.liquido>0?'Pendente':'Sem desembolso'}</td><td><button className="table-action" onClick={()=>void abrir(item.motoristaId)}>Detalhar</button></td></tr>)}</tbody></table></div></section>
    {detalhe?<Modal etiqueta={detalhe.periodo} titulo={detalhe.socorrista} className="commission-detail" aoFechar={()=>setDetalhe(null)}><div className="porto-detail-summary"><span>Produção<strong>{moeda(detalhe.producaoPaga)}</strong></span><span>Comissão<strong>{moeda(detalhe.comissaoBruta)}</strong></span><span>Alimentação<strong>{moeda(detalhe.alimentacaoAprovada)}</strong></span><span>Líquido<strong>{moeda(detalhe.liquido)}</strong></span></div>
      {detalhe.pagamento?<div className="success-notice"><strong>Pagamento registrado</strong> em {data(detalhe.pagamento.dataPagamento)} no valor de {moeda(detalhe.pagamento.valorPago)}. Despesa #{detalhe.pagamento.despesaId}.</div>:detalhe.liquido>0?<form className="form-grid three-columns" onSubmit={pagar}><label className="field"><span>Data do pagamento</span><input name="dataPagamento" type="date" required/></label><Selecao rotulo="Forma de pagamento" name="formaPagamento" defaultValue="PIX"
        opcoes={[{valor:'PIX',texto:'PIX'},{valor:'Transferência',texto:'Transferência'},
          {valor:'Dinheiro',texto:'Dinheiro'},{valor:'Outro',texto:'Outro'}]}/><label className="field"><span>Observações</span><input name="observacoes" autoCapitalize="sentences" autoComplete="off"/></label><div className="modal-actions field-wide"><button className="button button-primary">Registrar pagamento de {moeda(detalhe.liquido)}</button></div></form>:<div className="form-alert">Sem valor positivo a desembolsar. O líquido negativo permanece visível e não gera despesa de pagamento.</div>}
      <h3>Serviços que formam a comissão</h3><div className="table-scroll"><table><thead><tr><th>OS</th><th>Atendimento</th><th>OP</th><th>Valor</th><th>Comissão</th></tr></thead><tbody>{detalhe.servicos.map(s=><tr key={s.id}><td>{s.numeroOs}</td><td>{data(s.dataAtendimento)}</td><td>{s.numeroOp}</td><td>{moeda(s.valorServico)}</td><td>{moeda(s.comissaoServico)}</td></tr>)}</tbody></table></div>
      <h3>Alimentações do período</h3><div className="table-scroll"><table><thead><tr><th>Data</th><th>Valor</th><th>Situação</th><th>Observação</th></tr></thead><tbody>{detalhe.alimentacoes.map(a=><tr key={a.id}><td>{data(a.data)}</td><td>{moeda(a.valor)}</td><td>{a.aprovada?'Aprovada':a.situacao.toLowerCase()}</td><td>{a.observacoes||'—'}</td></tr>)}</tbody></table></div>
    </Modal>:null}
  </div>
}
