import { useEffect,useState } from 'react'
import { lerComissaoDaOp, listarMeusPeriodosComissao } from '../dados/comissoes'
import type { Comissao } from '../types/modelos'
import { data } from '../utils/formatadores'
import { periodoCorrente, rotuloPeriodo, type PeriodoPorto } from '../utils/periodos'
import { Carregando } from '../components/EstadoPagina'
import { useAoVivo } from '../dados/aoVivo'

/**
 * Meus servicos (antes "Minha comissao") — a OP mais recente que pagou servico
 * do socorrista, e so ela: a quantidade e a lista dos servicos, sem dinheiro.
 *
 * Tinha seletor de periodo, e para o socorrista ele vinha vazio (as OPs sao
 * tabela de administrador). Kawa decidiu em 18/09/2026: "tire a opcao de ver
 * por periodo, deixa ele ver apenas o registro da op mais recente". O ideal, que
 * ele vai fazer depois, e mostrar as OS do periodo corrente pelos dados do
 * diario; ate la, a tela e a ultima OP, sem escolha.
 */
export default function MinhaComissaoPage(){
  const [recente,setRecente]=useState<PeriodoPorto|null>(null),[comissao,setComissao]=useState<Comissao|null>(null)
  const [erro,setErro]=useState('')
  const [carregando,setCarregando]=useState(true)
  const ids=recente?.ids??[]
  useEffect(()=>{listarMeusPeriodosComissao()
    .then(lista=>{const ultimo=periodoCorrente(lista)??null;setRecente(ultimo);if(!ultimo)setCarregando(false)})
    .catch((e:Error)=>{setErro(e.message);setCarregando(false)})},[])
  useAoVivo(()=>{if(ids.length)lerComissaoDaOp(ids).then(setComissao).catch((e:Error)=>setErro(e.message))})
  useEffect(()=>{if(!ids.length)return;setCarregando(true);lerComissaoDaOp(ids).then(setComissao).catch((e:Error)=>setErro(e.message)).finally(()=>setCarregando(false))},[recente?.id])
  const servicos=comissao?.servicos??[]
  return <div className="page-enter commission-page"><header className="page-heading"><div><span className="eyebrow">Área do socorrista</span><h1>Meus serviços</h1><p>Os serviços que você fez na OP mais recente.</p></div>{recente?<p className="cabecalho-contexto"><i aria-hidden="true"/>{rotuloPeriodo(recente)}</p>:null}</header>
    {erro?<div className="form-alert">{erro}</div>:null}{carregando?<Carregando/>:null}{!carregando&&!recente&&!erro?<p className="empty-inline">Nenhuma OP com serviço seu ainda. Quando a Porto pagar a primeira, ela aparece aqui.</p>:null}
    {comissao?<>
      {/* Kawa, 18/09/2026: na tela do socorrista, so a quantidade e os servicos
          feitos. Nenhum valor em dinheiro aparece aqui. */}
      <section className="metric-grid commission-metrics"><article className="metric"><span>Serviços feitos</span><strong>{servicos.length}</strong></article></section>
      <article className="panel"><header className="panel-title"><div><h2>Serviços da OP</h2></div></header><div className="table-scroll"><table><thead><tr><th>OS</th><th>Especialidade</th><th>Atendimento</th></tr></thead><tbody>{servicos.map(s=><tr key={s.id}><td><strong>{s.numeroOs}</strong></td><td>{s.especialidade||'—'}</td><td>{data(s.dataAtendimento)}</td></tr>)}</tbody></table></div>{!servicos.length?<p className="empty-inline">Nenhum serviço seu nesta OP.</p>:null}</article>
    </>:null}
  </div>
}
