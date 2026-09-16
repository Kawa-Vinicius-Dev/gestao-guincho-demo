import { useEffect, useState, type FormEvent } from 'react'
import { alternarAtivoDespesaFixa, criarDespesaFixa, lancarDespesasFixasDoMes, listarDespesasFixas } from '../dados/despesasFixas'
import { aprovarDespesa, criarDespesa, listarDespesas, pagarDespesa } from '../dados/despesas'
import { abrirComprovante, anexarComprovante, removerComprovante } from '../dados/comprovantes'
import { listarCategorias } from '../dados/cadastros'
import { listarMotoristas } from '../dados/motoristas'
import { listarVeiculos } from '../dados/veiculos'
import { useAuth } from '../auth/AuthContext'
import { CampoNumero } from '../components/CamposMascarados'
import { StatusBadge } from '../components/StatusBadge'
import { Carregando, Vazio } from '../components/EstadoPagina'
import type { Categoria, Despesa, DespesaRecorrente,  Motorista, Veiculo } from '../types/modelos'
import { data, hojeIso, moeda } from '../utils/formatadores'
import { Campo, Selecao } from '../components/Campos'
import { FORMAS_PAGAMENTO } from './LancamentosPage'
import { CampoValor } from '../components/CampoValor'
import { AcoesModal, Modal } from '../components/Modal'

const mesAtual=()=>hojeIso().slice(0,7)

const hoje=hojeIso

