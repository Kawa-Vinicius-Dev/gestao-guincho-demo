import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { usePeriodoGlobal } from '../utils/periodoGlobal'
import { porCompetencia } from '../utils/modoDoPeriodo'
import { useEffect, useMemo, useState } from 'react'
import { Carregando } from '../components/EstadoPagina'
import { FaturamentoPorGrupo } from '../components/Graficos'
import { LinkOs, LinkSocorrista, LinkViatura } from '../components/LinksDeDado'
import { lerIndicadores } from '../dados/dashboard'
import { lerExtrato } from '../dados/extrato'
import { diasDoPeriodo, DIAS_PARA_DETALHAR, montarDre } from '../dados/dre'
import { listarTodasAsOs, valorDaOs, type LinhaOs } from '../dados/porto/listaOs'
import { baixarDre } from '../dados/relatorios'
import { listarVeiculos } from '../dados/veiculos'
import type { Dashboard, LancamentoFinanceiro, Veiculo } from '../types/modelos'
import { data, moeda, percentual } from '../utils/formatadores'
import { nomesCurtos } from '../utils/nomes'
import './dre/dre.css'

function Linha({ titulo, valor, nivel = 0, total = false, negativo = false }: { titulo: string; valor: number; nivel?: number; total?: boolean; negativo?: boolean }) {
  return <div className={`dre-line ${total ? 'dre-total' : ''}`} style={{ paddingLeft: `${22 + nivel * 18}px` }}><span>{negativo ? '(−) ' : ''}{titulo}</span><strong className={valor < 0 ? 'negative' : ''}>{moeda(Math.abs(valor))}</strong></div>
}

/**
 * DRE: tudo discriminado (Kawa, 23/09/2026) — receitas, os servicos prestados e
 * cada gasto dentro da sua categoria. Ate 8 dias, os servicos um a um; acima, o
 * resumo por socorrista e por viatura. A tela e o Excel/PDF saem da mesma
 * montagem (dados/dre.ts).
 */
