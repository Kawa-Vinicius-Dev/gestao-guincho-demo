import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { usePeriodoGlobal } from '../utils/periodoGlobal'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { excluirReceita, lerReceita } from '../dados/receitas'
import { lerExtrato } from '../dados/extrato'
import { aprovarDespesa, criarDespesa, pagarDespesa } from '../dados/despesas'
import { listarCategorias } from '../dados/cadastros'
import { listarMotoristas } from '../dados/motoristas'
import { listarVeiculos } from '../dados/veiculos'
import { CampoValor } from '../components/CampoValor'
import { Campo, Selecao } from '../components/Campos'
import { AcoesModal, Modal } from '../components/Modal'
import { ConfirmarExclusao } from '../components/ConfirmarExclusao'
import type { Categoria, Despesa, LancamentoFinanceiro, Motorista, Receita, Veiculo } from '../types/modelos'
import { data, moeda } from '../utils/formatadores'
import { FormReceita } from './extrato/FormReceita'
import { estaVencida, TabelaExtrato } from './extrato/TabelaExtrato'

/**
 * Atalhos no lugar do filtro de tipo: sao as tres perguntas que se faz ao
 * extrato — o que entrou, o que saiu e o que falta pagar.
 */
type Atalho = '' | 'RECEITAS' | 'DESPESAS' | 'A_PAGAR'
const ATALHOS: { valor: Atalho; texto: string }[] = [
  { valor: '', texto: 'Tudo' }, { valor: 'RECEITAS', texto: 'Receitas' },
  { valor: 'DESPESAS', texto: 'Despesas' }, { valor: 'A_PAGAR', texto: 'A pagar' },
]
const aPagar = (item: LancamentoFinanceiro) => item.tipo === 'DESPESA' && !item.realizado && item.status !== 'REJEITADO'
const noAtalho = (atalho: Atalho, item: LancamentoFinanceiro) =>
  atalho === 'RECEITAS' ? item.tipo === 'RECEITA'
  : atalho === 'DESPESAS' ? item.tipo === 'DESPESA'
  : atalho === 'A_PAGAR' ? aPagar(item)
  : true

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
  const [modal,setModal]=useState(new URLSearchParams(window.location.search).get('novo')==='1')
  // Receita: o formulario simples que substituiu a tela de Creditos. `null` fechado,
  // `true` para uma nova, a propria receita para editar.
  const [receitaAberta,setReceitaAberta]=useState<Receita|true|null>(null)
  const [excluindoReceita,setExcluindoReceita]=useState<LancamentoFinanceiro|null>(null)
  const [atalho,setAtalho]=useState<Atalho>('')
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
      listarCategorias(),listarVeiculos(),listarMotoristas(),
    ]).then(([c,v,m])=>{if(ativo){setCategorias(c);setVeiculos(v);setMotoristas(m)}})
      .catch(e=>{if(ativo)setMensagem(e.message)})
    return()=>{ativo=false}
  },[])

  const filtrados=useMemo(()=>{
    const visiveis=lista
      .filter(item=>noAtalho(atalho,item))
      .filter(item=>!veiculoFiltro||item.veiculoId===Number(veiculoFiltro))
      .filter(item=>!pesquisa||`${item.descricao} ${item.categoria} ${item.protocolo??''}`.toLowerCase().includes(pesquisa.toLowerCase()))
    // Em "A pagar" a ordem e a de pagar: a vencida mais antiga primeiro.
    return atalho==='A_PAGAR'?[...visiveis].sort((a,b)=>a.data.localeCompare(b.data)):visiveis
  },[lista,pesquisa,atalho,veiculoFiltro])
  // Os totais do topo sao do realizado, como o saldo sempre foi; o previsto
  // aparece embaixo de cada um. A soma dos saldos de cada dia bate com o saldo.
  const soma=(filtro:(item:LancamentoFinanceiro)=>boolean)=>filtrados.filter(filtro).reduce((t,item)=>t+item.valor,0)
  const entradas=soma(i=>i.tipo==='RECEITA'&&i.realizado)
  const saidas=soma(i=>i.tipo==='DESPESA'&&i.realizado)
  const aReceber=soma(i=>i.tipo==='RECEITA'&&!i.realizado&&i.status!=='REJEITADO')
  const faltaPagar=soma(aPagar)
  const realizado=entradas-saidas
  const quantosAPagar=lista.filter(aPagar).length
  const hojeDia=hoje()
  const vencidas=lista.filter(item=>estaVencida(item,hojeDia))
  const vencidoFiltrado=soma(item=>estaVencida(item,hojeDia))
  const categoriasDespesa=categorias.filter(c=>c.tipo==='DESPESA'&&c.ativo)

  async function salvar(evento:FormEvent<HTMLFormElement>){
    evento.preventDefault();setMensagem('')
    const form=new FormData(evento.currentTarget),dataLancamento=String(form.get('data')),status=String(form.get('status'))
    try{
      const despesa=await criarDespesa({
        descricao:String(form.get('descricao')),categoriaId:Number(form.get('categoriaId')),valor:Number(form.get('valor')),
        data:dataLancamento,vencimento:status==='PENDENTE'?dataLancamento:null,dataPagamento:status==='PAGO'?dataLancamento:null,
        formaPagamento:String(form.get('formaPagamento')||'')||null,veiculoId:form.get('veiculoId')?Number(form.get('veiculoId')):null,
        motoristaId:form.get('motoristaId')?Number(form.get('motoristaId')):null,observacoes:String(form.get('observacoes')||'')||null,status:status as Despesa['status'],
      })
      // Lancar e aprovar na mesma acao: no Supabase isto esbarra na regra de que
      // ninguem aprova o proprio lancamento. Ver dados/despesas.test.ts.
      await aprovarDespesa(despesa.id)
      setModal(false);setMensagem('Lançamento salvo. Os totais foram atualizados.');await carregar()
    }catch(e){setMensagem((e as Error).message)}
  }

  async function editarReceita(item:LancamentoFinanceiro){
    try{setReceitaAberta(await lerReceita(item.referenciaId))}
    catch(e){setMensagem((e as Error).message)}
  }

  async function pagar(item:LancamentoFinanceiro){
    try{await pagarDespesa(item.referenciaId,hoje(),'PIX');setMensagem('Pagamento registrado no caixa real.');await carregar()}
    catch(e){setMensagem((e as Error).message)}
  }

  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Financeiro operacional</span><h1>Extrato</h1><p>Tudo o que entrou e saiu no período: receitas, despesas e comissões. Clique num lançamento para ver categoria, viatura e origem.</p></div>
      <div className="heading-actions"><button className="button button-ghost" onClick={()=>setReceitaAberta(true)}>+ Registrar receita</button><button className="button button-primary" onClick={()=>setModal(true)}>+ Nova despesa</button></div></header>
    {mensagem?<div className="success-notice">{mensagem}</div>:null}
    {/* Fica preso no topo enquanto a lista rola: os tres numeros seguem os filtros. */}
    <section className="extrato-totais" aria-label="Totais do extrato">
      <div><small>Entradas</small><strong className="positive">{moeda(entradas)}</strong>{aReceber?<span>{moeda(aReceber)} a receber</span>:null}</div>
      <div><small>Saídas</small><strong className="negative">{moeda(saidas)}</strong>{faltaPagar?<span>{moeda(faltaPagar)} a pagar{vencidoFiltrado?<> · <b className="extrato-vencido">{moeda(vencidoFiltrado)} vencido</b></>:null}</span>:null}</div>
      <div><small>Saldo realizado</small><strong className={realizado>=0?'positive':'negative'}>{moeda(realizado)}</strong><span>{filtrados.length} {filtrados.length===1?'lançamento':'lançamentos'}</span></div>
    </section>
    <section className="panel"><div className="ledger-filters">
      <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/>
      <Selecao rotulo="Veículo" vazio="Todos" value={veiculoFiltro} onChange={e=>setVeiculoFiltro(e.target.value)}
        opcoes={veiculos.map(v=>({valor:v.id,texto:v.identificacao}))}/>
      <Campo rotulo="Buscar" className="filter-grow"><input type="search" inputMode="search" autoCorrect="off" autoCapitalize="none" value={pesquisa} onChange={e=>setPesquisa(e.target.value)} placeholder="Descrição, categoria ou protocolo"/></Campo>
    </div>
    <div className="extrato-atalhos segmented" role="group" aria-label="Mostrar">
      {ATALHOS.map(a=><button key={a.valor} type="button" className={atalho===a.valor?'active':undefined} aria-pressed={atalho===a.valor}
        onClick={()=>setAtalho(a.valor)}>{a.texto}{a.valor==='A_PAGAR'&&quantosAPagar?` (${quantosAPagar}${vencidas.length?` · ${vencidas.length} ${vencidas.length===1?'vencida':'vencidas'}`:''})`:''}</button>)}
    </div>
    <TabelaExtrato itens={filtrados} carregando={carregando} hoje={hojeDia} aoPagar={item=>void pagar(item)}
      aoEditarReceita={item=>void editarReceita(item)} aoExcluirReceita={setExcluindoReceita}/>
    </section>
    {modal?<Modal etiqueta="Persistência real" titulo="Novo lançamento" className="modal-financial"
      aoFechar={()=>setModal(false)}>
      <form onSubmit={salvar} className="form-grid two-columns">
        <Campo rotulo="Descrição" className="field-wide"><input name="descricao" required autoCapitalize="sentences" autoComplete="off"/></Campo><CampoValor rotulo="Valor" name="valor" required/>
        <Selecao rotulo="Categoria" name="categoriaId" required vazio="Sem categoria"
          opcoes={categoriasDespesa.map(c=>({valor:c.id,texto:c.nome}))}/>
        <Campo rotulo="Data"><input name="data" type="date" defaultValue={hoje()} required/></Campo>
        <Selecao rotulo="Situação" name="status" opcoes={[{valor:'PAGO',texto:'Paga'},{valor:'PENDENTE',texto:'Pendente'}]}/>
        <Selecao rotulo="Veículo" name="veiculoId" vazio="Não relacionado" opcoes={veiculos.map(v=>({valor:v.id,texto:v.identificacao}))}/>
        <Selecao rotulo="Motorista" name="motoristaId" vazio="Não relacionado" opcoes={motoristas.map(m=>({valor:m.id,texto:m.nome}))}/>
        <Selecao rotulo="Forma de pagamento" name="formaPagamento" vazio="Não informada" opcoes={FORMAS_PAGAMENTO}/>
        <Campo rotulo="Observações" className="field-wide"><textarea name="observacoes" rows={3}/></Campo><AcoesModal aoCancelar={()=>setModal(false)}>
          <button className="button button-primary">Salvar lançamento</button>
        </AcoesModal>
      </form>
    </Modal>:null}
    {receitaAberta?<FormReceita categorias={categorias} receita={receitaAberta===true?undefined:receitaAberta}
      aoFechar={()=>setReceitaAberta(null)}
      aoSalvar={texto=>{setReceitaAberta(null);setMensagem(texto);void carregar()}}/>:null}
    {excluindoReceita?<ConfirmarExclusao coisa="receita" nome={excluindoReceita.descricao}
      aviso="A receita sai do extrato e dos totais."
      resumo={[['Descrição',excluindoReceita.descricao],['Data',data(excluindoReceita.data)],['Valor',moeda(excluindoReceita.valor)]]}
      aoConfirmar={async()=>{await excluirReceita(excluindoReceita.referenciaId);setMensagem('Receita excluída.');await carregar()}}
      aoFechar={()=>setExcluindoReceita(null)}/>:null}
  </div>
}