export default function DespesasPage(){
  const {usuario}=useAuth(),admin=usuario?.perfil==='ADMINISTRADOR'
  const [lista,setLista]=useState<Despesa[]>([]),[categorias,setCategorias]=useState<Categoria[]>([]),[veiculos,setVeiculos]=useState<Veiculo[]>([]),[motoristas,setMotoristas]=useState<Motorista[]>([])
  const [form,setForm]=useState(false),[mensagem,setMensagem]=useState(''),[erro,setErro]=useState('')
  const [fixas,setFixas]=useState<DespesaRecorrente[]>([]),[mes,setMes]=useState(mesAtual()),[lancando,setLancando]=useState(false)
  const carregar=()=>admin?listarDespesas().then(setLista):Promise.resolve()
  const [carregando,setCarregando]=useState(true)
  useEffect(()=>{carregar().catch(x=>setErro((x as Error).message)).finally(()=>setCarregando(false))
    Promise.all([listarCategorias('DESPESA'),listarVeiculos(),listarMotoristas()])
      .then(([c,v,m])=>{setCategorias(c);setVeiculos(v);setMotoristas(m)}).catch(x=>setErro((x as Error).message))
    carregarFixas().catch(x=>setErro((x as Error).message))},[admin])
  async function salvar(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget)
    const texto=(campo:string)=>String(f.get(campo)||'')||null
    const body={descricao:String(f.get('descricao')),categoriaId:Number(f.get('categoriaId')),valor:Number(f.get('valor')),data:String(f.get('data')),
      vencimento:texto('vencimento'),dataPagamento:texto('dataPagamento'),formaPagamento:texto('formaPagamento'),
      veiculoId:f.get('veiculoId')?Number(f.get('veiculoId')):null,motoristaId:f.get('motoristaId')?Number(f.get('motoristaId')):null,
      protocolo:texto('protocolo'),observacoes:texto('observacoes'),status:(texto('status')??'PENDENTE') as Despesa['status']}
    setErro('');setMensagem('')
    try{await criarDespesa(body);setForm(false);setMensagem(admin?'Despesa registrada. Aprove para incluí-la nos totais.':'Despesa enviada para aprovação do administrador.');await carregar()}catch(x){setErro((x as Error).message)}
  }
  const carregarFixas=()=>admin?listarDespesasFixas().then(setFixas):Promise.resolve()
  async function salvarFixa(e:FormEvent<HTMLFormElement>){e.preventDefault();const formulario=e.currentTarget;const f=new FormData(formulario)
    setErro('');setMensagem('')
    try{await criarDespesaFixa({descricao:String(f.get('descricao')),categoriaId:Number(f.get('categoriaId')),valor:Number(f.get('valor')),diaVencimento:Number(f.get('diaVencimento')),veiculoId:f.get('veiculoId')?Number(f.get('veiculoId')):null})
      formulario.reset();await carregarFixas()}catch(x){setErro((x as Error).message)}
  }
  async function alternarFixa(fixa:DespesaRecorrente){setErro('')
    try{await alternarAtivoDespesaFixa(fixa);await carregarFixas()}
    catch(x){setErro((x as Error).message)}
  }
  // lancar o mesmo mes duas vezes nao duplica: o backend so cria o que falta
  async function lancarFixas(){setErro('');setMensagem('');setLancando(true)
    try{const r=await lancarDespesasFixasDoMes(mes)
      setMensagem(`${r.lancadas} ${r.lancadas===1?'despesa fixa lançada':'despesas fixas lançadas'}${r.valorLancado?` · ${moeda(r.valorLancado)}`:''}${r.jaExistiam?` · ${r.jaExistiam} já estavam lançadas`:''}.`)
      await carregar()}
    catch(x){setErro((x as Error).message)}finally{setLancando(false)}
  }
  async function aprovar(id:number){setErro('');try{await aprovarDespesa(id);await carregar()}catch(x){setErro((x as Error).message)}}
  async function pagar(id:number){setErro('');setMensagem('')
    try{await pagarDespesa(id,hoje(),'PIX');setMensagem('Pagamento registrado no caixa oficial.');await carregar()}catch(x){setErro((x as Error).message)}}
  async function anexar(despesa:Despesa,arquivo:File){setErro('')
    try{await anexarComprovante(despesa,arquivo);await carregar()}catch(x){setErro((x as Error).message)}}
  async function abrir(despesa:Despesa){setErro('')
    try{window.open(await abrirComprovante(despesa),'_blank','noopener')}catch(x){setErro((x as Error).message)}}
  async function remover(despesa:Despesa){setErro('')
    try{await removerComprovante(despesa);await carregar()}catch(x){setErro((x as Error).message)}}
  return <div className="page-enter pagina-despesas"><header className="page-heading"><div><span className="eyebrow">Saídas</span><h1>Despesas</h1><p>Custos da operação vinculados a veículos, motoristas e protocolos.</p></div><button className="button button-primary" onClick={()=>setForm(true)}>Registrar despesa</button></header>
    {erro?<div className="form-alert" role="alert">{erro}</div>:null}{carregando?<Carregando/>:null}{mensagem?<div className="success-notice">{mensagem}</div>:null}
    {admin?<section className="panel">{lista.length?<div className="table-scroll"><table><thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Veículo</th><th>Situação</th><th>Aprovação</th><th>Valor</th><th>Comprovante</th><th/></tr></thead><tbody>
      {lista.map(d=><tr key={d.id}><td><strong>{d.descricao}</strong><small>{d.criadoPor}</small></td><td>{d.categoria}</td><td>{data(d.data)}</td><td>{d.veiculo||'—'}</td><td><StatusBadge status={d.status}/></td><td>{d.aprovada?<span className="approved">Aprovada</span>:<button className="table-action" onClick={()=>void aprovar(d.id)}>Aprovar</button>}</td><td className="negative"><strong>{moeda(d.valor)}</strong></td>
        <td>{d.comprovanteNomeOriginal?<span className="comprovante-anexado"><button className="table-action" onClick={()=>void abrir(d)}>Ver</button><button className="table-action table-action-danger" onClick={()=>void remover(d)}>Remover</button></span>
          :<label className="table-action file-action">Anexar comprovante<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>{const arquivo=e.target.files?.[0];if(arquivo)void anexar(d,arquivo);e.target.value=''}}/></label>}</td>
        <td>{d.aprovada&&d.status!=='PAGO'&&d.status!=='REJEITADO'?<button className="table-action" onClick={()=>void pagar(d.id)}>Registrar pagamento</button>:null}</td></tr>)}
      </tbody></table></div>:<Vazio titulo="Nenhuma despesa" descricao="Registre custos ou aguarde lançamentos dos socorristas."/>}</section>
      :<section className="employee-callout"><span className="eyebrow">Perfil socorrista</span><h2>Registre os custos assim que acontecerem.</h2><p>Seus lançamentos serão conferidos pelo administrador antes de entrarem no financeiro.</p><button className="button button-primary" onClick={()=>setForm(true)}>Registrar agora</button></section>}
    {admin?<section className="panel" aria-label="Despesas fixas"><header className="panel-title"><div><h2>Despesas fixas</h2><p>O que cai todo mês: aluguel, seguro, parcela. Cadastre uma vez e lance o mês quando quiser.</p></div>
      <div className="heading-actions"><Campo rotulo="Mês"><input aria-label="Mês do lançamento" type="month" value={mes} onChange={e=>setMes(e.target.value)}/></Campo>
        <button className="button button-primary" disabled={lancando||!fixas.some(f=>f.ativo)} onClick={()=>void lancarFixas()}>{lancando?'Lançando…':'Lançar as fixas do mês'}</button></div></header>
      {fixas.length?<ul className="simple-list">{fixas.map(f=><li key={f.id}><strong>{f.descricao}</strong><small>{f.categoria} · {moeda(f.valor)} · todo dia {f.diaVencimento}{f.veiculo?` · ${f.veiculo}`:''}{f.ativo?'':' · desativada'}</small><button className={f.ativo?'table-action table-action-danger':'table-action'} onClick={()=>void alternarFixa(f)}>{f.ativo?'Desativar':'Reativar'}</button></li>)}</ul>:<p className="empty-inline">Nenhuma despesa fixa cadastrada.</p>}
      <form onSubmit={salvarFixa} className="inline-form">
        <Campo rotulo="Descrição da despesa fixa"><input name="descricao" placeholder="Ex.: Aluguel do pátio" required autoCapitalize="sentences" autoComplete="off"/></Campo>
        <Selecao rotulo="Categoria da despesa fixa" name="categoriaId" required opcoes={categorias.map(x=>({valor:x.id,texto:x.nome}))}/>
        <CampoValor rotulo="Valor da despesa fixa" name="valor" required/>
        <CampoNumero rotulo="Dia do vencimento" name="diaVencimento" decimais={0} min={1} max={31} required/>
        <Selecao rotulo="Veículo da despesa fixa" name="veiculoId" vazio="Sem veículo" opcoes={veiculos.map(x=>({valor:x.id,texto:x.identificacao}))}/>
        <button className="button button-ghost">Adicionar</button></form></section>:null}
    {form?<Modal etiqueta="Comprovante operacional" titulo="Registrar despesa" largo aoFechar={()=>setForm(false)}>
      <form onSubmit={salvar} className="form-grid three-columns"><label className="field field-wide"><span>Descrição</span><input name="descricao" required autoCapitalize="sentences" autoComplete="off"/></label>
        <Selecao rotulo="Categoria" name="categoriaId" required opcoes={categorias.map(x=>({valor:x.id,texto:x.nome}))}/>
        <CampoValor rotulo="Valor" name="valor" required/>
        <Selecao rotulo="Situação" name="status" opcoes={[{valor:'PAGO',texto:'Paga'},{valor:'PENDENTE',texto:'Pendente'}]}/>
        <label className="field"><span>Data</span><input name="data" type="date" defaultValue={hoje()} required/></label>
        <label className="field"><span>Vencimento</span><input name="vencimento" type="date"/></label><label className="field"><span>Data do pagamento</span><input name="dataPagamento" type="date"/></label>
        <Selecao rotulo="Forma de pagamento" name="formaPagamento" vazio="Não informada" opcoes={FORMAS_PAGAMENTO}/>
        <Selecao rotulo="Veículo" name="veiculoId" vazio="Não relacionado" opcoes={veiculos.map(x=>({valor:x.id,texto:x.identificacao}))}/>
        <Selecao rotulo="Motorista" name="motoristaId" vazio="Não relacionado" opcoes={motoristas.map(x=>({valor:x.id,texto:x.nome}))}/>
        <label className="field"><span>Protocolo ou referência</span><input name="protocolo" autoCapitalize="characters" autoCorrect="off" spellCheck={false}/></label><label className="field two-span"><span>Comprovante (referência)</span><input name="comprovante" placeholder="Nome ou caminho do arquivo" autoCapitalize="sentences" autoComplete="off"/></label>
        <label className="field field-wide"><span>Observações</span><textarea name="observacoes" rows={3}/></label>
        <AcoesModal aoCancelar={()=>setForm(false)}>
          <button className="button button-primary">Enviar despesa</button>
        </AcoesModal>
      </form>
    </Modal>:null}
  </div>
}
