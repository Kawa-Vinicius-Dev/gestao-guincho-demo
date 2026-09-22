import { ehAuxiliar } from '../utils/auxiliar'
import { useEffect,useState } from 'react'
import { Link,useParams } from 'react-router-dom'
import { Selecao } from '../components/Campos'
import { definirComissaoDaOs, listarComissaoPrevista, listarPeriodosComissao, obterDetalheSocorrista, type ComissaoPrevista } from '../dados/comissoes'
import { Carregando,ErroPagina } from '../components/EstadoPagina'
import type { DespesaDoSocorrista,DetalheSocorrista } from '../types/modelos'
import { data,moeda } from '../utils/formatadores'
import { rotuloPeriodo, type PeriodoPorto } from '../utils/periodos'
import { globalDoPeriodoPorto, periodoPortoDoGlobal, usePeriodoGlobal } from '../utils/periodoGlobal'
import { useAoVivo } from '../dados/aoVivo'
import { ConfirmarAcao, type PedidoConfirmacao } from '../components/ConfirmarAcao'

const statusPagamento={PAGO:'Pago',PAGO_EM_OUTRO_PERIODO:'Pago em outro período',AGUARDANDO_PAGAMENTO:'Aguardando pagamento'} as const

export default function EquipeDetalhePage(){
  const motoristaId=Number(useParams().id)
  const [periodos,setPeriodos]=useState<PeriodoPorto[]>([]),[detalhe,setDetalhe]=useState<DetalheSocorrista|null>(null)
  const [carregandoPeriodos,setCarregandoPeriodos]=useState(true),[carregandoDetalhe,setCarregandoDetalhe]=useState(false),[erro,setErro]=useState('')
  const [global,setGlobal]=usePeriodoGlobal()
  const [prevista,setPrevista]=useState<ComissaoPrevista|null>(null)
  const [pedido,setPedido]=useState<PedidoConfirmacao|null>(null)
  const periodoId=periodoPortoDoGlobal(periodos,global)?.id??''
  const setPeriodoId=(id:string)=>{const p=periodos.find(x=>x.id===id);const novo=p&&globalDoPeriodoPorto(p);if(novo)setGlobal(novo)}
  const ids=periodos.find(p=>p.id===periodoId)?.ids??[]
  useEffect(()=>{listarPeriodosComissao().then(lista=>{setPeriodos(lista)}).catch((e:Error)=>setErro(e.message)).finally(()=>setCarregandoPeriodos(false))},[])
  useEffect(()=>{if(!motoristaId||!ids.length)return;setCarregandoDetalhe(true);setErro('');obterDetalheSocorrista(motoristaId,ids).then(setDetalhe).catch(e=>setErro(e.message)).finally(()=>setCarregandoDetalhe(false))},[motoristaId,periodoId,periodos])
  // O que ele rodou nesta competencia e ainda nao entrou em OP: previsto, sem comissao lancada.
  useEffect(()=>{if(!motoristaId||!global.inicio||!global.fim)return
    listarComissaoPrevista(global.inicio,global.fim,motoristaId).then(l=>setPrevista(l[0]??null)).catch(()=>setPrevista(null))},[motoristaId,global.inicio,global.fim])
  useAoVivo(()=>{if(motoristaId&&ids.length)obterDetalheSocorrista(motoristaId,ids).then(setDetalhe).catch(e=>setErro(e.message))})
  const recarregar=()=>obterDetalheSocorrista(motoristaId,ids).then(setDetalhe)
  // Tirar a comissao muda o dinheiro da OP inteira, entao a confirmacao diz de
  // quanto e o servico antes de o administrador decidir.
  function pedirComissao(servico:{id:number;numeroOs:string;valorServico:number;semComissao?:boolean}){
    const tirando=!servico.semComissao
    setPedido({titulo:tirando?'Tirar a comissão desta OS?':'Devolver a comissão desta OS?',
      efeito:tirando
        ?<>A OS continua no nome de <strong>{detalhe?.nome}</strong> e na produção dele, mas deixa de gerar comissão. Se ela já estiver paga numa OP, a comissão daquela OP é refeita e o líquido dele baixa.</>
        :<>A OS volta a gerar comissão e a comissão da OP é refeita, aumentando o líquido de <strong>{detalhe?.nome}</strong>.</>,
      resumo:[['OS',servico.numeroOs],['Valor do serviço',moeda(servico.valorServico)]],
      textoConfirmar:tirando?'Tirar comissão':'Devolver comissão',perigo:tirando,
      aoConfirmar:async()=>{await definirComissaoDaOs(servico.id,tirando);await recarregar()}})
  }

  if(carregandoPeriodos)return <Carregando/>
  if(erro&&!detalhe)return <ErroPagina mensagem={erro}/>
  return <div className="page-enter employee-detail-page">
    <header className="employee-detail-heading">
      <div><Link className="back-link" to="/equipe">← Voltar para socorristas</Link><span className="eyebrow">Ficha administrativa</span><h1>{detalhe?.nome||'Socorrista'}</h1><p>Histórico operacional e composição financeira por fechamento Porto.</p></div>
      <Selecao rotulo="Período" className="month-picker" vazio="Selecione" value={periodoId} onChange={event=>setPeriodoId(event.target.value)}
        opcoes={periodos.map(periodo=>({valor:periodo.id,texto:rotuloPeriodo(periodo)}))}/>
    </header>
    {erro?<div className="form-alert" role="alert">{erro}</div>:null}
    {carregandoDetalhe&&!detalhe?<Carregando/>:null}
    {detalhe?<>
      <section className="employee-identity panel" aria-label="Informações gerais do socorrista">
        <div className="employee-monogram">{detalhe.nome.split(' ').map(parte=>parte[0]).slice(0,2).join('')}</div>
        <div className="employee-name"><span className={`staff-status ${detalhe.ativo?'staff-disponivel':'staff-folga'}`}>{detalhe.ativo?'Ativo':'Inativo'}</span><strong>{detalhe.nome}</strong><small>{ehAuxiliar(detalhe.nome)?'Recebe as OS que chegam sem socorrista':detalhe.qra||'QRA não informado'}</small></div>
        <dl><div><dt>Telefone</dt><dd>{detalhe.telefone||(ehAuxiliar(detalhe.nome)?'—':'Não informado')}</dd></div><div><dt>E-mail / usuário</dt><dd>{detalhe.email||'Não vinculado'}</dd></div></dl>
        <div className="employee-vehicles"><span>Viaturas utilizadas no período</span><div>{detalhe.veiculosUtilizados.length?detalhe.veiculosUtilizados.map(viatura=><strong key={viatura}>{viatura}</strong>):<small>Nenhuma viatura identificada nas OS deste período.</small>}</div></div>
      </section>

      {prevista?<div className="success-notice"><strong>Aguardando OP: {prevista.servicos} {prevista.servicos===1?'serviço':'serviços'} nesta competência</strong> — {moeda(prevista.valorPrevisto)} previstos, comissão prevista de {moeda(prevista.comissaoPrevista)}{prevista.semValor?`, com ${prevista.semValor} ainda sem valor`:''}. Só vira comissão quando a OP chegar.</div>:null}
      <section className="metric-grid employee-summary" aria-label="Resumo do período">
        <article className="metric"><span>Total de serviços prestados</span><strong>{detalhe.totalServicosPrestados}</strong><small>Inclui OS ainda não pagas</small></article>
        <article className="metric"><span>Serviços já pagos</span><strong>{detalhe.comissao.quantidadeServicosPagos}</strong><small>Somente OP efetivamente paga</small></article>
        <article className="metric"><span>Produção paga</span><strong>{moeda(detalhe.comissao.producaoPaga)}</strong></article>
        <article className="metric metric-focus"><span>Comissão 20%</span><strong>{moeda(detalhe.comissao.comissaoBruta)}</strong></article>
        <article className="metric"><span>Descontos</span><strong>{moeda(detalhe.comissao.descontos)}</strong><small>{moeda(detalhe.comissao.descontosPendentes)} aguardando aprovação</small></article>
        <article className={`metric ${detalhe.comissao.liquido<0?'metric-alert':'metric-net'}`}><span>Líquido</span><strong>{moeda(detalhe.comissao.liquido)}</strong><small>Comissão menos descontos</small></article>
      </section>

      <section className="panel employee-services"><header className="panel-title"><div><span className="eyebrow">Histórico do período</span><h2>Serviços prestados</h2></div><span className="service-count">{detalhe.totalServicosPrestados} OS</span></header>
        <div className="table-scroll"><table><thead><tr><th>OS</th><th>Atendimento</th><th>Especialidade</th><th>Veículo / viatura</th><th>OP</th><th>Valor do serviço</th><th>Pagamento</th><th>Comissão gerada</th><th/></tr></thead><tbody>{detalhe.servicos.map(servico=><tr key={servico.id}><td><strong>{servico.numeroOs}</strong></td><td>{servico.dataAtendimento?data(servico.dataAtendimento):'—'}</td><td>{servico.especialidade||'—'}</td><td><span className="vehicle-chip">{servico.viatura||'Não informada'}</span></td><td>{servico.numeroOp||'—'}</td><td>{moeda(servico.valorServico)}</td><td><span className={`payment-state payment-${servico.statusPagamento.toLowerCase()}`}>{statusPagamento[servico.statusPagamento]}</span></td><td>{servico.semComissao?<span className="commission-waiting">Sem comissão</span>:servico.comissaoGerada==null?<span className="commission-waiting">Comissão: aguardando pagamento</span>:<strong>{moeda(servico.comissaoGerada)}</strong>}</td><td className="col-acoes"><button className={servico.semComissao?'table-action':'table-action table-action-danger'} onClick={()=>pedirComissao(servico)} aria-label={`${servico.semComissao?'Devolver':'Tirar'} a comissão da OS ${servico.numeroOs}`}>{servico.semComissao?'Devolver comissão':'Tirar comissão'}</button></td></tr>)}</tbody></table></div>
        {!detalhe.servicos.length?<p className="empty-inline">Nenhum serviço identificado neste período.</p>:null}
      </section>

      <section className="panel employee-food"><header className="panel-title"><div><span className="eyebrow">Mesma fonte do fechamento</span><h2>Descontos da comissão</h2></div><div className="food-totals"><span>Total aprovado<strong>{moeda(detalhe.comissao.descontos)}</strong></span><span>Pendente<strong>{moeda(detalhe.comissao.descontosPendentes)}</strong></span></div></header>
        <div className="table-scroll"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Situação</th></tr></thead><tbody>{detalhe.comissao.gastos.filter(g=>g.descontaDaComissao).map(g=><tr key={g.id}><td>{data(g.data)}</td><td><strong>{g.descricao}</strong>{g.observacoes?<small>{g.observacoes}</small>:null}</td><td>{g.categoria}</td><td>{moeda(g.valor)}</td><td>{g.aprovada?'Aprovada':g.situacao.toLowerCase()}</td></tr>)}</tbody></table></div>
        {!detalhe.comissao.gastos.some(g=>g.descontaDaComissao)?<p className="empty-inline">Nenhum gasto marcado para descontar neste período.</p>:null}
      </section>

      <OutrasDespesas detalhe={detalhe}/>
    </>:null}
    {pedido?<ConfirmarAcao {...pedido} aoFechar={()=>setPedido(null)}/>:null}
  </div>
}

