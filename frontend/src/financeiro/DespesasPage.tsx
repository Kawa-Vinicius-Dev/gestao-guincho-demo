import { useEffect, useState, type FormEvent } from 'react'
import { alternarAtivoDespesaFixa, criarDespesaFixa, lancarDespesasFixasDoMes, listarDespesasFixas } from '../dados/despesasFixas'
import { aprovarDespesa, criarDespesa, excluirDespesa, listarDespesas, marcarDescontoComissao, pagarDespesa } from '../dados/despesas'
import { abrirComprovante, anexarComprovante, removerComprovante } from '../dados/comprovantes'
import { listarCategorias } from '../dados/cadastros'
import { listarMotoristas } from '../dados/motoristas'
import { listarVeiculos } from '../dados/veiculos'
import { useAuth } from '../auth/AuthContext'
import { useAoVivo } from '../dados/aoVivo'
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
  // O socorrista escolhido decide se a marca de desconto aparece: sem ele nao ha
  // de quem descontar.
  const [socorristaDoForm,setSocorristaDoForm]=useState('')
  const abrirForm=()=>{setSocorristaDoForm('');setForm(true)}
  const [fixas,setFixas]=useState<DespesaRecorrente[]>([]),[mes,setMes]=useState(mesAtual()),[lancando,setLancando]=useState(false)
  // Qual despesa esta na janela de confirmacao, e nao um booleano: a janela
  // precisa dizer qual e, com descricao e valor, senao confirmar e um chute.
  const [excluindo,setExcluindo]=useState<Despesa|null>(null),[apagando,setApagando]=useState(false)
  const carregar=()=>admin?listarDespesas().then(setLista):Promise.resolve()
  // Despesa lancada por outra pessoa, ou comissao recalculada, entra na lista sozinha.
  useAoVivo(()=>{carregar().catch(x=>setErro((x as Error).message))},admin)
  const [carregando,setCarregando]=useState(true)
  useEffect(()=>{carregar().catch(x=>setErro((x as Error).message)).finally(()=>setCarregando(false))
    Promise.all([listarCategorias('DESPESA'),listarVeiculos(),listarMotoristas()])
      .then(([c,v,m])=>{setCategorias(c);setVeiculos(v);setMotoristas(m)}).catch(x=>setErro((x as Error).message))
    carregarFixas().catch(x=>setErro((x as Error).message))},[admin])
  async function salvar(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget)
    const texto=(campo:string)=>String(f.get(campo)||'')||null
    const categoriaId=Number(f.get('categoriaId'))
    // Descricao e opcional: sem ela, o nome da categoria ja diz o que foi.
    const descricao=texto('descricao')??categorias.find(c=>c.id===categoriaId)?.nome??'Despesa'
    const body={descricao,categoriaId,valor:Number(f.get('valor')),data:String(f.get('data')),
      vencimento:null,dataPagamento:null,formaPagamento:texto('formaPagamento'),
      veiculoId:f.get('veiculoId')?Number(f.get('veiculoId')):null,motoristaId:f.get('motoristaId')?Number(f.get('motoristaId')):null,
      protocolo:texto('protocolo'),observacoes:texto('observacoes'),// Do administrador a despesa ja nasce paga; do socorrista vai para aprovacao.
      status:(admin?'PAGO':'PENDENTE') as Despesa['status'],
      natureza:'GERAL' as const,descontaComissao:f.get('descontaComissao')==='on'}
    setErro('');setMensagem('')
    // Quem responde pelo caixa nao precisa aprovar o proprio lancamento: a
    // despesa do administrador ja nasce aprovada, e paga se ele disse que ja
    // pagou. A RPC confere o perfil, entao a bandeira so escolhe o caminho.
    try{const criada=await criarDespesa(body,admin);setForm(false)
      // A mensagem sai do que o banco devolveu, e nao do que a tela pediu:
      // quando a funcao de lancamento em um passo ainda nao foi aplicada, a
      // despesa volta pendente, e dizer "ja esta na Visao geral" seria mentira.
      setMensagem(!admin
        ?'Despesa enviada para aprovação do administrador.'
        :criada.status==='PAGO'
        ?'Despesa registrada e paga. Já está na Visão geral.'
        :criada.aprovada
        ?'Despesa registrada e aprovada. Registre o pagamento quando ele sair.'
        :'Despesa registrada, mas ficou pendente: o banco ainda não tem o lançamento em um passo. Aprove e registre o pagamento para ela entrar nos totais.')
      await carregar()}catch(x){setErro((x as Error).message)}
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
  async function alternarDesconto(d:Despesa){setErro('');setMensagem('')
    try{await marcarDescontoComissao(d.id,!d.descontaComissao)
      setMensagem(d.descontaComissao
        ?`"${d.descricao}" não desconta mais da comissão de ${d.motorista}.`
        :`"${d.descricao}" agora desconta da comissão de ${d.motorista}.`)
      await carregar()}
    catch(x){setErro((x as Error).message)}}
  async function aprovar(id:number){setErro('');try{await aprovarDespesa(id);await carregar()}catch(x){setErro((x as Error).message)}}
  async function pagar(id:number){setErro('');setMensagem('')
    try{await pagarDespesa(id,hoje(),'PIX');setMensagem('Pagamento registrado no caixa oficial.');await carregar()}catch(x){setErro((x as Error).message)}}
  async function anexar(despesa:Despesa,arquivo:File){setErro('')
    try{await anexarComprovante(despesa,arquivo);await carregar()}catch(x){setErro((x as Error).message)}}
  async function abrir(despesa:Despesa){setErro('')
    try{window.open(await abrirComprovante(despesa),'_blank','noopener')}catch(x){setErro((x as Error).message)}}
  async function remover(despesa:Despesa){setErro('')
    try{await removerComprovante(despesa);await carregar()}catch(x){setErro((x as Error).message)}}
  async function excluir(){const despesa=excluindo;if(!despesa)return
    setErro('');setMensagem('');setApagando(true)
    try{await excluirDespesa(despesa);setExcluindo(null)
      setMensagem(`Despesa "${despesa.descricao}" excluída. Os totais foram recalculados.`)
      await carregar()}
    // A janela fica aberta quando da erro: fechar levaria embora a unica
    // explicacao de por que a despesa continua na lista.
    catch(x){setErro((x as Error).message)}finally{setApagando(false)}}
  return <div className="page-enter pagina-despesas"><header className="page-heading"><div><span className="eyebrow">Saídas</span><h1>Despesas</h1><p>Custos da operação vinculados a veículos, motoristas e protocolos.</p></div><button className="button button-primary" onClick={abrirForm}>Registrar despesa</button></header>
    {erro?<div className="form-alert" role="alert">{erro}</div>:null}{carregando?<Carregando/>:null}{mensagem?<div className="success-notice">{mensagem}</div>:null}
    {admin?<section className="panel">{lista.length?<div className="table-scroll"><table><thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Veículo</th><th>Socorrista</th><th>Situação</th><th>Aprovação</th><th>Valor</th><th>Comprovante</th><th/></tr></thead><tbody>
      {lista.map(d=><tr key={d.id}><td><strong>{d.descricao}</strong><small>{d.criadoPor}</small></td><td>{d.categoria}</td><td>{data(d.data)}</td><td>{d.veiculo||'—'}</td><td>{d.motorista||'—'}{d.motorista&&!d.protocolo?.startsWith('COMISSAO-')
          ?<label className="desconto-na-lista"><input type="checkbox" checked={Boolean(d.descontaComissao)} onChange={()=>void alternarDesconto(d)} aria-label={`Descontar ${d.descricao} da comissão de ${d.motorista}`}/><span>Desconta da comissão</span></label>
          :null}</td><td><StatusBadge status={d.status}/></td><td>{d.aprovada?<span className="approved">Aprovada</span>:<button className="table-action" onClick={()=>void aprovar(d.id)}>Aprovar</button>}</td><td className="negative"><strong>{moeda(d.valor)}</strong></td>
        <td>{d.comprovanteNomeOriginal?<span className="comprovante-anexado"><button className="table-action" onClick={()=>void abrir(d)}>Ver</button><button className="table-action table-action-danger" onClick={()=>void remover(d)}>Remover</button></span>
          :<label className="table-action file-action">Anexar comprovante<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>{const arquivo=e.target.files?.[0];if(arquivo)void anexar(d,arquivo);e.target.value=''}}/></label>}</td>
        <td><span className="acoes-da-linha">{d.aprovada&&d.status!=='PAGO'&&d.status!=='REJEITADO'?<button className="table-action" onClick={()=>void pagar(d.id)}>Registrar pagamento</button>:null}
          {/* A comissao nasce e se recalcula sozinha a partir da OP: apagar a
              linha nao adianta, ela voltaria no proximo recalculo. */}
          {d.protocolo?.startsWith('COMISSAO-')?<small>Automática</small>:<button className="table-action botao-lixeira" title={`Excluir ${d.descricao}`} aria-label={`Excluir despesa ${d.descricao}`} onClick={()=>setExcluindo(d)}>
            <IconeLixeira/>
          </button>}</span></td></tr>)}
      </tbody></table></div>:<Vazio titulo="Nenhuma despesa" descricao="Registre custos ou aguarde lançamentos dos socorristas."/>}</section>
      :<section className="employee-callout"><span className="eyebrow">Perfil socorrista</span><h2>Registre os custos assim que acontecerem.</h2><p>Seus lançamentos serão conferidos pelo administrador antes de entrarem no financeiro.</p><button className="button button-primary" onClick={abrirForm}>Registrar agora</button></section>}
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
    {form?<Modal etiqueta="Saída" titulo="Registrar despesa" largo aoFechar={()=>setForm(false)}>
      {/* O essencial primeiro: quanto, no que, quando e de quem. O resto e raro e
          fica em "Mais detalhes", fechado. */}
      <form onSubmit={salvar} className="form-grid three-columns">
        <CampoValor rotulo="Valor" name="valor" required/>
        <Selecao rotulo="Categoria" name="categoriaId" required opcoes={categorias.map(x=>({valor:x.id,texto:x.nome}))}/>
        <label className="field"><span>Data</span><input name="data" type="date" defaultValue={hoje()} required/></label>
        <Selecao rotulo="Viatura" name="veiculoId" vazio="Nenhuma" opcoes={veiculos.map(x=>({valor:x.id,texto:x.identificacao}))}/>
        <Selecao rotulo="Socorrista" name="motoristaId" vazio="Nenhum" onChange={e=>setSocorristaDoForm(e.target.value)} opcoes={motoristas.map(x=>({valor:x.id,texto:x.nome}))}/>
        <label className="field"><span>Descrição</span><input name="descricao" placeholder="Opcional" autoCapitalize="sentences" autoComplete="off"/></label>
        {admin&&socorristaDoForm
          ?<label className="porto-divergence field-wide despesa-desconto"><input type="checkbox" name="descontaComissao" aria-label="Descontar da comissão"/><span>Descontar da comissão do socorrista — gasto pessoal que ele pediu para tirar do bolso dele.</span></label>
          :null}
        <details className="field-wide despesa-mais-detalhes">
          <summary>Mais detalhes</summary>
          <div className="form-grid three-columns">
            <Selecao rotulo="Forma de pagamento" name="formaPagamento" vazio="Não informada" opcoes={FORMAS_PAGAMENTO}/>
            <label className="field"><span>Protocolo ou referência</span><input name="protocolo" autoCapitalize="characters" autoCorrect="off" spellCheck={false}/></label>
            <label className="field two-span"><span>Observações</span><input name="observacoes" autoCapitalize="sentences" autoComplete="off"/></label>
          </div>
        </details>
        <AcoesModal aoCancelar={()=>setForm(false)}>
          <button className="button button-primary">Salvar despesa</button>
        </AcoesModal>
      </form>
    </Modal>:null}
    {excluindo?<Modal etiqueta="Ação irreversível" titulo="Excluir despesa?" className="confirmar-exclusao"
      nomeAcessivel={`Excluir despesa ${excluindo.descricao}`}
      aoFechar={()=>{if(!apagando)setExcluindo(null)}}>
      <p className="saida-texto">
        A despesa sai da lista e dos totais da Visão geral, e o comprovante anexado é
        apagado junto. Não dá para desfazer.
      </p>
      <dl className="confirmar-exclusao-resumo">
        <div><dt>Descrição</dt><dd>{excluindo.descricao}</dd></div>
        <div><dt>Categoria</dt><dd>{excluindo.categoria||'—'}</dd></div>
        <div><dt>Data</dt><dd>{data(excluindo.data)}</dd></div>
        <div><dt>Valor</dt><dd className="negative">{moeda(excluindo.valor)}</dd></div>
      </dl>
      <div className="modal-actions">
        <button type="button" className="button button-ghost" disabled={apagando} onClick={()=>setExcluindo(null)}>Manter despesa</button>
        <button type="button" className="button button-danger" disabled={apagando} onClick={()=>void excluir()}>{apagando?'Excluindo…':'Excluir despesa'}</button>
      </div>
    </Modal>:null}
  </div>
}

/** Lixeira em SVG: um <img> a mais por linha da tabela so para desenhar isto e
 *  uma requisicao que nao precisa existir, e emoji muda de forma em cada
 *  sistema. `currentColor` deixa o icone seguir o tom do botao nos dois temas. */
function IconeLixeira(){
  return <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 4h11M6.5 4V2.6h3V4M4 4l.6 9a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L12 4M6.6 6.8v4.4M9.4 6.8v4.4"/>
  </svg>
}
