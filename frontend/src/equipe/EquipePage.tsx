import { useEffect,useState,type FormEvent } from 'react'
import { criarAcessoSocorrista, definirAcessoAtivo, listarUsuarios, redefinirSenha } from '../dados/usuarios'
import { listarComissaoPrevista, type ComissaoPrevista } from '../dados/comissoes'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { usePeriodoGlobal } from '../utils/periodoGlobal'
import { moeda } from '../utils/formatadores'
import { Link } from 'react-router-dom'
import { listarVeiculos } from '../dados/veiculos'
import { listarTodasAsOs, type LinhaOs } from '../dados/porto/listaOs'
import { ServicosPorGrupo, contarServicos } from '../components/ServicosPorGrupo'
import { porCompetenciaDaOp } from '../utils/modoDoPeriodo'
import './equipe.css'
import { alternarAtivoMotorista, atualizarMotorista, criarMotorista, definirPercentualDoSocorrista, excluirMotorista, listarMotoristas } from '../dados/motoristas'
import { ConfirmarExclusao } from '../components/ConfirmarExclusao'
import { ConfirmarAcao, type PedidoConfirmacao } from '../components/ConfirmarAcao'
import { CampoDocumento, CampoTelefone } from '../components/CamposMascarados'
import { Carregando,ErroPagina,Vazio } from '../components/EstadoPagina'
import type { Motorista,SenhaRedefinida,Usuario,Veiculo } from '../types/modelos'
import { Selecao } from '../components/Campos'
import { Modal } from '../components/Modal'
import { ehAuxiliar } from '../utils/auxiliar'

