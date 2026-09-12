import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../api/http'
import { Vazio } from '../components/EstadoPagina'
import type { Dashboard, LancamentoFinanceiro, Veiculo } from '../types/modelos'
import { data, moeda, numero } from '../utils/formatadores'

const mesAtual=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
const intervalo=(mes:string)=>{const [ano,m]=mes.split('-').map(Number);return {inicio:`${mes}-01`,fim:`${mes}-${String(new Date(ano,m,0).getDate()).padStart(2,'0')}`}}

export default function FrotasPage(){
  const [mes,setMes]=useState(mesAtual),[veiculos,setVeiculos]=useState<Veiculo[]>([]),[financeiro,setFinanceiro]=useState<Dashboard|null>(null)
  const [lancamentos,setLancamentos]=useState<LancamentoFinanceiro[]>([]),[selecionado,setSelecionado]=useState(0),[modal,setModal]=useState(false),[mensagem,setMensagem]=useState('')
  const [editando,setEditando]=useState<Veiculo|null>(null),[salvando,setSalvando]=useState(false)
  const carregar=useCallback(async()=>{const {inicio,fim}=intervalo(mes);try{const [v,d,l]=await Promise.all([api<Veiculo[]>('/api/veiculos'),api<Dashboard>(`/api/dashboard?inicio=${inicio}&fim=${fim}`),api<LancamentoFinanceiro[]>(`/api/lancamentos?inicio=${inicio}&fim=${fim}`)]);setVeiculos(v);setFinanceiro(d);setLancamentos(l);setSelecionado(atual=>v.some(x=>x.id===atual)?atual:(v[0]?.id??0))}catch(e){setMensagem((e as Error).message)}},[mes])
  useEffect(()=>{void carregar()},[carregar])
  const veiculo=veiculos.find(v=>v.id===selecionado)
  const resultado=financeiro?.resultadoPorVeiculo.find(r=>r.veiculoId===selecionado)
  const receitas=resultado?.receitas??0,despesas=resultado?.despesas??0,lucro=resultado?.resultado??0,margem=receitas?lucro/receitas*100:0
  const historico=useMemo(()=>lancamentos.filter(l=>l.veiculoId===selecionado),[lancamentos,selecionado])
  const gastoFrota=financeiro?.resultadoPorVeiculo.reduce((s,r)=>s+r.despesas,0)??0
  const margens=financeiro?.resultadoPorVeiculo.filter(r=>r.receitas>0).map(r=>r.resultado/r.receitas*100)??[]

  async function salvar(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);setSalvando(true);setMensagem('')
    const corpo=JSON.stringify({identificacao:f.get('identificacao'),placa:f.get('placa'),modelo:f.get('modelo'),custoPorKm:Number(f.get('custoPorKm')),siglaPorto:String(f.get('siglaPorto')||'').trim()||null})
    try{
      if(editando)await api(`/api/veiculos/${editando.id}`,{method:'PUT',body:corpo})
      else await api('/api/veiculos',{method:'POST',body:corpo})
      setModal(false);setEditando(null);setMensagem('Veículo salvo no cadastro real.');await carregar()
    }catch(x){setMensagem((x as Error).message)}finally{setSalvando(false)}}

  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Ativos operacionais</span><h1>Veículos e custos</h1><p>Receitas, despesas e eficiência calculadas a partir dos vínculos reais do PostgreSQL.</p></div><div className="heading-actions"><label className="month-picker"><span>Competência</span><input type="month" value={mes} onChange={e=>setMes(e.target.value)}/></label><button className="button button-primary" onClick={()=>setModal(true)}>+ Cadastrar veículo</button></div></header>
    {mensagem?<div className="success-notice">{mensagem}</div>:null}
    <section className="fleet-summary"><div><span>Gasto total dos veículos</span><strong>{moeda(gastoFrota)}</strong><small>Despesas pagas vinculadas</small></div><div><span>Veículos disponíveis</span><strong>{veiculos.filter(v=>v.ativo).length}/{veiculos.length}</strong><small>Cadastro oficial</small></div><div><span>Melhor margem</span><strong>{Math.max(...margens,0).toFixed(1)}%</strong><small>Entre veículos com receita</small></div></section>
    {veiculos.length?<section className="fleet-layout"><aside className="fleet-list" aria-label="Lista de veículos">{veiculos.map(v=>{const r=financeiro?.resultadoPorVeiculo.find(item=>item.veiculoId===v.id),saldo=r?.resultado??0;return <button key={v.id} className={v.id===selecionado?'active':''} onClick={()=>setSelecionado(v.id)}><span className="vehicle-monogram">{v.identificacao}</span><span><strong>{v.modelo||v.identificacao}</strong><small>{v.placa} · {v.ativo?'Ativo':'Inativo'}</small></span><span><strong className={saldo>=0?'positive':'negative'}>{moeda(saldo)}</strong><small>Resultado real</small></span></button>})}</aside>
      {veiculo?<div className="fleet-detail"><article className="vehicle-hero"><div><span className="eyebrow">{veiculo.placa}</span><h2>{veiculo.identificacao} · {veiculo.modelo||'Modelo não informado'}</h2><p>Custo operacional informado: {moeda(veiculo.custoPorKm)} por km.</p>
        <p>{veiculo.siglaPorto?<>Aparece como <strong>{veiculo.siglaPorto}</strong> no painel da Porto.</>:<>Sem sigla da Porto — serviços desta viatura não se vinculam sozinhos.</>}</p></div>
      <div><span className={`vehicle-status ${veiculo.ativo?'status-saudavel':'status-monitorar'}`}>{veiculo.ativo?'Ativo':'Inativo'}</span><button className="table-action" onClick={()=>{setEditando(veiculo);setModal(true)}}>Editar</button></div></article>
        <div className="vehicle-metrics"><article><span>Receita recebida</span><strong>{moeda(receitas)}</strong><small>Vínculo financeiro real</small></article><article><span>Despesas pagas</span><strong>{moeda(despesas)}</strong><small>Custos aprovados</small></article><article className="focus"><span>Resultado</span><strong>{moeda(lucro)}</strong><small>{margem.toFixed(1)}% de margem</small></article><article><span>Km morto</span><strong>{numero(resultado?.kmMorto??0)} km</strong><small>{moeda(resultado?.custoKmMorto??0)} improdutivos</small></article></div>
        <article className="panel vehicle-history"><header className="panel-title"><div><span className="eyebrow">Auditoria individual</span><h2>Histórico financeiro</h2></div></header>{historico.length?<div className="table-scroll"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Situação</th><th>Valor</th></tr></thead><tbody>{historico.map(item=><tr key={item.id}><td>{data(item.data)}</td><td><strong>{item.descricao}</strong></td><td>{item.categoria}</td><td>{item.realizado?'Realizado':'Previsto'}</td><td className={item.tipo==='RECEITA'?'positive':'negative'}>{item.tipo==='RECEITA'?'+':'−'} {moeda(item.valor)}</td></tr>)}</tbody></table></div>:<p className="empty-inline">Nenhum movimento vinculado ao veículo nesta competência.</p>}</article>
      </div>:null}</section>:<Vazio titulo="Nenhum veículo" descricao="Cadastre o primeiro veículo para acompanhar seus resultados reais."/>}
    {modal?<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Cadastro oficial</span><h2>Novo veículo</h2></div><button aria-label="Fechar" onClick={()=>setModal(false)}>×</button></header><form onSubmit={salvar} className="form-grid two-columns"><label className="field"><span>Identificador</span><input name="identificacao" defaultValue={editando?.identificacao??''} required/></label><label className="field"><span>Placa</span><input name="placa" defaultValue={editando?.placa??''} required/></label><label className="field field-wide"><span>Modelo</span><input name="modelo" defaultValue={editando?.modelo??''}/></label><label className="field"><span>Custo por km</span><input name="custoPorKm" type="number" min="0" step=".0001" defaultValue={editando?.custoPorKm??0} required/></label>
        <label className="field"><span>Sigla na Porto</span><input name="siglaPorto" defaultValue={editando?.siglaPorto??''} placeholder="L25"/><small>Como a Porto chama esta viatura no painel do dia. É o que liga o serviço importado a este veículo.</small></label>
        <div className="modal-actions field-wide"><button type="button" className="button button-ghost" onClick={()=>{setModal(false);setEditando(null)}}>Cancelar</button><button className="button button-primary" disabled={salvando}>{salvando?'Salvando…':'Salvar veículo'}</button></div></form></section></div>:null}
  </div>
}
