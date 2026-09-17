import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { usePeriodoGlobal } from '../utils/periodoGlobal'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { criarReceita } from '../dados/receitas'
import { lerExtrato } from '../dados/extrato'
import { aprovarDespesa, criarDespesa, pagarDespesa } from '../dados/despesas'
import { listarCategorias, listarContratantes } from '../dados/cadastros'
import { listarMotoristas } from '../dados/motoristas'
import { listarVeiculos } from '../dados/veiculos'
import { CampoValor } from '../components/CampoValor'
import { Campo, Selecao } from '../components/Campos'
import { AcoesModal, Modal } from '../components/Modal'
import type { Categoria, Contratante, Despesa, LancamentoFinanceiro, Motorista, Receita, Veiculo } from '../types/modelos'
import { moeda } from '../utils/formatadores'
import { TabelaExtrato } from './extrato/TabelaExtrato'

type TipoLancamento = 'RECEITA' | 'DESPESA'

/** Mesma lista em Lancamentos e em Despesas; ficava escrita nas duas telas. */
export const FORMAS_PAGAMENTO = [
  {valor:'PIX',texto:'PIX'},{valor:'Cartão',texto:'Cartão'},
  {valor:'Dinheiro',texto:'Dinheiro'},{valor:'Boleto',texto:'Boleto'},
] as const

const hoje = () => {
  const atual = new Date()
  return `${atual.getFullYear()}-${String(atual.getMonth()+1).padStart(2,'0')}-${String(atual.getDate()).padStart(2,'0')}`
}

