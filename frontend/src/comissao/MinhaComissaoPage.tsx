import { useEffect,useState,type FormEvent } from 'react'
import { lerComissaoDaOp, listarPeriodosComissao, registrarAlimentacao } from '../dados/comissoes'
import type { Comissao } from '../types/modelos'
import { data,moeda } from '../utils/formatadores'
import { periodoCorrente, rotuloPeriodo, type PeriodoPorto } from '../utils/periodos'
import { CampoValor } from '../components/CampoValor'
import { Carregando } from '../components/EstadoPagina'
import { Selecao } from '../components/Campos'
import { useAoVivo } from '../dados/aoVivo'

export default function MinhaComissaoPage(){
  const [periodos,setPeriodos]=useState<PeriodoPorto[]>([]),[periodoId,setPeriodoId]=useState(''),[comissao,setComissao]=useState<Comissao|null>(null)
  const [erro,setErro]=useState(''),[mensagem,setMensagem]=useState(''),[salvando,setSalvando]=useState(false)
  const ids=periodos.find(p=>p.id===periodoId)?.ids??[]
  useEffect(()=>{listarPeriodosComissao().then(lista=>{setPeriodos(lista);const atual=periodoCorrente(lista);if(atual)setPeriodoId(atual.id);if(!atual)setCarregando(false)}).catch((e:Error)=>{setErro(e.message);setCarregando(false)})},[])
  const [carregando,setCarregando]=useState(true)
  useAoVivo(()=>{if(ids.length)lerComissaoDaOp(ids).then(setComissao).catch((e:Error)=>setErro(e.message))})
  useEffect(()=>{if(!ids.length)return;setCarregando(true);lerComissaoDaOp(ids).then(setComissao).catch((e:Error)=>setErro(e.message)).finally(()=>setCarregando(false))},[periodoId])
  async function salvar(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);setSalvando(true);setErro('');try{await registrarAlimentacao(String(form.get('data')),Number(form.get('valor')),String(form.get('observacoes')||''));setMensagem('Alimentação registrada e enviada para aprovação.');event.currentTarget.reset();setComissao(await lerComissaoDaOp(ids))}catch(e){setErro((e as Error).message)}finally{setSalvando(false)}}
  return <div className="page-enter commission-page"><header className="page-heading"><div><span className="eyebrow">Área do socorrista</span><h1>Minha comissão</h1><p>Seus serviços pagos, os gastos no seu nome e o que desconta da sua comissão.</p></div><Selecao rotulo="Período" className="month-picker" vazio="Selecione" value={periodoId}
      onChange={e=>setPeriodoId(e.target.value)}
      opcoes={periodos.map(p=>({valor:p.id,texto:rotuloPeriodo(p)}))}/></header>
    {erro?<div className="form-alert">{erro}</div>:null}{carregando?<Carregando/>:null}{mensagem?<div className="success-notice">{mensagem}</div>:null}
    {comissao?<><section className="metric-grid commission-metrics"><article className="metric"><span>Serviços pagos</span><strong>{comissao.quantidadeServicosPagos}</strong></article><article className="metric"><span>Total pago pela Porto</span><strong>{moeda(comissao.producaoPaga)}</strong></article><article className="metric"><span>Comissão 20%</span><strong>{comissao.aguardandoOp?'Aguardando OP':moeda(comissao.comissaoBruta)}</strong></article><article className="metric"><span>Descontos</span><strong>{moeda(comissao.descontos)}</strong><small>{moeda(comissao.descontosPendentes)} aguardando aprovação</small></article><article className={`metric ${comissao.liquido<0?'metric-alert':''}`}><span>Líquido</span><strong>{comissao.aguardandoOp?'Aguardando OP':moeda(comissao.liquido)}</strong></article></section>
      <section className="commission-grid"><article className="panel"><header className="panel-title"><div><span className="eyebrow">Auditoria</span><h2>Serviços pagos</h2></div></header><div className="table-scroll"><table><thead><tr><th>OS</th><th>Especialidade</th><th>Atendimento</th><th>OP</th><th>Valor</th><th>Comissão</th></tr></thead><tbody>{comissao.servicos.map(s=><tr key={s.id}><td><strong>{s.numeroOs}</strong></td><td>{s.especialidade||'—'}</td><td>{data(s.dataAtendimento)}</td><td>{s.numeroOp}</td><td>{moeda(s.valorServico)}</td><td>{moeda(s.comissaoServico)}</td></tr>)}</tbody></table></div>{!comissao.servicos.length?<p className="empty-inline">Nenhum serviço pago neste período. A comissão está aguardando OP.</p>:null}</article>
      <article className="panel food-panel"><header className="panel-title"><div><span className="eyebrow">Uso diário</span><h2>Alimentação</h2></div></header><form className="form-grid" onSubmit={salvar}><label className="field"><span>Data da alimentação</span><input aria-label="Data da alimentação" name="data" type="date" required/></label><CampoValor rotulo="Valor da alimentação" name="valor" required/><label className="field field-wide"><span>Observação</span><input name="observacoes" placeholder="Opcional" autoCapitalize="sentences" autoComplete="off"/></label><button className="button button-primary" disabled={salvando}>Registrar alimentação</button></form><div className="food-list">{comissao.gastos.map(g=><div key={g.id}><span><strong>{data(g.data)} · {g.descricao}</strong><small>{g.descontaDaComissao?'Desconta da comissão':g.descontaEmOutraOp?'Desconta em outra OP':'Não desconta'} · {g.aprovada?'aprovado':g.situacao.toLowerCase()}</small></span><strong>{moeda(g.valor)}</strong></div>)}</div></article></section></>:null}
  </div>
}
