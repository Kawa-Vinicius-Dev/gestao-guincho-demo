import { useEffect,useState,type FormEvent } from 'react'
import { lerComissaoDaOp, listarComissaoPrevista, listarPeriodosComissao, registrarAlimentacao, type ComissaoPrevista } from '../dados/comissoes'
import type { Comissao } from '../types/modelos'
import { data,moeda } from '../utils/formatadores'
import { rotuloPeriodo, type PeriodoPorto } from '../utils/periodos'
import { globalDoPeriodoPorto, periodoPortoDoGlobal, usePeriodoGlobal } from '../utils/periodoGlobal'
import { CampoValor } from '../components/CampoValor'
import { Carregando } from '../components/EstadoPagina'
import { Selecao } from '../components/Campos'
import { useAoVivo } from '../dados/aoVivo'

/**
 * Minha comissao, no celular do socorrista.
 *
 * Ele abre esta tela para responder uma pergunta so: quanto eu recebo. Antes,
 * cinco cartoes de mesma altura empurravam essa resposta para baixo da dobra e
 * a lista de servicos rolava de lado. Agora o liquido e a primeira coisa da
 * tela, a conta que chega nele vem logo abaixo, e o resto e apoio.
 */

/** Curto porque e lido de relance, na rua: "02/04", nao "02/04/2026". */
const diaEMes = (iso?: string) => (iso ? data(iso).slice(0, 5) : '—')