export default function EquipePage(){
  const [motoristas,setMotoristas]=useState<Motorista[]>([])
  const [veiculos,setVeiculos]=useState<Veiculo[]>([])
  const [carregando,setCarregando]=useState(true),[modal,setModal]=useState(false),[salvando,setSalvando]=useState(false),[erro,setErro]=useState('')
  const [pedido,setPedido]=useState<PedidoConfirmacao|null>(null)
  const [editando,setEditando]=useState<Motorista|null>(null),[excluindo,setExcluindo]=useState<Motorista|null>(null)
  const [dandoAcesso,setDandoAcesso]=useState<Motorista|null>(null),[acesso,setAcesso]=useState<SenhaRedefinida|null>(null)
  // A conta de acesso mora em `perfis`; o cadastro do socorrista so guarda o id dela.
  const [contas,setContas]=useState<Usuario[]>([])
  const [periodo,setPeriodo]=usePeriodoGlobal()
  const [previstas,setPrevistas]=useState<ComissaoPrevista[]>([])
  const contaDe=(m:Motorista)=>contas.find(c=>c.id===String(m.usuarioId))
  const previstaDe=(m:Motorista)=>previstas.find(p=>p.motoristaId===m.id)
  const carregar=()=>{setCarregando(true);setErro('');listarMotoristas().then(setMotoristas).catch(e=>setErro(e.message)).finally(()=>setCarregando(false))}
  useEffect(carregar,[])
  useEffect(()=>{listarVeiculos().then(setVeiculos).catch(()=>setVeiculos([]))},[])
  // Servicos de cada socorrista no periodo, com o total (Kawa, 23/09/2026).
  const [servicos,setServicos]=useState<LinhaOs[]|null>(null)
  useEffect(()=>{if(!periodo.inicio||!periodo.fim||periodo.inicio>periodo.fim)return
    let valeu=true
    listarTodasAsOs({inicio:periodo.inicio,fim:periodo.fim,porCompetencia:porCompetenciaDaOp(periodo)})
      .then(p=>{if(valeu)setServicos(p.itens)}).catch(()=>{if(valeu)setServicos(null)})
    return()=>{valeu=false}},[periodo.inicio,periodo.fim,periodo.op])
  const carregarContas=()=>{listarUsuarios().then(setContas).catch(()=>setContas([]))}
  useEffect(carregarContas,[])
  // Producao da competencia: o que cada um rodou e ainda espera a OP.
  useEffect(()=>{if(!periodo.inicio||!periodo.fim)return
    listarComissaoPrevista(periodo.inicio,periodo.fim).then(setPrevistas).catch(()=>setPrevistas([]))},[periodo.inicio,periodo.fim])

  function abrirCadastro(){setEditando(null);setErro('');setModal(true)}
  function abrirEdicao(motorista:Motorista){setEditando(motorista);setErro('');setModal(true)}
  function fechar(){setModal(false);setEditando(null);setErro('')}
  async function salvar(evento:FormEvent<HTMLFormElement>){
    evento.preventDefault();const form=new FormData(evento.currentTarget);setSalvando(true);setErro('')
    const corpo={nome:String(form.get('nome')),telefone:String(form.get('telefone')||'')||null,documento:String(form.get('documento')||'')||null,qra:String(form.get('qra')||'')||null,veiculoId:Number(form.get('veiculoId'))||null,
      codigosPorto:String(form.get('codigosPorto')||'').split(/[\s,;]+/).map(c=>c.trim()).filter(Boolean)}
    try{
      const motorista=editando
        ?await atualizarMotorista(editando.id,corpo)
        :await criarMotorista(corpo)
      // A comissao vai por caminho proprio: ela refaz o dinheiro das OPs que
      // ainda nao fecharam, e por isso nao entra junto do cadastro comum.
      const digitado=String(form.get('percentualComissao')||'').trim()
      const novoPercentual=digitado===''?null:Number(digitado.replace(',','.'))/100
      if(novoPercentual!==(editando?.percentualComissao??null)){
        await definirPercentualDoSocorrista(motorista.id,novoPercentual)
        motorista.percentualComissao=novoPercentual??undefined
      }
      setMotoristas(lista=>editando?lista.map(item=>item.id===motorista.id?motorista:item):[...lista,motorista])
      fechar()
    }catch(e){setErro((e as Error).message)}finally{setSalvando(false)}
  }
  // o dono nao escolhe senha por ninguem: o sistema sorteia uma provisoria e o socorrista troca no primeiro acesso
  async function criarAcesso(evento:FormEvent<HTMLFormElement>){
    evento.preventDefault();if(!dandoAcesso)return;const form=new FormData(evento.currentTarget);setSalvando(true);setErro('')
    try{
      setAcesso(await criarAcessoSocorrista(dandoAcesso.id,String(form.get('email'))))
      setDandoAcesso(null);carregar()
    }catch(e){setErro((e as Error).message)}finally{setSalvando(false)}
  }
  // Senha nova aparece uma vez so, como na criacao: o dono repassa e o socorrista troca.
  function pedirNovaSenha(motorista:Motorista){
    const conta=contaDe(motorista);if(!conta)return
    setPedido({titulo:`Redefinir a senha de ${motorista.nome}?`,
      efeito:<>A senha atual deixa de funcionar na hora. O sistema gera uma provisória para você repassar, e <strong>{motorista.nome}</strong> troca no próximo acesso.</>,
      resumo:[['Socorrista',motorista.nome],['E-mail',conta.email]],
      textoConfirmar:'Redefinir senha',perigo:true,
      aoConfirmar:async()=>{setAcesso(await redefinirSenha(conta));carregarContas()}})
  }
  // Bloquear tira a entrada sem apagar o cadastro: comissao e historico continuam.
  function pedirBloqueio(motorista:Motorista){
    const conta=contaDe(motorista);if(!conta)return
    setPedido(conta.ativo
      ?{titulo:`Bloquear o acesso de ${motorista.nome}?`,
        efeito:<><strong>{motorista.nome}</strong> deixa de entrar no sistema. O cadastro, as comissões e o histórico continuam, e o acesso volta quando você liberar.</>,
        resumo:[['Socorrista',motorista.nome],['E-mail',conta.email]],textoConfirmar:'Bloquear acesso',perigo:true,
        aoConfirmar:async()=>{await definirAcessoAtivo(String(conta.id),false);carregarContas()}}
      :{titulo:`Liberar o acesso de ${motorista.nome}?`,
        efeito:<><strong>{motorista.nome}</strong> volta a entrar no sistema com a senha que já tinha.</>,
        resumo:[['Socorrista',motorista.nome],['E-mail',conta.email]],textoConfirmar:'Liberar acesso',
        aoConfirmar:async()=>{await definirAcessoAtivo(String(conta.id),true);carregarContas()}})
  }
  // desativar nao apaga: o socorrista sai dos vinculos novos e o historico dele continua de pe
  async function alternarAtivo(motorista:Motorista){
    setErro('')
    try{
      const atualizado=await alternarAtivoMotorista(motorista)
      setMotoristas(lista=>lista.map(item=>item.id===atualizado.id?atualizado:item))
    }catch(e){setErro((e as Error).message)}
  }

  if(carregando)return <Carregando/>
  if(erro&&!motoristas.length)return <ErroPagina mensagem={erro} tentarNovamente={carregar}/>
  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Operação e identificação</span><h1>Socorristas</h1><p>Clique no cartão de um socorrista para ver os serviços, a comissão e as despesas dele.</p></div><button className="button button-primary" onClick={abrirCadastro}>+ Cadastrar socorrista</button></header>
    {erro?<div className="form-alert" role="alert">{erro}</div>:null}
    <section className="panel painel-filtros"><form className="ledger-filters" onSubmit={e=>e.preventDefault()}>
      <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/>
    </form></section>
    {servicos?.length?<section className="panel panel-respiro" aria-label="Serviços por socorrista"><ServicosPorGrupo tipo="socorrista" titulo="Serviços por socorrista no período" linhas={contarServicos(servicos,'socorrista')}/></section>:null}
    {motoristas.length?<section className="team-grid" aria-label="Socorristas cadastrados">{motoristas.map(motorista=><article className="panel team-card team-card-real" key={motorista.id}>
      <header><span className="team-avatar">{motorista.nome.split(' ').map(parte=>parte[0]).slice(0,2).join('')}</span><span><strong><Link className="team-card-link" to={`/equipe/${motorista.id}`} title={`Abrir ${motorista.nome}`}>{motorista.nome}</Link></strong><small>{ehAuxiliar(motorista.nome)?'Recebe as OS que chegam sem socorrista':<>{motorista.qra||'QRA não informado'}{motorista.veiculo?` · ${motorista.veiculo}`:' · sem viatura'}{motorista.percentualComissao!=null?` · ${Math.round(motorista.percentualComissao*1000)/10}% de comissão`:''}</>}</small></span><span className={`staff-status ${motorista.ativo?'staff-disponivel':'staff-folga'}`}>{motorista.ativo?'Ativo':'Inativo'}</span></header>
      <div className="team-contact"><span>Telefone<strong>{motorista.telefone||(ehAuxiliar(motorista.nome)?'—':'Não informado')}</strong></span>
        <span>Acesso<strong>{(()=>{const c=contaDe(motorista)
          if(!motorista.usuarioId)return 'Sem acesso'
          if(!c)return 'Vinculado'
          if(!c.ativo)return 'Bloqueado'
          return c.senhaProvisoria?'Senha provisória':'Ativo'})()}</strong><small>{contaDe(motorista)?.email??''}</small></span></div>
      {/* O que ele rodou na competencia e ainda espera a OP: producao antes do pagamento. */}
      {previstaDe(motorista)?<p className="team-previsto">{previstaDe(motorista)!.servicos} {previstaDe(motorista)!.servicos===1?'serviço aguardando OP':'serviços aguardando OP'} · {moeda(previstaDe(motorista)!.valorPrevisto)} previstos{previstaDe(motorista)!.semValor?` · ${previstaDe(motorista)!.semValor} sem valor`:''}</p>:null}
      <div className="team-card-actions">
        <button className="table-action" onClick={()=>abrirEdicao(motorista)}>Editar</button>
        <button className={motorista.ativo?'table-action table-action-danger':'table-action'} onClick={()=>setPedido(motorista.ativo
            ?{titulo:'Desativar socorrista?',efeito:<><strong>{motorista.nome}</strong> sai das listas de escolha e não recebe OS novas pelo QRA. Serviços, comissões e despesas já lançados continuam.</>,resumo:[['Socorrista',motorista.nome],['QRA',motorista.qra||'—']],textoConfirmar:'Desativar',perigo:true,aoConfirmar:()=>alternarAtivo(motorista)}
            :{titulo:'Reativar socorrista?',efeito:<><strong>{motorista.nome}</strong> volta às listas de escolha e passa a receber OS pelo QRA.</>,resumo:[['Socorrista',motorista.nome],['QRA',motorista.qra||'—']],textoConfirmar:'Reativar',aoConfirmar:()=>alternarAtivo(motorista)})}>{motorista.ativo?'Desativar':'Reativar'}</button>
          {ehAuxiliar(motorista.nome)?null:<button className="table-action table-action-danger" onClick={()=>setExcluindo(motorista)}>Excluir</button>}
        {!motorista.usuarioId&&motorista.ativo&&!ehAuxiliar(motorista.nome)?<button className="table-action" onClick={()=>{setErro('');setDandoAcesso(motorista)}}>Criar acesso</button>:null}
        {motorista.usuarioId&&contaDe(motorista)?<>
          <button className="table-action" onClick={()=>pedirNovaSenha(motorista)}>Redefinir senha</button>
          <button className={contaDe(motorista)!.ativo?'table-action table-action-danger':'table-action'} onClick={()=>pedirBloqueio(motorista)}>{contaDe(motorista)!.ativo?'Bloquear acesso':'Liberar acesso'}</button>
        </>:null}</div>
    </article>)}</section>:<Vazio titulo="Nenhum socorrista cadastrado" descricao="Cadastre o primeiro socorrista para vinculá-lo às ordens de serviço."/>}

    {modal?<Modal etiqueta="Equipe" titulo={editando?'Editar socorrista':'Novo socorrista'}
      nomeAcessivel={editando?`Editar ${editando.nome}`:'Cadastrar socorrista'} aoFechar={fechar}>
      {erro?<div className="form-alert" role="alert">{erro}</div>:null}
      <form onSubmit={salvar} className="form-grid two-columns" key={editando?.id??'novo'}>
        <label className="field field-wide"><span>Nome</span><input name="nome" defaultValue={editando?.nome} required autoCapitalize="words" autoComplete="off"/></label>
        <CampoTelefone rotulo="Telefone" name="telefone" defaultValue={editando?.telefone}/>
        <label className="field"><span>QRA</span><input name="qra" defaultValue={editando?.qra} autoCapitalize="characters" autoCorrect="off" spellCheck={false}/><small>Como aparece no relatório da Porto. É o que liga o serviço a este socorrista.</small></label>
        <label className="field"><span>Códigos da Porto</span><input name="codigosPorto" defaultValue={editando?.codigosPorto?.join(', ')} autoCapitalize="characters" autoCorrect="off" spellCheck={false}/><small>Quando a OP traz um código no lugar do QRA. Separe mais de um por vírgula.</small></label>
        {/* Vinculo informativo: quem dirigiu o que e definido em cada OS, nao aqui. */}
        <Selecao rotulo="Viatura habitual" name="veiculoId" defaultValue={editando?.veiculoId??''} vazio="Sem viatura"
          ajuda="Só referência — a viatura de cada serviço vem da OS, não daqui."
          opcoes={veiculos.map(v=>({valor:v.id,texto:v.identificacao}))}/>
        <label className="field"><span>Comissão</span>
          <input name="percentualComissao" type="number" min="0" max="20" step="0.5" inputMode="decimal"
            defaultValue={editando?.percentualComissao!=null?String(Math.round(editando.percentualComissao*1000)/10):''}
            placeholder="20"/>
          <small>Em % do serviço, no máximo 20. Vazio usa os 20% padrão. Vale para o que ainda não foi pago: OP já fechada mantém a taxa dela.</small></label>
        <CampoDocumento rotulo="Documento" name="documento" className="field-wide" defaultValue={editando?.documento} aceitaRg ajuda="CPF, CNPJ ou RG. Só números."/>
        <div className="modal-actions field-wide"><button type="button" className="button button-ghost" onClick={fechar}>Cancelar</button><button className="button button-primary" disabled={salvando}>{salvando?'Salvando…':editando?'Salvar alterações':'Salvar socorrista'}</button></div>
      </form></Modal>:null}

    {dandoAcesso?<Modal etiqueta={dandoAcesso.nome} titulo="Criar acesso" aoFechar={()=>{setDandoAcesso(null);setErro('')}}>
      <p>{dandoAcesso.nome} vai poder registrar as próprias despesas e ver a comissão dele. O sistema gera uma senha provisória para você repassar.</p>
      {/* O erro aparece aqui dentro: com a janela aberta, o aviso da pagina fica escondido atras dela. */}
      {erro?<div className="form-alert" role="alert">{erro}</div>:null}
      <form onSubmit={criarAcesso} className="form-grid">
        <label className="field"><span>E-mail de acesso</span><input name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" required/></label>
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={()=>setDandoAcesso(null)}>Cancelar</button><button className="button button-primary" disabled={salvando}>{salvando?'Criando…':'Criar acesso'}</button></div>
      </form></Modal>:null}

    {acesso?<Modal etiqueta={acesso.nome} titulo="Acesso criado" aoFechar={()=>setAcesso(null)}>
      <p>Passe estes dados para {acesso.nome}. A senha aparece <strong>uma única vez</strong> e só serve para o primeiro acesso: o sistema obriga a troca antes de liberar qualquer tela.</p>
      <p className="senha-provisoria"><code>{acesso.email}</code></p>
      <p className="senha-provisoria"><code>{acesso.senhaProvisoria}</code></p>
      <div className="modal-actions"><button className="button button-primary" onClick={()=>setAcesso(null)}>Já anotei</button></div>
    </Modal>:null}
    {excluindo?<ConfirmarExclusao coisa="socorrista" nome={excluindo.nome}
      aviso="O socorrista sai do cadastro. Quem já tem serviço ou comissão não pode ser excluído: nesse caso, use Desativar."
      resumo={[['Nome',excluindo.nome],['QRA',excluindo.qra||'—']]}
      aoConfirmar={async()=>{await excluirMotorista(excluindo.id);carregar()}}
      aoFechar={()=>setExcluindo(null)}/>:null}
    {pedido?<ConfirmarAcao {...pedido} aoFechar={()=>setPedido(null)}/>:null}
  </div>
}