export default function DrePage() {
  const [periodo,setPeriodo]=usePeriodoGlobal()
  const {inicio,fim}=periodo
  const competencia=porCompetencia(periodo)
  const [financeiro,setFinanceiro]=useState<Dashboard|null>(null)
  const [extrato,setExtrato]=useState<LancamentoFinanceiro[]>([])
  const [servicos,setServicos]=useState<LinhaOs[]>([])
  const [veiculos,setVeiculos]=useState<Veiculo[]>([])
  const [erro,setErro]=useState('')
  const [carregando,setCarregando]=useState(true)
  const [exportando,setExportando]=useState('')
  async function exportar(formato:'excel'|'pdf'){setExportando(formato);setErro('')
    try{await baixarDre(inicio,fim,formato,competencia)}catch(e){setErro((e as Error).message)}finally{setExportando('')}}
  useEffect(()=>{listarVeiculos().then(setVeiculos).catch(()=>setVeiculos([]))},[])
  useEffect(()=>{
    if(!inicio||!fim||inicio>fim)return
    setCarregando(true);setErro('')
    Promise.all([lerIndicadores(inicio,fim,competencia),lerExtrato(inicio,fim).catch(()=>[] as LancamentoFinanceiro[]),
      listarTodasAsOs({inicio,fim,porCompetencia:competencia}).then(p=>p.itens).catch(()=>[] as LinhaOs[])])
      .then(([f,x,s])=>{setFinanceiro(f);setExtrato(x);setServicos(s)}).catch(e=>setErro(e.message))
      .finally(()=>setCarregando(false))
  },[inicio,fim,competencia])

  const dre=useMemo(()=>financeiro&&inicio&&fim?montarDre(financeiro,extrato,servicos,diasDoPeriodo(inicio,fim),veiculos):null,
    [financeiro,extrato,servicos,veiculos,inicio,fim])
  const curtos=useMemo(()=>nomesCurtos(servicos.map(os=>os.motorista)),[servicos])

  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Demonstrativo do resultado</span><h1>DRE</h1><p>Receitas, serviços prestados e cada despesa do período, discriminados.</p></div></header>
    <section className="panel painel-filtros"><form className="ledger-filters" onSubmit={e=>e.preventDefault()}><SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/></form></section>
    {erro?<div className="form-alert">{erro}</div>:null}
    {carregando||!dre?<Carregando/>:<>
    <section className="dre-hero"><div><span>Lucro operacional</span><strong>{moeda(dre.lucro)}</strong><small>Receitas recebidas menos despesas pagas</small></div><div><span>Margem líquida operacional</span><strong>{dre.margem===null?'—':percentual(dre.margem)}</strong><small>{dre.margem===null?'Sem receita no período':`${dre.servicos.total} ${dre.servicos.total===1?'serviço prestado':'serviços prestados'}${dre.servicos.semValor?`, ${dre.servicos.semValor} ainda sem valor`:''}`}</small></div></section>
    <section className="dre-layout">
      <article className="panel dre-sheet">
        <header><span>Demonstração do resultado</span><strong>Valor</strong></header>
        <div className="dre-group">
          <Linha titulo="Receita bruta" valor={dre.receitaBruta} total/>
          <Linha titulo="Serviços da Porto" valor={dre.receitaServicos} nivel={1}/>
          {dre.receitasAvulsas.map(r=><Linha key={r.categoria} titulo={r.categoria} valor={r.valor} nivel={1}/>)}
        </div>
        <div className="dre-group">
          <Linha titulo="Despesas pagas" valor={dre.totalDespesas} total negativo/>
          {/* Cada categoria abre os gastos dela: discriminado, sem poluir. */}
          {dre.despesas.map(d=><details key={d.categoria} className="dre-categoria">
            <summary><Linha titulo={`${d.categoria} · ${d.itens.length} ${d.itens.length===1?'gasto':'gastos'}`} valor={d.valor} nivel={1}/></summary>
            <ul className="dre-gastos">{d.itens.map(l=><li key={l.id}>
              <span>{data(l.data)}</span><span>{l.descricao}{l.veiculo?<> · <LinkViatura id={l.veiculoId} sigla={l.veiculo}/></>:null}{l.motorista?<> · <LinkSocorrista id={l.motoristaId} nome={l.motorista}/></>:null}</span>
              <strong>{moeda(l.valor)}</strong></li>)}</ul>
          </details>)}
        </div>
        <div className="dre-final"><span>Lucro operacional</span><strong>{moeda(dre.lucro)}</strong></div>
      </article>
      <aside className="dre-explainer">
        <span className="eyebrow">Leitura da DRE</span><h2>Faturar não é lucrar.</h2>
        <p>A receita mostra os valores recebidos. As despesas entram quando estão pagas. Serviço sem valor aparece na lista, mas só vira receita quando a OP chega.</p>
        <div><span>1</span><p><strong>Até {DIAS_PARA_DETALHAR} dias</strong>Os serviços aparecem um a um, como no relatório diário.</p></div>
        <div><span>2</span><p><strong>Períodos maiores</strong>Os serviços aparecem resumidos por socorrista e por viatura.</p></div>
        <button className="button button-primary" disabled={exportando!==''} onClick={()=>void exportar('excel')}>{exportando==='excel'?'Gerando Excel…':'Exportar Excel'}</button>
        <button className="button button-ghost" disabled={exportando!==''} onClick={()=>void exportar('pdf')}>{exportando==='pdf'?'Gerando PDF…':'Exportar PDF'}</button>
        <button className="button button-ghost" onClick={() => window.print()}>Imprimir DRE</button>
      </aside>
    </section>

    <section className="panel dre-servicos" aria-label="Serviços prestados">
      <header className="panel-title"><div><span className="eyebrow">Serviços prestados</span>
        <h2>{dre.servicos.total} {dre.servicos.total===1?'serviço':'serviços'} · {moeda(dre.servicos.valor)}</h2>
        <p>{competencia?'Pela OP em que o serviço entrou.':'Pela data do atendimento.'}{dre.servicos.semValor?` ${dre.servicos.semValor} ainda sem valor: o valor chega com a OP.`:''}</p></div></header>
      {!dre.servicos.total?<p className="empty-inline">Nenhum serviço neste período.</p>
        :dre.servicos.detalhado
        ?<div className="table-scroll"><table className="tabela-os" aria-label="Serviços um a um">
          <thead><tr><th>Data</th><th>OS</th><th>Especialidade</th><th>Socorrista</th><th>Viatura</th><th>OP</th><th className="th-numero">Valor</th></tr></thead>
          <tbody>{dre.servicos.lista.map(os=><tr key={os.id}>
            <td>{os.dataAtendimento?data(os.dataAtendimento):'—'}</td><td><LinkOs numero={os.numero}/></td><td>{os.especialidade||'—'}</td>
            <td title={os.motorista}><LinkSocorrista id={os.motoristaId} nome={curtos.get(os.motorista??'')??os.motorista}/></td>
            <td><LinkViatura sigla={os.viatura}/></td><td>{os.numeroOp??<small className="os-sem">Aguardando OP</small>}</td>
            <td className="col-valor">{os.semValor?<small>Sem valor</small>:moeda(valorDaOs(os))}</td></tr>)}</tbody>
          <tfoot><tr className="linha-total"><td colSpan={6}><strong>Total · {dre.servicos.total} serviços</strong></td><td className="col-valor"><strong>{moeda(dre.servicos.valor)}</strong></td></tr></tfoot>
        </table></div>
        :<div className="painel-faturamento">
          <div><h3>Por socorrista</h3><FaturamentoPorGrupo descricao="Serviços por socorrista" vazio="Nenhum serviço." linhas={dre.servicos.porSocorrista}/></div>
          <div><h3>Por viatura</h3><FaturamentoPorGrupo descricao="Serviços por viatura" vazio="Nenhum serviço." linhas={dre.servicos.porViatura}/></div>
        </div>}
    </section>
    </>}
  </div>
}
