import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/http'
import { useAuth } from '../auth/AuthContext'
import { StatusBadge } from '../components/StatusBadge'
import { Vazio } from '../components/EstadoPagina'
import type { Categoria, Despesa, DespesaRecorrente, LancamentoRecorrente, Motorista, Veiculo } from '../types/modelos'
import { data, hojeIso, moeda } from '../utils/formatadores'

const mesAtual=()=>hojeIso().slice(0,7)

const hoje=hojeIso

export default function DespesasPage(){
  const {usuario}=useAuth(),admin=usuario?.perfil==='ADMINISTRADOR'
  const [lista,setLista]=useState<Despesa[]>([]),[categorias,setCategorias]=useState<Categoria[]>([]),[veiculos,setVeiculos]=useState<Veiculo[]>([]),[motoristas,setMotoristas]=useState<Motorista[]>([])
  const [form,setForm]=useState(false),[mensagem,setMensagem]=useState(''),[erro,setErro]=useState('')
  const [fixas,setFixas]=useState<DespesaRecorrente[]>([]),[mes,setMes]=useState(mesAtual()),[lancando,setLancando]=useState(false)
  const carregar=()=>admin?api<Despesa[]>('/api/despesas').then(setLista):Promise.resolve()
  useEffect(()=>{carregar().catch(x=>setErro((x as Error).message))
    Promise.all([api<Categoria[]>('/api/categorias?tipo=DESPESA'),api<Veiculo[]>('/api/veiculos'),api<Motorista[]>('/api/motoristas')])
      .then(([c,v,m])=>{setCategorias(c);setVeiculos(v);setMotoristas(m)}).catch(x=>setErro((x as Error).message))
    carregarFixas().catch(x=>setErro((x as Error).message))},[admin])
  async function salvar(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget)
    const body={descricao:f.get('descricao'),categoriaId:Number(f.get('categoriaId')),valor:Number(f.get('valor')),data:f.get('data'),
      vencimento:f.get('vencimento')||null,dataPagamento:f.get('dataPagamento')||null,formaPagamento:f.get('formaPagamento')||null,
      veiculoId:f.get('veiculoId')?Number(f.get('veiculoId')):null,motoristaId:f.get('motoristaId')?Number(f.get('motoristaId')):null,
      protocolo:f.get('protocolo')||null,comprovante:f.get('comprovante')||null,observacoes:f.get('observacoes')||null,status:f.get('status')}
    setErro('');setMensagem('')
    try{await api('/api/despesas',{method:'POST',body:JSON.stringify(body)});setForm(false);setMensagem(admin?'Despesa registrada. Aprove para incluí-la nos totais.':'Despesa enviada para aprovação do administrador.');await carregar()}catch(x){setErro((x as Error).message)}
  }
  const carregarFixas=()=>admin?api<DespesaRecorrente[]>('/api/despesas-recorrentes').then(setFixas):Promise.resolve()
  async function salvarFixa(e:FormEvent<HTMLFormElement>){e.preventDefault();const formulario=e.currentTarget;const f=new FormData(formulario)
    setErro('');setMensagem('')
    try{await api('/api/despesas-recorrentes',{method:'POST',body:JSON.stringify({descricao:f.get('descricao'),categoriaId:Number(f.get('categoriaId')),valor:Number(f.get('valor')),diaVencimento:Number(f.get('diaVencimento')),veiculoId:f.get('veiculoId')?Number(f.get('veiculoId')):null})})
      formulario.reset();await carregarFixas()}catch(x){setErro((x as Error).message)}
  }
  async function alternarFixa(fixa:DespesaRecorrente){setErro('')
    try{await api(`/api/despesas-recorrentes/${fixa.id}/${fixa.ativo?'desativar':'reativar'}`,{method:'PATCH'});await carregarFixas()}
    catch(x){setErro((x as Error).message)}
  }
  // lancar o mesmo mes duas vezes nao duplica: o backend so cria o que falta
  async function lancarFixas(){setErro('');setMensagem('');setLancando(true)
    try{const r=await api<LancamentoRecorrente>(`/api/despesas-recorrentes/lancamentos?mes=${mes}`,{method:'POST'})
      setMensagem(`${r.lancadas} ${r.lancadas===1?'despesa fixa lançada':'despesas fixas lançadas'}${r.valorLancado?` · ${moeda(r.valorLancado)}`:''}${r.jaExistiam?` · ${r.jaExistiam} já estavam lançadas`:''}.`)
      await carregar()}
    catch(x){setErro((x as Error).message)}finally{setLancando(false)}
  }
  async function aprovar(id:number){setErro('');try{await api(`/api/despesas/${id}/aprovar`,{method:'PATCH'});await carregar()}catch(x){setErro((x as Error).message)}}
  async function pagar(id:number){setErro('');setMensagem('')
    try{await api(`/api/despesas/${id}/pagar`,{method:'PATCH',body:JSON.stringify({dataPagamento:hoje(),formaPagamento:'PIX'})});setMensagem('Pagamento registrado no caixa oficial.');await carregar()}catch(x){setErro((x as Error).message)}}
  async function anexarComprovante(id:number,arquivo:File){setErro('')
    const dados=new FormData();dados.append('arquivo',arquivo)
    try{await api(`/api/despesas/${id}/comprovante`,{method:'POST',body:dados});await carregar()}catch(x){setErro((x as Error).message)}}
  async function abrirComprovante(id:number){setErro('')
    try{const r=await api<{url:string}>(`/api/despesas/${id}/comprovante`);window.open(r.url,'_blank','noopener')}catch(x){setErro((x as Error).message)}}
  async function removerComprovante(id:number){setErro('')
    try{await api(`/api/despesas/${id}/comprovante`,{method:'DELETE'});await carregar()}catch(x){setErro((x as Error).message)}}
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Saídas</span><h1>Despesas</h1><p>Custos da operação vinculados a veículos, motoristas e protocolos.</p></div><button className="button button-primary" onClick={()=>setForm(true)}>Registrar despesa</button></header>
    {erro?<div className="form-alert" role="alert">{erro}</div>:null}{mensagem?<div className="success-notice">{mensagem}</div>:null}
    {admin?<section className="panel">{lista.length?<div className="table-scroll"><table><thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Veículo</th><th>Situação</th><th>Aprovação</th><th>Valor</th><th>Comprovante</th><th/></tr></thead><tbody>
      {lista.map(d=><tr key={d.id}><td><strong>{d.descricao}</strong><small>{d.criadoPor}</small></td><td>{d.categoria}</td><td>{data(d.data)}</td><td>{d.veiculo||'—'}</td><td><StatusBadge status={d.status}/></td><td>{d.aprovada?<span className="approved">Aprovada</span>:<button className="table-action" onClick={()=>void aprovar(d.id)}>Aprovar</button>}</td><td>{moeda(d.valor)}</td>
        <td>{d.comprovanteNomeOriginal?<span className="comprovante-anexado"><button className="table-action" onClick={()=>void abrirComprovante(d.id)}>Ver</button><button className="table-action table-action-danger" onClick={()=>void removerComprovante(d.id)}>Remover</button></span>
          :<input className="file-action" aria-label="Anexar comprovante" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>{const arquivo=e.target.files?.[0];if(arquivo)void anexarComprovante(d.id,arquivo);e.target.value=''}}/>}</td>
        <td>{d.aprovada&&d.status!=='PAGO'&&d.status!=='REJEITADO'?<button className="table-action" onClick={()=>void pagar(d.id)}>Registrar pagamento</button>:null}</td></tr>)}
      </tbody></table></div>:<Vazio titulo="Nenhuma despesa" descricao="Registre custos ou aguarde lançamentos dos socorristas."/>}</section>
      :<section className="employee-callout"><span className="eyebrow">Perfil socorrista</span><h2>Registre os custos assim que acontecerem.</h2><p>Seus lançamentos serão conferidos pelo administrador antes de entrarem no financeiro.</p><button className="button button-primary" onClick={()=>setForm(true)}>Registrar agora</button></section>}
    {admin?<section className="panel" aria-label="Despesas fixas"><header className="panel-title"><div><h2>Despesas fixas</h2><p>O que cai todo mês: aluguel, seguro, parcela. Cadastre uma vez e lance o mês quando quiser.</p></div>
      <div className="heading-actions"><label className="field"><span>Mês</span><input aria-label="Mês do lançamento" type="month" value={mes} onChange={e=>setMes(e.target.value)}/></label>
        <button className="button button-primary" disabled={lancando||!fixas.some(f=>f.ativo)} onClick={()=>void lancarFixas()}>{lancando?'Lançando…':'Lançar as fixas do mês'}</button></div></header>
      {fixas.length?<ul className="simple-list">{fixas.map(f=><li key={f.id}><strong>{f.descricao}</strong><small>{f.categoria} · {moeda(f.valor)} · todo dia {f.diaVencimento}{f.veiculo?` · ${f.veiculo}`:''}{f.ativo?'':' · desativada'}</small><button className={f.ativo?'table-action table-action-danger':'table-action'} onClick={()=>void alternarFixa(f)}>{f.ativo?'Desativar':'Reativar'}</button></li>)}</ul>:<p className="empty-inline">Nenhuma despesa fixa cadastrada.</p>}
      <form onSubmit={salvarFixa} className="inline-form"><input name="descricao" aria-label="Descrição da despesa fixa" placeholder="Ex.: Aluguel do pátio" required/>
        <select name="categoriaId" aria-label="Categoria da despesa fixa" required>{categorias.map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select>
        <input name="valor" aria-label="Valor da despesa fixa" type="number" step=".01" min=".01" placeholder="Valor" required/>
        <input name="diaVencimento" aria-label="Dia do vencimento" type="number" min="1" max="31" placeholder="Dia" required/>
        <select name="veiculoId" aria-label="Veículo da despesa fixa"><option value="">Sem veículo</option>{veiculos.map(x=><option key={x.id} value={x.id}>{x.identificacao}</option>)}</select>
        <button className="button button-ghost">Adicionar</button></form></section>:null}
    {form?<div className="modal-backdrop"><section className="modal modal-wide" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Comprovante operacional</span><h2>Registrar despesa</h2></div><button aria-label="Fechar" onClick={()=>setForm(false)}>×</button></header>
      <form onSubmit={salvar} className="form-grid three-columns"><label className="field field-wide"><span>Descrição</span><input name="descricao" required/></label>
        <label className="field"><span>Categoria</span><select name="categoriaId" required>{categorias.map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
        <label className="field"><span>Valor</span><input name="valor" type="number" step=".01" min=".01" required/></label>
        <label className="field"><span>Situação</span><select name="status"><option>PAGO</option><option>PENDENTE</option></select></label>
        <label className="field"><span>Data</span><input name="data" type="date" defaultValue={hoje()} required/></label>
        <label className="field"><span>Vencimento</span><input name="vencimento" type="date"/></label><label className="field"><span>Data do pagamento</span><input name="dataPagamento" type="date"/></label>
        <label className="field"><span>Forma de pagamento</span><select name="formaPagamento"><option value="">Não informada</option><option>PIX</option><option>Cartão</option><option>Dinheiro</option><option>Boleto</option></select></label>
        <label className="field"><span>Veículo</span><select name="veiculoId"><option value="">Não relacionado</option>{veiculos.map(x=><option key={x.id} value={x.id}>{x.identificacao}</option>)}</select></label>
        <label className="field"><span>Motorista</span><select name="motoristaId"><option value="">Não relacionado</option>{motoristas.map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
        <label className="field"><span>Protocolo ou referência</span><input name="protocolo"/></label><label className="field two-span"><span>Comprovante (referência)</span><input name="comprovante" placeholder="Nome ou caminho do arquivo"/></label>
        <label className="field field-wide"><span>Observações</span><textarea name="observacoes" rows={3}/></label>
        <div className="modal-actions field-wide"><button type="button" className="button button-ghost" onClick={()=>setForm(false)}>Cancelar</button><button className="button button-primary">Enviar despesa</button></div>
      </form></section></div>:null}
  </div>
}
