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
  // Esta tela e lida no celular, na rua. A tabela de tres colunas rolava 295px
  // para o lado em 375px — para ver a data do proprio servico ele tinha que
  // arrastar. Vira lista: a OS e a especialidade de um lado, o dia do outro.
  return <div className="page-enter pagina-socorrista">
    <header className="cabecalho-socorrista">
      <h1>Meus serviços</h1>
      {recente?<p className="cabecalho-contexto"><i aria-hidden="true"/>{rotuloPeriodo(recente)}</p>:null}
    </header>
    {erro?<div className="form-alert">{erro}</div>:null}{carregando?<Carregando/>:null}{!carregando&&!recente&&!erro?<p className="empty-inline">Nenhuma OP com serviço seu ainda. Quando a Porto pagar a primeira, ela aparece aqui.</p>:null}
    {comissao?<section className="bloco-socorrista">
      {/* Kawa, 18/09/2026: na tela do socorrista, so a quantidade e os servicos
          feitos. Nenhum valor em dinheiro aparece aqui. */}
      <h2>{servicos.length} {servicos.length===1?'serviço feito':'serviços feitos'}</h2>
      <p className="bloco-apoio">Os serviços que você fez na OP mais recente.</p>
      {servicos.length
        ? <ul className="lista-socorrista">{servicos.map(s=><li key={s.id}>
            <span className="linha-identidade"><strong>{s.numeroOs}</strong><small>{s.especialidade||'Sem especialidade'}</small></span>
            <span className="linha-apoio">{data(s.dataAtendimento)}</span>
          </li>)}</ul>
        : <p className="empty-inline">Nenhum serviço seu nesta OP.</p>}
    </section>:null}
  </div>
}
