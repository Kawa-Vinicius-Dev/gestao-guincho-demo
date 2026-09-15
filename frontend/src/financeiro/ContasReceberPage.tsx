import { useEffect, useState, type FormEvent } from 'react'
import { criarConta, listarContas, receberConta } from '../dados/contas'
import { listarContratantes } from '../dados/cadastros'
import { listarVeiculos } from '../dados/veiculos'
import { StatusBadge } from '../components/StatusBadge'
import { Campo, Selecao } from '../components/Campos'
import { Carregando, Vazio } from '../components/EstadoPagina'
import type { ContaReceber, Contratante, Veiculo } from '../types/modelos'
import { hojeIso, moeda } from '../utils/formatadores'
import { CampoValor } from '../components/CampoValor'
import { Modal } from '../components/Modal'
import { useValorAdiado } from '../utils/useValorAdiado'

const hoje=hojeIso
const proximoMes=()=>{const [ano,mes,dia]=hojeIso().split('-').map(Number);const d=new Date(ano,mes-1,dia);d.setMonth(d.getMonth()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export default function ContasReceberPage(){
  const [contas,setContas]=useState<ContaReceber[]>([]),[contratantes,setContratantes]=useState<Contratante[]>([])
  const [veiculos,setVeiculos]=useState<Veiculo[]>([]),[status,setStatus]=useState(''),[pesquisa,setPesquisa]=useState('')
  const [modal,setModal]=useState<'nova'|'receber'|null>(null),[selecionada,setSelecionada]=useState<ContaReceber|null>(null),[carregando,setCarregando]=useState(true)
  const [erro,setErro]=useState(''),[versao,setVersao]=useState(0)
  // Primeira carga mostra o esqueleto; as seguintes mantem a tabela na tela.
  const [primeiraCarga,setPrimeiraCarga]=useState(true)
  const buscaAdiada=useValorAdiado(pesquisa)
  useEffect(()=>{
    const controller=new AbortController();setCarregando(true)
    listarContas({status,pesquisa:buscaAdiada,sinal:controller.signal})
      .then(setContas).catch(e=>{if(e.name!=='AbortError')setErro(e.message)})
      .finally(()=>{if(!controller.signal.aborted){setCarregando(false);setPrimeiraCarga(false)}})
    return()=>controller.abort()
  },[status,buscaAdiada,versao])
  useEffect(()=>{Promise.all([listarContratantes(),listarVeiculos()]).then(([c,v])=>{setContratantes(c);setVeiculos(v)}).catch(e=>setErro((e as Error).message))},[])
  async function salvar(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const f=new FormData(event.currentTarget)
    const texto=(campo:string)=>String(f.get(campo)||'')||null
    const body={contratanteId:Number(f.get('contratanteId')),protocolo:texto('protocolo'),descricao:String(f.get('descricao')),
      valorPrevisto:Number(f.get('valorPrevisto')),dataCompetencia:String(f.get('dataCompetencia')),vencimento:String(f.get('vencimento')),
      veiculoId:f.get('veiculoId')?Number(f.get('veiculoId')):null,observacoes:texto('observacoes'),origem:'MANUAL' as const}
    try{await criarConta(body);setModal(null);setVersao(v=>v+1)}catch(e){setErro((e as Error).message)}
  }
  async function receber(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!selecionada)return;const f=new FormData(event.currentTarget)
    try{await receberConta(selecionada.id,Number(f.get('valorRecebido')),String(f.get('dataRecebimento')));setModal(null);setVersao(v=>v+1)}catch(e){setErro((e as Error).message)}
  }
  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Financeiro</span><h1>Contas a receber</h1><p>Previsões, atrasos e recebimentos conciliados.</p></div>
      <button className="button button-primary" onClick={()=>setModal('nova')}>Nova conta</button></header>
    {erro?<div className="form-alert">{erro}</div>:null}
    <section className="panel">
      <div className="filters"><Campo rotulo="Pesquisar" className="search-field"><input value={pesquisa} onChange={e=>setPesquisa(e.target.value)} placeholder="Protocolo ou referência, contratante ou descrição"/></Campo>
        <Selecao rotulo="Situação" className="filter-select" vazio="Todos" value={status} onChange={e=>setStatus(e.target.value)}
          opcoes={[{valor:'PENDENTE',texto:'Pendente'},{valor:'ATRASADO',texto:'Atrasado'},{valor:'RECEBIDO',texto:'Recebido'},{valor:'CANCELADO',texto:'Cancelado'}]}/></div>
      {carregando&&primeiraCarga?<Carregando/>:contas.length?<div className={carregando?'table-scroll atualizando':'table-scroll'}><table><thead><tr><th>Protocolo ou referência</th><th>Contratante</th><th>Vencimento</th><th>Situação</th><th>Previsto</th><th>Recebido</th><th/></tr></thead>
        <tbody>{contas.map(c=><tr key={c.id}><td><strong>{c.protocolo||'Sem protocolo'}</strong><small>{c.descricao}</small></td><td>{c.contratante.nome}</td><td>{new Date(`${c.vencimento}T12:00:00`).toLocaleDateString('pt-BR')}</td><td><StatusBadge status={c.status}/></td><td>{moeda(c.valorPrevisto)}</td><td>{c.valorRecebido!=null?<><strong>{moeda(c.valorRecebido)}</strong>{c.diferenca?<small className="negative">Dif. {moeda(c.diferenca)}</small>:null}</>:'—'}</td><td>{c.status!=='RECEBIDO'&&c.status!=='CANCELADO'?<button className="table-action" onClick={()=>{setSelecionada(c);setModal('receber')}}>Registrar pagamento</button>:null}</td></tr>)}</tbody></table></div>
        :<Vazio titulo="Nenhuma conta encontrada" descricao="Cadastre uma conta manualmente ou confirme uma importação da Porto Seguro."/>}
    </section>
    {modal?<Modal etiqueta="Contas a receber" titulo={modal==='nova'?'Nova conta':'Registrar recebimento'} aoFechar={()=>setModal(null)}>
      {modal==='nova'?<form onSubmit={salvar} className="form-grid two-columns">
        <Selecao rotulo="Contratante" name="contratanteId" required opcoes={contratantes.map(c=>({valor:c.id,texto:c.nome}))}/>
        <label className="field"><span>Protocolo ou referência</span><input name="protocolo"/></label>
        <label className="field field-wide"><span>Descrição</span><input name="descricao" required/></label>
        <CampoValor rotulo="Valor previsto" name="valorPrevisto" required/>
        <Selecao rotulo="Veículo" name="veiculoId" vazio="Não relacionado" opcoes={veiculos.map(v=>({valor:v.id,texto:v.identificacao}))}/>
        <label className="field"><span>Competência</span><input name="dataCompetencia" type="date" defaultValue={hoje()} required/></label>
        <label className="field"><span>Vencimento</span><input name="vencimento" type="date" defaultValue={proximoMes()} required/></label>
        <label className="field field-wide"><span>Observações</span><textarea name="observacoes" rows={3}/></label>
        <div className="modal-actions field-wide"><button type="button" className="button button-ghost" onClick={()=>setModal(null)}>Cancelar</button><button className="button button-primary">Salvar conta</button></div>
      </form>:<form onSubmit={receber} className="form-grid"><p>Previsto: <strong>{moeda(selecionada?.valorPrevisto??0)}</strong></p>
        <CampoValor rotulo="Valor recebido" name="valorRecebido" defaultValue={selecionada?.valorPrevisto} required/>
        <label className="field"><span>Data do recebimento</span><input name="dataRecebimento" type="date" defaultValue={hoje()} required/></label>
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={()=>setModal(null)}>Cancelar</button><button className="button button-primary">Confirmar recebimento</button></div>
      </form>}
    </Modal>:null}
  </div>
}
