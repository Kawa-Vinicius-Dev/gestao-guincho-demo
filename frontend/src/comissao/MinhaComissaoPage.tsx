import { useEffect,useState,type FormEvent } from 'react'
import { lerComissaoDaOp, listarMeusPeriodosComissao, registrarAlimentacao } from '../dados/comissoes'
import type { Comissao } from '../types/modelos'
import { data,moeda } from '../utils/formatadores'
import { periodoCorrente, rotuloPeriodo, type PeriodoPorto } from '../utils/periodos'
import { CampoValor } from '../components/CampoValor'
import { Carregando } from '../components/EstadoPagina'
import { useAoVivo } from '../dados/aoVivo'

/**
 * Minha comissao — a OP mais recente que pagou servico do socorrista, e so ela.
 *
 * Tinha seletor de periodo, e para o socorrista ele vinha vazio (as OPs sao
 * tabela de administrador). Kawa decidiu em 18/09/2026: "tire a opcao de ver
 * por periodo, deixa ele ver apenas o registro da op mais recente". O ideal, que
 * ele vai fazer depois, e mostrar as OS do periodo corrente pelos dados do
 * diario; ate la, a tela e a ultima OP, sem escolha.
 */
export default function MinhaComissaoPage(){
  const [recente,setRecente]=useState<PeriodoPorto|null>(null),[comissao,setComissao]=useState<Comissao|null>(null)
  const [erro,setErro]=useState(''),[mensagem,setMensagem]=useState(''),[salvando,setSalvando]=useState(false)
  const [carregando,setCarregando]=useState(true)
  const ids=recente?.ids??[]
  useEffect(()=>{listarMeusPeriodosComissao()
    .then(lista=>{const ultimo=periodoCorrente(lista)??null;setRecente(ultimo);if(!ultimo)setCarregando(false)})
    .catch((e:Error)=>{setErro(e.message);setCarregando(false)})},[])
  useAoVivo(()=>{if(ids.length)lerComissaoDaOp(ids).then(setComissao).catch((e:Error)=>setErro(e.message))})
  useEffect(()=>{if(!ids.length)return;setCarregando(true);lerComissaoDaOp(ids).then(setComissao).catch((e:Error)=>setErro(e.message)).finally(()=>setCarregando(false))},[recente?.id])
  async function salvar(event:FormEvent<HTMLFormElement>){event.preventDefault();const formulario=event.currentTarget;const form=new FormData(formulario);setSalvando(true);setErro('');try{await registrarAlimentacao(String(form.get('data')),Number(form.get('valor')),String(form.get('observacoes')||''));setMensagem('Alimentação registrada e enviada para aprovação.');formulario.reset();setComissao(await lerComissaoDaOp(ids))}catch(e){setErro((e as Error).message)}finally{setSalvando(false)}}
  return <div className="page-enter commission-page"><header className="page-heading"><div><span className="eyebrow">Área do socorrista</span><h1>Minha comissão</h1><p>Os serviços da sua OP mais recente, os gastos no seu nome e o que desconta da sua comissão.</p></div>{recente?<p className="cabecalho-contexto"><i aria-hidden="true"/>{rotuloPeriodo(recente)}</p>:null}</header>
    {erro?<div className="form-alert">{erro}</div>:null}{carregando?<Carregando/>:null}{!carregando&&!recente&&!erro?<p className="empty-inline">Nenhuma OP com serviço seu ainda. Quando a Porto pagar a primeira, ela aparece aqui.</p>:null}{mensagem?<div className="success-notice">{mensagem}</div>:null}
    {comissao?<><section className="metric-grid commission-metrics"><article className="metric"><span>Serviços pagos</span><strong>{comissao.quantidadeServicosPagos}</strong></article><article className="metric"><span>Total pago pela Porto</span><strong>{moeda(comissao.producaoPaga)}</strong></article><article className="metric"><span>Comissão 20%</span><strong>{comissao.aguardandoOp?'Aguardando OP':moeda(comissao.comissaoBruta)}</strong></article><article className="metric"><span>Descontos</span><strong>{moeda(comissao.descontos)}</strong><small>{moeda(comissao.descontosPendentes)} aguardando aprovação</small></article><article className={`metric ${comissao.liquido<0?'metric-alert':''}`}><span>Líquido</span><strong>{comissao.aguardandoOp?'Aguardando OP':moeda(comissao.liquido)}</strong></article></section>
      <section className="commission-grid"><article className="panel"><header className="panel-title"><div><span className="eyebrow">Auditoria</span><h2>Serviços pagos</h2></div></header><div className="table-scroll"><table><thead><tr><th>OS</th><th>Especialidade</th><th>Atendimento</th><th>OP</th><th>Valor</th><th>Comissão</th></tr></thead><tbody>{comissao.servicos.map(s=><tr key={s.id}><td><strong>{s.numeroOs}</strong></td><td>{s.especialidade||'—'}</td><td>{data(s.dataAtendimento)}</td><td>{s.numeroOp}</td><td>{moeda(s.valorServico)}</td><td>{moeda(s.comissaoServico)}</td></tr>)}</tbody></table></div>{!comissao.servicos.length?<p className="empty-inline">Nenhum serviço pago neste período. A comissão está aguardando OP.</p>:null}</article>
      <article className="panel food-panel"><header className="panel-title"><div><span className="eyebrow">Uso diário</span><h2>Alimentação</h2></div></header><form className="form-grid" onSubmit={salvar}><label className="field"><span>Data da alimentação</span><input aria-label="Data da alimentação" name="data" type="date" required/></label><CampoValor rotulo="Valor da alimentação" name="valor" required/><label className="field field-wide"><span>Observação</span><input name="observacoes" placeholder="Opcional" autoCapitalize="sentences" autoComplete="off"/></label><button className="button button-primary" disabled={salvando}>Registrar alimentação</button></form><div className="food-list">{comissao.gastos.map(g=><div key={g.id}><span><strong>{data(g.data)} · {g.descricao}</strong><small>{g.descontaDaComissao?'Desconta da comissão':g.descontaEmOutraOp?'Desconta em outra OP':'Não desconta'} · {g.aprovada?'aprovado':g.situacao.toLowerCase()}</small></span><strong>{moeda(g.valor)}</strong></div>)}</div></article></section></>:null}
  </div>
}
