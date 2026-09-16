import { useEffect, useState, type FormEvent } from 'react'
import { atualizarReceita, criarReceita, excluirReceita, listarReceitas } from '../dados/receitas'
import { listarCategorias, listarContratantes } from '../dados/cadastros'
import { listarVeiculos } from '../dados/veiculos'
import { StatusBadge } from '../components/StatusBadge'
import { Carregando, Vazio } from '../components/EstadoPagina'
import type { Categoria, Contratante, Receita, Veiculo } from '../types/modelos'
import { data, hojeIso, moeda } from '../utils/formatadores'
import { Campo, Selecao } from '../components/Campos'
import { CampoValor } from '../components/CampoValor'
import { AcoesModal, Modal } from '../components/Modal'

export default function ReceitasPage(){
  const [lista,setLista]=useState<Receita[]>([]),[cadastros,setCadastros]=useState<{categorias:Categoria[];contratantes:Contratante[];veiculos:Veiculo[]}>({categorias:[],contratantes:[],veiculos:[]})
  const [form,setForm]=useState(false),[editando,setEditando]=useState<Receita|null>(null),[excluindo,setExcluindo]=useState<Receita|null>(null),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(true)
  const carregar=()=>listarReceitas().then(setLista).finally(()=>setCarregando(false))
  useEffect(()=>{carregar().catch(x=>setErro((x as Error).message))
    Promise.all([listarCategorias('RECEITA'),listarContratantes(),listarVeiculos()])
      .then(([categorias,contratantes,veiculos])=>setCadastros({categorias,contratantes,veiculos})).catch(x=>setErro((x as Error).message))},[])
  async function salvar(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget)
    const status=String(f.get('status'))
    const body={descricao:String(f.get('descricao')),valor:Number(f.get('valor')),dataCompetencia:String(f.get('dataCompetencia')),
      dataRecebimento:status==='RECEBIDA'?String(f.get('dataRecebimento')||'')||null:null,status:status as Receita['status'],recorrente:f.get('recorrente')==='on',
      contratanteId:f.get('contratanteId')?Number(f.get('contratanteId')):null,categoriaId:f.get('categoriaId')?Number(f.get('categoriaId')):null,
      veiculoId:f.get('veiculoId')?Number(f.get('veiculoId')):null,observacoes:String(f.get('observacoes')||'')||null}
    try{
      if(editando)await atualizarReceita(editando.id,body)
      else await criarReceita(body)
      setForm(false);setEditando(null);await carregar()
    }catch(x){setErro((x as Error).message)}
  }
  async function excluir(){if(!excluindo)return;try{await excluirReceita(excluindo.id);setExcluindo(null);await carregar()}catch(x){setErro((x as Error).message)}}
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Serviços das seguradoras</span><h1>Receitas</h1><p>Toda receita vem dos serviços das seguradoras, pela importação — não se lança à mão.</p></div></header>
    {erro?<div className="form-alert">{erro}</div>:null}<section className="panel">{carregando?<Carregando/>:lista.length?<div className="table-scroll"><table><thead><tr><th>Descrição</th><th>Competência</th><th>Contratante</th><th>Status</th><th>Valor</th><th/></tr></thead><tbody>
      {lista.map(r=><tr key={r.id}><td><strong>{r.descricao}</strong><small>{r.contaReceberId?`Conta #${r.contaReceberId}`:r.recorrente?'Recorrente':'Avulsa'}</small></td><td>{data(r.dataCompetencia)}</td><td>{r.contratante||'—'}</td><td><StatusBadge status={r.status}/></td><td className="positive"><strong>{moeda(r.valor)}</strong></td><td>{r.manual?<div className="heading-actions"><button className="table-action" onClick={()=>{setEditando(r);setForm(true)}}>Editar</button><button className="table-action table-action-danger" onClick={()=>setExcluindo(r)}>Excluir</button></div>:null}</td></tr>)}
    </tbody></table></div>:<Vazio titulo="Nenhuma receita" descricao="Recebimentos de contas e receitas manuais aparecerão aqui."/>}</section>
    {form?<Modal etiqueta="Receita avulsa" titulo={editando?'Editar receita':'Nova receita'}
      aoFechar={()=>{setForm(false);setEditando(null)}}>
      <form key={editando?.id??'nova'} onSubmit={salvar} className="form-grid two-columns"><label className="field field-wide"><span>Descrição</span><input name="descricao" defaultValue={editando?.descricao} required autoCapitalize="sentences" autoComplete="off"/></label>
        <CampoValor rotulo="Valor" name="valor" defaultValue={editando?.valor} required/>
        <Selecao rotulo="Status" name="status" defaultValue={editando?.status??'RECEBIDA'}
          opcoes={[{valor:'RECEBIDA',texto:'Recebida'},{valor:'PREVISTA',texto:'Prevista'}]}/>
        <label className="field"><span>Competência</span><input name="dataCompetencia" type="date" defaultValue={editando?.dataCompetencia??hojeIso()} required/></label>
        <label className="field"><span>Data do recebimento</span><input name="dataRecebimento" type="date" defaultValue={editando?.dataRecebimento??hojeIso()}/></label>
        <Selecao rotulo="Contratante" name="contratanteId" defaultValue={editando?.contratanteId??''} vazio="Não informado"
          opcoes={cadastros.contratantes.map(x=>({valor:x.id,texto:x.nome}))}/>
        <Selecao rotulo="Categoria" name="categoriaId" defaultValue={editando?.categoriaId??''} vazio="Sem categoria"
          opcoes={cadastros.categorias.map(x=>({valor:x.id,texto:x.nome}))}/>
        <Selecao rotulo="Veículo" name="veiculoId" defaultValue={editando?.veiculoId??''} vazio="Não relacionado"
          opcoes={cadastros.veiculos.map(x=>({valor:x.id,texto:x.identificacao}))}/>
        <label className="check-field"><input name="recorrente" type="checkbox" defaultChecked={editando?.recorrente}/> Receita recorrente</label>
        <Campo rotulo="Observações" className="field-wide">
          <textarea name="observacoes" rows={3} defaultValue={editando?.observacoes}/>
        </Campo>
        <AcoesModal aoCancelar={()=>{setForm(false);setEditando(null)}}>
          <button className="button button-primary">{editando?'Salvar alterações':'Salvar receita'}</button>
        </AcoesModal>
      </form>
    </Modal>:null}
    {excluindo?<Modal etiqueta="Ação irreversível" titulo="Excluir receita?" className="confirm-delete"
      aoFechar={()=>setExcluindo(null)}>
      <p>
        Tem certeza que deseja excluir esta receita? O lançamento será removido e os valores da
        Visão Geral e dos relatórios serão recalculados.
      </p>
      <AcoesModal aoCancelar={()=>setExcluindo(null)}>
        <button className="button button-danger" onClick={()=>void excluir()}>Excluir receita</button>
      </AcoesModal>
    </Modal>:null}
  </div>
}