export default function MinhaComissaoPage(){
  const [periodos,setPeriodos]=useState<PeriodoPorto[]>([]),[comissao,setComissao]=useState<Comissao|null>(null)
  const [erro,setErro]=useState(''),[mensagem,setMensagem]=useState(''),[salvando,setSalvando]=useState(false)
  const [global,setGlobal]=usePeriodoGlobal()
  const [prevista,setPrevista]=useState<ComissaoPrevista|null>(null)
  const periodoId=periodoPortoDoGlobal(periodos,global)?.id??''
  const setPeriodoId=(id:string)=>{const p=periodos.find(x=>x.id===id);const novo=p&&globalDoPeriodoPorto(p);if(novo)setGlobal(novo)}
  const ids=periodos.find(p=>p.id===periodoId)?.ids??[]
  useEffect(()=>{listarPeriodosComissao().then(lista=>{setPeriodos(lista);if(!lista.length)setCarregando(false)}).catch((e:Error)=>{setErro(e.message);setCarregando(false)})},[])
  const [carregando,setCarregando]=useState(true)
  useAoVivo(()=>{if(ids.length)lerComissaoDaOp(ids).then(setComissao).catch((e:Error)=>setErro(e.message))})
  // O que vem da competencia antes da OP: previsto, nunca pago.
  useEffect(()=>{if(!global.inicio||!global.fim)return
    listarComissaoPrevista(global.inicio,global.fim).then(l=>setPrevista(l[0]??null)).catch(()=>setPrevista(null))},[global.inicio,global.fim])
  useEffect(()=>{if(!ids.length)return;setCarregando(true);lerComissaoDaOp(ids).then(setComissao).catch((e:Error)=>setErro(e.message)).finally(()=>setCarregando(false))},[periodoId])
  async function salvar(event:FormEvent<HTMLFormElement>){event.preventDefault();const formulario=event.currentTarget;const form=new FormData(formulario);setSalvando(true);setErro('');try{await registrarAlimentacao(String(form.get('data')),Number(form.get('valor')),String(form.get('observacoes')||''));setMensagem('Alimentação registrada e enviada para aprovação.');formulario.reset();setComissao(await lerComissaoDaOp(ids))}catch(e){setErro((e as Error).message)}finally{setSalvando(false)}}

  const aguardando=comissao?.aguardandoOp

  return <div className="page-enter pagina-socorrista">
    <header className="cabecalho-socorrista">
      <h1>Minha comissão</h1>
      <Selecao rotulo="Período" className="month-picker" vazio="Selecione" value={periodoId}
        onChange={e=>setPeriodoId(e.target.value)}
        opcoes={periodos.map(p=>({valor:p.id,texto:rotuloPeriodo(p)}))}/>
    </header>

    {erro?<div className="form-alert">{erro}</div>:null}{carregando?<Carregando/>:null}{mensagem?<div className="success-notice">{mensagem}</div>:null}

    {comissao?<>
      {/* O numero que ele abriu o app para ver, antes de qualquer outra coisa. */}
      <section className="holerite" aria-label="Resumo da comissão">
        <p className="holerite-rotulo">{aguardando?'A receber quando a OP chegar':'A receber'}</p>
        <strong className="holerite-valor">{aguardando?'Aguardando OP':moeda(comissao.liquido)}</strong>
        <p className="holerite-apoio">{comissao.quantidadeServicosPagos} {comissao.quantidadeServicosPagos===1?'serviço pago':'serviços pagos'}, somando {moeda(comissao.producaoPaga)}</p>
        <dl className="holerite-conta">
          <div><dt>Comissão de {comissao.percentualComissao}%</dt><dd>{aguardando?'—':moeda(comissao.comissaoBruta)}</dd></div>
          <div className={comissao.descontos?'holerite-saida':''}><dt>Descontos</dt><dd>{comissao.descontos?`− ${moeda(comissao.descontos)}`:'nenhum'}</dd></div>
          {comissao.descontosPendentes?<div className="holerite-nota"><dt>Ainda em aprovação</dt><dd>{moeda(comissao.descontosPendentes)}</dd></div>:null}
        </dl>
      </section>

      {/* Da competencia seguinte: producao que ainda nao virou pagamento. */}
      {prevista?<p className="holerite-previsto"><strong>{moeda(prevista.comissaoPrevista)}</strong> se somam quando a próxima OP sair — {prevista.servicos} {prevista.servicos===1?'serviço rodado que ainda não foi pago':'serviços rodados que ainda não foram pagos'}{prevista.semValor?`, ${prevista.semValor} deles sem valor definido`:''}. O valor final é o da OP.</p>:null}

      <section className="bloco-socorrista">
        <h2>Serviços pagos</h2>
        {comissao.servicos.length
          ? <ul className="lista-socorrista">{comissao.servicos.map(s=><li key={s.id}>
              <span className="linha-identidade"><strong>{s.numeroOs}</strong><small>{s.especialidade||'Sem especialidade'} · {diaEMes(s.dataAtendimento)}</small></span>
              <span className="linha-dinheiro"><strong>{moeda(s.comissaoServico)}</strong><small>de {moeda(s.valorServico)}</small></span>
            </li>)}</ul>
          : <p className="empty-inline">Nenhum serviço pago neste período. A comissão está aguardando OP.</p>}
      </section>

      <section className="bloco-socorrista">
        <h2>Gastos no seu nome</h2>
        {comissao.gastos.length
          ? <ul className="lista-socorrista">{comissao.gastos.map(g=><li key={g.id}>
              <span className="linha-identidade"><strong>{g.descricao}</strong><small>{diaEMes(g.data)}{g.veiculo?` · ${g.veiculo}`:''}</small></span>
              <span className="linha-dinheiro">
                <strong className={g.descontaDaComissao?'valor-saida':''}>{g.descontaDaComissao?`− ${moeda(g.valor)}`:moeda(g.valor)}</strong>
                <small>{g.descontaDaComissao?(g.aprovada?'sai da comissão':'sai se for aprovado'):g.descontaEmOutraOp?'sai em outra OP':'não sai da sua comissão'}</small>
              </span>
            </li>)}</ul>
          : <p className="empty-inline">Nenhum gasto lançado no seu nome neste período.</p>}
      </section>

      <section className="bloco-socorrista">
        <h2>Registrar alimentação</h2>
        <p className="bloco-apoio">O administrador aprova antes de entrar na conta.</p>
        <form className="form-grid" onSubmit={salvar}>
          <label className="field"><span>Dia</span><input aria-label="Data da alimentação" name="data" type="date" required/></label>
          <CampoValor rotulo="Quanto gastou" name="valor" required/>
          <label className="field field-wide"><span>Observação</span><input name="observacoes" placeholder="Opcional" autoCapitalize="sentences" autoComplete="off"/></label>
          <button className="button button-primary botao-alto" disabled={salvando}>{salvando?'Registrando…':'Registrar alimentação'}</button>
        </form>
      </section>
    </>:null}
  </div>
}