/**
 * Despesas lancadas no nome do socorrista que NAO descontam da comissao.
 *
 * O formulario pede o socorrista em qualquer categoria, mas so o gasto marcado
 * para descontar entra no fechamento — um pedagio, uma peca, a alimentacao que
 * a empresa paga conta na viatura ou no resultado geral. Antes, essas nao apareciam em lugar
 * nenhum ligado a pessoa: o campo prometia um vinculo que nenhuma tela mostrava.
 *
 * Painel separado, e nao uma linha a mais na tabela de alimentacao, justamente
 * porque as duas nao valem a mesma coisa no bolso de quem recebe. A de cima e o
 * fechamento; esta e historico. Mostrar nao e cobrar.
 */
function OutrasDespesas({ detalhe }:{ detalhe:DetalheSocorrista }){
  const outras:DespesaDoSocorrista[]=(detalhe.despesas??[]).filter(despesa=>!despesa.descontaDaComissao)
  const total=outras.reduce((soma,despesa)=>soma+despesa.valor,0)
  return <section className="panel employee-food" aria-label="Outras despesas no nome do socorrista">
    <header className="panel-title">
      <div><span className="eyebrow">Não entra no fechamento</span><h2>Outras despesas no nome dele</h2></div>
      <div className="food-totals"><span>Total no período<strong>{moeda(total)}</strong></span></div>
    </header>
    <p className="nota-fora-do-fechamento">
      Lançadas com o socorrista preenchido, sem a marca de desconto: pesam na viatura ou no
      resultado geral da operação, e não no líquido dele.
    </p>
    <div className="table-scroll"><table>
      <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Viatura</th><th>Situação</th><th>Valor</th></tr></thead>
      <tbody>{outras.map(despesa=><tr key={despesa.id}>
        <td>{data(despesa.data)}</td>
        <td><strong>{despesa.descricao}</strong>{despesa.observacoes?<small>{despesa.observacoes}</small>:null}</td>
        <td>{despesa.categoria}</td>
        <td>{despesa.veiculo?<span className="vehicle-chip">{despesa.veiculo}</span>:'—'}</td>
        <td>{despesa.aprovada?'Aprovada':despesa.situacao.toLowerCase()}</td>
        <td className="negative">{moeda(despesa.valor)}</td>
      </tr>)}</tbody>
    </table></div>
    {!outras.length?<p className="empty-inline">Nenhuma outra despesa no nome dele neste período.</p>:null}
  </section>
}