export default function LancamentosPage() {
  const [periodo,setPeriodo]=usePeriodoGlobal()
  const [lista,setLista]=useState<LancamentoFinanceiro[]>([])
  const [categorias,setCategorias]=useState<Categoria[]>([])
  const [veiculos,setVeiculos]=useState<Veiculo[]>([])
  const [motoristas,setMotoristas]=useState<Motorista[]>([])
  const [contratantes,setContratantes]=useState<Contratante[]>([])
  const [modal,setModal]=useState(new URLSearchParams(window.location.search).get('novo')==='1')
  // Receita nao se lanca a mao: a unica receita real vem dos servicos das seguradoras, pelo
  // pipeline de importacao. O formulario manual existe so para despesa.
  const [tipoFormulario]=useState<TipoLancamento>('DESPESA')
  const [tipoFiltro,setTipoFiltro]=useState<''|TipoLancamento>('')
  const [pesquisa,setPesquisa]=useState('')
  const [veiculoFiltro,setVeiculoFiltro]=useState('')
  const [mensagem,setMensagem]=useState('')
  const [carregando,setCarregando]=useState(true)

  const carregar=useCallback(async()=>{
    const {inicio,fim}=periodo
    if(!inicio||!fim||inicio>fim)return
    setCarregando(true)
    try{setLista(await lerExtrato(inicio,fim))}
    catch(e){setMensagem((e as Error).message)}finally{setCarregando(false)}
  },[periodo])

  useEffect(()=>{void carregar()},[carregar])
  useEffect(()=>{
    let ativo=true
    Promise.all([
      listarCategorias(),listarVeiculos(),
      listarMotoristas(),listarContratantes(),
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
        await criarReceita({
          descricao:String(form.get('descricao')),categoriaId:form.get('categoriaId')?Number(form.get('categoriaId')):null,
          contratanteId:form.get('contratanteId')?Number(form.get('contratanteId')):null,valor:Number(form.get('valor')),
          dataCompetencia:dataLancamento,dataRecebimento:status==='RECEBIDA'?dataLancamento:null,
          status:status as Receita['status'],recorrente:false,
          veiculoId:form.get('veiculoId')?Number(form.get('veiculoId')):null,observacoes:String(form.get('observacoes')||'')||null,
        })
      }else{
        const despesa=await criarDespesa({
          descricao:String(form.get('descricao')),categoriaId:Number(form.get('categoriaId')),valor:Number(form.get('valor')),
          data:dataLancamento,vencimento:status==='PENDENTE'?dataLancamento:null,dataPagamento:status==='PAGO'?dataLancamento:null,
          formaPagamento:String(form.get('formaPagamento')||'')||null,veiculoId:form.get('veiculoId')?Number(form.get('veiculoId')):null,
          motoristaId:form.get('motoristaId')?Number(form.get('motoristaId')):null,observacoes:String(form.get('observacoes')||'')||null,status:status as Despesa['status'],
        })
        // Lancar e aprovar na mesma acao: no Supabase isto esbarra na regra de que
        // ninguem aprova o proprio lancamento. Ver dados/despesas.test.ts.
        await aprovarDespesa(despesa.id)
      }
      setModal(false);setMensagem('Lançamento persistido. Os totais oficiais foram atualizados.');await carregar()
    }catch(e){setMensagem((e as Error).message)}
  }

  async function pagar(item:LancamentoFinanceiro){
    try{await pagarDespesa(item.referenciaId,hoje(),'PIX');setMensagem('Pagamento registrado no caixa real.');await carregar()}
    catch(e){setMensagem((e as Error).message)}
  }

  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Financeiro operacional</span><h1>Extrato</h1><p>Extrato formado exclusivamente por receitas, contas a receber e despesas persistidas no backend.</p></div>
      <div className="heading-total-with-action"><span><small>Saldo realizado filtrado</small><strong className={realizado>=0?'positive':'negative'}>{moeda(realizado)}</strong></span><button className="button button-primary" onClick={()=>setModal(true)}>+ Nova despesa</button></div></header>
    {mensagem?<div className="success-notice">{mensagem}</div>:null}
    <section className="panel"><div className="ledger-filters">
      <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/>
      <Selecao rotulo="Tipo" vazio="Todos" value={tipoFiltro} onChange={e=>setTipoFiltro(e.target.value as ''|TipoLancamento)}
        opcoes={[{valor:'RECEITA',texto:'Receitas'},{valor:'DESPESA',texto:'Despesas'}]}/>
      <Selecao rotulo="Veículo" vazio="Todos" value={veiculoFiltro} onChange={e=>setVeiculoFiltro(e.target.value)}
        opcoes={veiculos.map(v=>({valor:v.id,texto:v.identificacao}))}/>
      <Campo rotulo="Buscar" className="filter-grow"><input type="search" inputMode="search" autoCorrect="off" autoCapitalize="none" value={pesquisa} onChange={e=>setPesquisa(e.target.value)} placeholder="Descrição, categoria ou protocolo"/></Campo>
    </div>
    <TabelaExtrato itens={filtrados} carregando={carregando} aoPagar={item=>void pagar(item)}/>
    </section>
    {modal?<Modal etiqueta="Persistência real" titulo="Novo lançamento" className="modal-financial"
      aoFechar={()=>setModal(false)}>
      <form onSubmit={salvar} className="form-grid two-columns">
        <Campo rotulo="Descrição" className="field-wide"><input name="descricao" required autoCapitalize="sentences" autoComplete="off"/></Campo><CampoValor rotulo="Valor" name="valor" required/>
        <Selecao rotulo="Categoria" name="categoriaId" required={tipoFormulario==='DESPESA'} vazio="Sem categoria"
          opcoes={categoriasFormulario.map(c=>({valor:c.id,texto:c.nome}))}/>
        <Campo rotulo="Data"><input name="data" type="date" defaultValue={hoje()} required/></Campo>
        <Selecao rotulo="Situação" name="status" opcoes={tipoFormulario==='RECEITA'
          ?[{valor:'RECEBIDA',texto:'Recebida'},{valor:'PREVISTA',texto:'Prevista'}]
          :[{valor:'PAGO',texto:'Paga'},{valor:'PENDENTE',texto:'Pendente'}]}/>
        <Selecao rotulo="Veículo" name="veiculoId" vazio="Não relacionado" opcoes={veiculos.map(v=>({valor:v.id,texto:v.identificacao}))}/>
        {tipoFormulario==='RECEITA'
          ?<Selecao rotulo="Contratante" name="contratanteId" vazio="Não informado" opcoes={contratantes.map(c=>({valor:c.id,texto:c.nome}))}/>
          :<><Selecao rotulo="Motorista" name="motoristaId" vazio="Não relacionado" opcoes={motoristas.map(m=>({valor:m.id,texto:m.nome}))}/>
            <Selecao rotulo="Forma de pagamento" name="formaPagamento" vazio="Não informada" opcoes={FORMAS_PAGAMENTO}/></>}
        <Campo rotulo="Observações" className="field-wide"><textarea name="observacoes" rows={3}/></Campo><AcoesModal aoCancelar={()=>setModal(false)}>
          <button className="button button-primary">Salvar lançamento</button>
        </AcoesModal>
      </form>
    </Modal>:null}
  </div>
}
