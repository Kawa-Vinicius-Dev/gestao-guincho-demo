import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/http'
import { StatusBadge } from '../components/StatusBadge'
import { Vazio } from '../components/EstadoPagina'
import type { Categoria, Contratante, Receita, Veiculo } from '../types/modelos'
import { data, moeda } from '../utils/formatadores'

export default function ReceitasPage(){
  const [lista,setLista]=useState<Receita[]>([]),[cadastros,setCadastros]=useState<{categorias:Categoria[];contratantes:Contratante[];veiculos:Veiculo[]}>({categorias:[],contratantes:[],veiculos:[]})
  const [form,setForm]=useState(false),[erro,setErro]=useState('')
  const carregar=()=>api<Receita[]>('/api/receitas').then(setLista)
  useEffect(()=>{carregar();Promise.all([api<Categoria[]>('/api/categorias?tipo=RECEITA'),api<Contratante[]>('/api/contratantes'),api<Veiculo[]>('/api/veiculos')])
    .then(([categorias,contratantes,veiculos])=>setCadastros({categorias,contratantes,veiculos}))},[])
  async function salvar(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget)
    const status=String(f.get('status'))
    const body={descricao:f.get('descricao'),valor:Number(f.get('valor')),dataCompetencia:f.get('dataCompetencia'),
      dataRecebimento:status==='RECEBIDA'?f.get('dataRecebimento'):null,status,recorrente:f.get('recorrente')==='on',
      contratanteId:f.get('contratanteId')?Number(f.get('contratanteId')):null,categoriaId:f.get('categoriaId')?Number(f.get('categoriaId')):null,
      veiculoId:f.get('veiculoId')?Number(f.get('veiculoId')):null,observacoes:f.get('observacoes')||null}
    try{await api('/api/receitas',{method:'POST',body:JSON.stringify(body)});setForm(false);await carregar()}catch(x){setErro((x as Error).message)}
  }
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Entradas</span><h1>Receitas</h1><p>Valores de outros clientes, recorrentes ou avulsos.</p></div><button className="button button-primary" onClick={()=>setForm(true)}>Nova receita</button></header>
    {erro?<div className="form-alert">{erro}</div>:null}<section className="panel">{lista.length?<div className="table-scroll"><table><thead><tr><th>Descrição</th><th>Competência</th><th>Contratante</th><th>Status</th><th>Valor</th></tr></thead><tbody>
      {lista.map(r=><tr key={r.id}><td><strong>{r.descricao}</strong><small>{r.contaReceberId?`Conta #${r.contaReceberId}`:r.recorrente?'Recorrente':'Avulsa'}</small></td><td>{data(r.dataCompetencia)}</td><td>{r.contratante||'—'}</td><td><StatusBadge status={r.status}/></td><td>{moeda(r.valor)}</td></tr>)}
    </tbody></table></div>:<Vazio titulo="Nenhuma receita" descricao="Recebimentos de contas e receitas manuais aparecerão aqui."/>}</section>
    {form?<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Entrada manual</span><h2>Nova receita</h2></div><button aria-label="Fechar" onClick={()=>setForm(false)}>×</button></header>
      <form onSubmit={salvar} className="form-grid two-columns"><label className="field field-wide"><span>Descrição</span><input name="descricao" required/></label>
        <label className="field"><span>Valor</span><input name="valor" type="number" step=".01" min=".01" required/></label>
        <label className="field"><span>Status</span><select name="status"><option>RECEBIDA</option><option>PREVISTA</option></select></label>
        <label className="field"><span>Competência</span><input name="dataCompetencia" type="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label>
        <label className="field"><span>Data do recebimento</span><input name="dataRecebimento" type="date" defaultValue={new Date().toISOString().slice(0,10)}/></label>
        <label className="field"><span>Contratante</span><select name="contratanteId"><option value="">Não informado</option>{cadastros.contratantes.map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
        <label className="field"><span>Categoria</span><select name="categoriaId"><option value="">Sem categoria</option>{cadastros.categorias.map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
        <label className="field"><span>Veículo</span><select name="veiculoId"><option value="">Não relacionado</option>{cadastros.veiculos.map(x=><option key={x.id} value={x.id}>{x.identificacao}</option>)}</select></label>
        <label className="check-field"><input name="recorrente" type="checkbox"/> Receita recorrente</label>
        <label className="field field-wide"><span>Observações</span><textarea name="observacoes" rows={3}/></label>
        <div className="modal-actions field-wide"><button type="button" className="button button-ghost" onClick={()=>setForm(false)}>Cancelar</button><button className="button button-primary">Salvar receita</button></div>
      </form></section></div>:null}
  </div>
}
