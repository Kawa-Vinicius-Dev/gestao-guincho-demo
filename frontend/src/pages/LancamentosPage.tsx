import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../api/http'
import { Vazio } from '../components/EstadoPagina'
import type { Categoria, Contratante, Despesa, LancamentoFinanceiro, Motorista, Veiculo } from '../types/modelos'
import { data, moeda } from '../utils/formatadores'

type TipoLancamento = 'RECEITA' | 'DESPESA'

const hoje = () => {
  const atual = new Date()
  return `${atual.getFullYear()}-${String(atual.getMonth()+1).padStart(2,'0')}-${String(atual.getDate()).padStart(2,'0')}`
}
const mesAtual = () => hoje().slice(0,7)
const intervalo = (mes:string) => {
  const [ano,numeroMes]=mes.split('-').map(Number)
  return {inicio:`${mes}-01`,fim:`${mes}-${String(new Date(ano,numeroMes,0).getDate()).padStart(2,'0')}`}
}

export default function LancamentosPage() {
  const [mes,setMes]=useState(mesAtual)
  const [lista,setLista]=useState<LancamentoFinanceiro[]>([])
  const [categorias,setCategorias]=useState<Categoria[]>([])
  const [veiculos,setVeiculos]=useState<Veiculo[]>([])
  const [motoristas,setMotoristas]=useState<Motorista[]>([])
  const [contratantes,setContratantes]=useState<Contratante[]>([])
  const [modal,setModal]=useState(new URLSearchParams(window.location.search).get('novo')==='1')
  const [tipoFormulario,setTipoFormulario]=useState<TipoLancamento>('RECEITA')
  const [tipoFiltro,setTipoFiltro]=useState<''|TipoLancamento>('')
  const [pesquisa,setPesquisa]=useState('')
  const [veiculoFiltro,setVeiculoFiltro]=useState('')
  const [mensagem,setMensagem]=useState('')
  const [carregando,setCarregando]=useState(true)

  const carregar=useCallback(async()=>{
    const {inicio,fim}=intervalo(mes)
    setCarregando(true)
    try{setLista(await api<LancamentoFinanceiro[]>(`/api/lancamentos?inicio=${inicio}&fim=${fim}`))}
    catch(e){setMensagem((e as Error).message)}finally{setCarregando(false)}
  },[mes])

  useEffect(()=>{void carregar()},[carregar])
  useEffect(()=>{
    let ativo=true
    Promise.all([
      api<Categoria[]>('/api/categorias'),api<Veiculo[]>('/api/veiculos'),
      api<Motorista[]>('/api/motoristas'),api<Contratante[]>('/api/contratantes'),
    ]).then(([c,v,m,co])=>{if(ativo){setCategorias(c);setVeiculos(v);setMotoristas(m);setContratantes(co)}})
      .catch(e=>{if(ativo)setMensagem(e.message)})
    return()=>{ativo=false}
  },[])

  const filtrados=useMemo(()=>lista
    .filter(item=>!tipoFiltro||item.tipo===tipoFiltro)
    .filter(item=>!veiculoFiltro||item.veiculoId===Number(veiculoFiltro))
    .filter(item=>!pesquisa||`${item.descricao} ${item.categoria} ${item.protocolo??''}`.toLowerCase().includes(pesquisa.toLowerCase())),
    [lista,pesquisa,tipoFiltro,veiculoFiltro])
  const realizado=filtrados.reduce((total,item)=>total+(item.realizado?(item.tipo==='RECEITA'?item.valor:-item.valor):0),0)
  const categoriasFormulario=categorias.filter(c=>c.tipo===tipoFormulario&&c.ativo)

  async function salvar(evento:FormEvent<HTMLFormElement>){
    evento.preventDefault();setMensagem('')
    const form=new FormData(evento.currentTarget),dataLancamento=String(form.get('data')),status=String(form.get('status'))
    try{
      if(tipoFormulario==='RECEITA'){
        await api('/api/receitas',{method:'POST',body:JSON.stringify({
          descricao:form.get('descricao'),categoriaId:form.get('categoriaId')?Number(form.get('categoriaId')):null,
          contratanteId:form.get('contratanteId')?Number(form.get('contratanteId')):null,valor:Number(form.get('valor')),
          dataCompetencia:dataLancamento,dataRecebimento:status==='RECEBIDA'?dataLancamento:null,status,recorrente:false,
          veiculoId:form.get('veiculoId')?Number(form.get('veiculoId')):null,observacoes:form.get('observacoes')||null,
        })})
      }else{
        const despesa=await api<Despesa>('/api/despesas',{method:'POST',body:JSON.stringify({
          descricao:form.get('descricao'),categoriaId:Number(form.get('categoriaId')),valor:Number(form.get('valor')),
          data:dataLancamento,vencimento:status==='PENDENTE'?dataLancamento:null,dataPagamento:status==='PAGO'?dataLancamento:null,
          formaPagamento:form.get('formaPagamento')||null,veiculoId:form.get('veiculoId')?Number(form.get('veiculoId')):null,
          motoristaId:form.get('motoristaId')?Number(form.get('motoristaId')):null,observacoes:form.get('observacoes')||null,status,
        })})
        await api(`/api/despesas/${despesa.id}/aprovar`,{method:'PATCH'})
      }
      setModal(false);setMensagem('Lançamento persistido. Os totais oficiais foram atualizados.');await carregar()
    }catch(e){setMensagem((e as Error).message)}
  }

  async function pagar(item:LancamentoFinanceiro){
    try{await api(`/api/despesas/${item.referenciaId}/pagar`,{method:'PATCH',body:JSON.stringify({dataPagamento:hoje(),formaPagamento:'PIX'})});setMensagem('Pagamento registrado no caixa real.');await carregar()}
    catch(e){setMensagem((e as Error).message)}
  }

  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Financeiro operacional</span><h1>Entradas e saídas</h1><p>Extrato formado exclusivamente por receitas, contas a receber e despesas persistidas no backend.</p></div>
      <div className="heading-total-with-action"><span><small>Saldo realizado filtrado</small><strong className={realizado>=0?'positive':'negative'}>{moeda(realizado)}</strong></span><button className="button button-primary" onClick={()=>setModal(true)}>+ Nova entrada ou saída</button></div></header>
    {mensagem?<div className="success-notice">{mensagem}</div>:null}
    <section className="panel"><div className="ledger-filters">
      <label><span>Competência</span><input aria-label="Competência" type="month" value={mes} onChange={e=>setMes(e.target.value)}/></label>
      <label><span>Tipo</span><select value={tipoFiltro} onChange={e=>setTipoFiltro(e.target.value as ''|TipoLancamento)}><option value="">Todos</option><option value="RECEITA">Receitas</option><option value="DESPESA">Despesas</option></select></label>
      <label><span>Veículo</span><select value={veiculoFiltro} onChange={e=>setVeiculoFiltro(e.target.value)}><option value="">Todos</option>{veiculos.map(v=><option key={v.id} value={v.id}>{v.identificacao}</option>)}</select></label>
      <label className="filter-grow"><span>Buscar</span><input value={pesquisa} onChange={e=>setPesquisa(e.target.value)} placeholder="Descrição, categoria ou protocolo"/></label>
    </div>
    {carregando?<p className="loading-card">Carregando lançamentos oficiais…</p>:filtrados.length?<div className="table-scroll"><table><thead><tr><th>Data financeira</th><th>Descrição</th><th>Categoria</th><th>Veículo</th><th>Situação</th><th>Valor</th><th/></tr></thead><tbody>{filtrados.map(item=><tr key={item.id}><td>{data(item.data)}</td><td><strong>{item.descricao}</strong><small>{item.origem}{item.protocolo?` · ${item.protocolo}`:''}</small></td><td>{item.categoria}</td><td>{item.veiculo??'—'}</td><td><span className={`ledger-status ${item.realizado?'ledger-recebido':'ledger-pendente'}`}>{item.realizado?(item.tipo==='RECEITA'?'Recebido':'Pago'):'Previsto'}</span></td><td className={item.tipo==='RECEITA'?'positive':'negative'}><strong>{item.tipo==='RECEITA'?'+':'−'} {moeda(item.valor)}</strong></td><td>{item.tipo==='DESPESA'&&!item.realizado&&item.status!=='REJEITADO'?<button className="table-action" onClick={()=>void pagar(item)}>Registrar pagamento</button>:null}</td></tr>)}</tbody></table></div>:<Vazio titulo="Nenhum lançamento" descricao="O backend não possui movimentos nesta competência."/>}
    </section>
    {modal?<div className="modal-backdrop"><section className="modal modal-financial" role="dialog" aria-modal="true" aria-labelledby="titulo-lancamento"><header><div><span className="eyebrow">Persistência real</span><h2 id="titulo-lancamento">Novo lançamento</h2></div><button aria-label="Fechar" onClick={()=>setModal(false)}>×</button></header>
      <form onSubmit={salvar} className="form-grid two-columns"><div className="segmented field-wide"><button type="button" className={tipoFormulario==='RECEITA'?'active':''} onClick={()=>setTipoFormulario('RECEITA')}>Receita</button><button type="button" className={tipoFormulario==='DESPESA'?'active':''} onClick={()=>setTipoFormulario('DESPESA')}>Despesa</button></div>
        <label className="field field-wide"><span>Descrição</span><input name="descricao" required/></label><label className="field"><span>Valor</span><input name="valor" type="number" min=".01" step=".01" required/></label>
        <label className="field"><span>Categoria</span><select name="categoriaId" required={tipoFormulario==='DESPESA'}><option value="">Sem categoria</option>{categoriasFormulario.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
        <label className="field"><span>Data</span><input name="data" type="date" defaultValue={hoje()} required/></label><label className="field"><span>Situação</span><select name="status">{tipoFormulario==='RECEITA'?<><option value="RECEBIDA">Recebida</option><option value="PREVISTA">Prevista</option></>:<><option value="PAGO">Paga</option><option value="PENDENTE">Pendente</option></>}</select></label>
        <label className="field"><span>Veículo</span><select name="veiculoId"><option value="">Não relacionado</option>{veiculos.map(v=><option key={v.id} value={v.id}>{v.identificacao}</option>)}</select></label>
        {tipoFormulario==='RECEITA'?<label className="field"><span>Contratante</span><select name="contratanteId"><option value="">Não informado</option>{contratantes.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>:<><label className="field"><span>Motorista</span><select name="motoristaId"><option value="">Não relacionado</option>{motoristas.map(m=><option key={m.id} value={m.id}>{m.nome}</option>)}</select></label><label className="field"><span>Forma de pagamento</span><select name="formaPagamento"><option value="">Não informada</option><option>PIX</option><option>Cartão</option><option>Dinheiro</option><option>Boleto</option></select></label></>}
        <label className="field field-wide"><span>Observações</span><textarea name="observacoes" rows={3}/></label><div className="modal-actions field-wide"><button className="button button-ghost" type="button" onClick={()=>setModal(false)}>Cancelar</button><button className="button button-primary">Salvar lançamento</button></div>
      </form></section></div>:null}
  </div>
}
