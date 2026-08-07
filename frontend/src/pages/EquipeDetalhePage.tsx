import { useEffect,useState } from 'react'
import { Link,useParams } from 'react-router-dom'
import { listarPeriodosComissoes,obterDetalheFuncionario } from '../api/comissoes'
import { Carregando,ErroPagina } from '../components/EstadoPagina'
import type { CalendarioPorto,DetalheFuncionario } from '../types/modelos'
import { data,moeda } from '../utils/formatadores'

const statusPagamento={PAGO:'Pago',PAGO_EM_OUTRO_PERIODO:'Pago em outro período',AGUARDANDO_PAGAMENTO:'Aguardando pagamento'} as const

export default function EquipeDetalhePage(){
  const motoristaId=Number(useParams().id)
  const [periodos,setPeriodos]=useState<CalendarioPorto[]>([]),[periodoId,setPeriodoId]=useState(0),[detalhe,setDetalhe]=useState<DetalheFuncionario|null>(null)
  const [carregandoPeriodos,setCarregandoPeriodos]=useState(true),[carregandoDetalhe,setCarregandoDetalhe]=useState(false),[erro,setErro]=useState('')
  useEffect(()=>{listarPeriodosComissoes().then(lista=>{setPeriodos(lista);const atual=[...lista].reverse().find(item=>item.ativo)??lista.at(-1);if(atual)setPeriodoId(atual.id)}).catch(e=>setErro(e.message)).finally(()=>setCarregandoPeriodos(false))},[])
  useEffect(()=>{if(!motoristaId||!periodoId)return;setCarregandoDetalhe(true);setErro('');obterDetalheFuncionario(motoristaId,periodoId).then(setDetalhe).catch(e=>setErro(e.message)).finally(()=>setCarregandoDetalhe(false))},[motoristaId,periodoId])
  if(carregandoPeriodos)return <Carregando/>
  if(erro&&!detalhe)return <ErroPagina mensagem={erro}/>
  return <div className="page-enter employee-detail-page">
    <header className="employee-detail-heading">
      <div><Link className="back-link" to="/equipe">← Voltar para funcionários</Link><span className="eyebrow">Ficha administrativa</span><h1>{detalhe?.nome||'Funcionário'}</h1><p>Histórico operacional e composição financeira por fechamento Porto.</p></div>
      <label className="month-picker"><span>Período Porto</span><select aria-label="Período Porto" value={periodoId||''} onChange={event=>setPeriodoId(Number(event.target.value))}><option value="">Selecione</option>{periodos.map(periodo=><option key={periodo.id} value={periodo.id}>{periodo.descricao} · {data(periodo.competenciaInicio)} a {data(periodo.competenciaFim)}</option>)}</select></label>
    </header>
    {erro?<div className="form-alert" role="alert">{erro}</div>:null}
    {carregandoDetalhe&&!detalhe?<Carregando/>:null}
    {detalhe?<>
      <section className="employee-identity panel" aria-label="Informações gerais do funcionário">
        <div className="employee-monogram">{detalhe.nome.split(' ').map(parte=>parte[0]).slice(0,2).join('')}</div>
        <div className="employee-name"><span className={`staff-status ${detalhe.ativo?'staff-disponivel':'staff-folga'}`}>{detalhe.ativo?'Ativo':'Inativo'}</span><strong>{detalhe.nome}</strong><small>{detalhe.qra||'QRA não informado'}</small></div>
        <dl><div><dt>Telefone</dt><dd>{detalhe.telefone||'Não informado'}</dd></div><div><dt>E-mail / usuário</dt><dd>{detalhe.email||'Não vinculado'}</dd></div></dl>
        <div className="employee-vehicles"><span>Viaturas utilizadas no período</span><div>{detalhe.veiculosUtilizados.length?detalhe.veiculosUtilizados.map(viatura=><strong key={viatura}>{viatura}</strong>):<small>Nenhuma viatura identificada nas OS deste período.</small>}</div></div>
      </section>

      <section className="metric-grid employee-summary" aria-label="Resumo do período">
        <article className="metric"><span>Total de serviços prestados</span><strong>{detalhe.totalServicosPrestados}</strong><small>Inclui OS ainda não pagas</small></article>
        <article className="metric"><span>Serviços já pagos</span><strong>{detalhe.comissao.quantidadeServicosPagos}</strong><small>Somente OP efetivamente paga</small></article>
        <article className="metric"><span>Produção paga</span><strong>{moeda(detalhe.comissao.producaoPaga)}</strong></article>
        <article className="metric metric-focus"><span>Comissão 20%</span><strong>{moeda(detalhe.comissao.comissaoBruta)}</strong></article>
        <article className="metric"><span>Alimentação</span><strong>{moeda(detalhe.comissao.alimentacaoAprovada)}</strong><small>{moeda(detalhe.comissao.alimentacaoPendente)} pendente</small></article>
        <article className={`metric ${detalhe.comissao.liquido<0?'metric-alert':'metric-net'}`}><span>Líquido</span><strong>{moeda(detalhe.comissao.liquido)}</strong><small>Comissão menos alimentação</small></article>
      </section>

      <section className="panel employee-services"><header className="panel-title"><div><span className="eyebrow">Histórico do período</span><h2>Serviços prestados</h2></div><span className="service-count">{detalhe.totalServicosPrestados} OS</span></header>
        <div className="table-scroll"><table><thead><tr><th>OS</th><th>Atendimento</th><th>Especialidade</th><th>Veículo / viatura</th><th>OP</th><th>Valor do serviço</th><th>Pagamento</th><th>Comissão gerada</th></tr></thead><tbody>{detalhe.servicos.map(servico=><tr key={servico.id}><td><strong>{servico.numeroOs}</strong></td><td>{servico.dataAtendimento?data(servico.dataAtendimento):'—'}</td><td>{servico.especialidade||'—'}</td><td><span className="vehicle-chip">{servico.viatura||'Não informada'}</span></td><td>{servico.numeroOp||'—'}</td><td>{moeda(servico.valorServico)}</td><td><span className={`payment-state payment-${servico.statusPagamento.toLowerCase()}`}>{statusPagamento[servico.statusPagamento]}</span></td><td>{servico.comissaoGerada==null?<span className="commission-waiting">Comissão: aguardando pagamento</span>:<strong>{moeda(servico.comissaoGerada)}</strong>}</td></tr>)}</tbody></table></div>
        {!detalhe.servicos.length?<p className="empty-inline">Nenhum serviço identificado neste período.</p>:null}
      </section>

      <section className="panel employee-food"><header className="panel-title"><div><span className="eyebrow">Mesma fonte do fechamento</span><h2>Alimentação</h2></div><div className="food-totals"><span>Total aprovado<strong>{moeda(detalhe.comissao.alimentacaoAprovada)}</strong></span><span>Pendente<strong>{moeda(detalhe.comissao.alimentacaoPendente)}</strong></span></div></header>
        <div className="table-scroll"><table><thead><tr><th>Data</th><th>Valor</th><th>Situação</th><th>Observação</th></tr></thead><tbody>{detalhe.comissao.alimentacoes.map(alimentacao=><tr key={alimentacao.id}><td>{data(alimentacao.data)}</td><td>{moeda(alimentacao.valor)}</td><td>{alimentacao.aprovada?'Aprovada':alimentacao.situacao.toLowerCase()}</td><td>{alimentacao.observacoes||'—'}</td></tr>)}</tbody></table></div>
        {!detalhe.comissao.alimentacoes.length?<p className="empty-inline">Nenhum lançamento de alimentação neste período.</p>:null}
      </section>
    </>:null}
  </div>
}
