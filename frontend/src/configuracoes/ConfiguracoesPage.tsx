import { useEffect, useState, type FormEvent } from 'react'
import { EntradaSenha } from '../components/EntradaSenha'
import { useSessaoOpcional } from '../auth/AuthContext'
import { criarAcessoSocorrista, criarUsuario, encerrarAcesso, excluirAcesso, listarUsuarios, reativarAcesso, redefinirSenha } from '../dados/usuarios'
import { atualizarCategoria, definirCategoriaDoSocorrista, criarCategoria, excluirCategoria, listarCategorias } from '../dados/cadastros'
import { ConfirmarExclusao } from '../components/ConfirmarExclusao'
import { ConfirmarAcao, type PedidoConfirmacao } from '../components/ConfirmarAcao'
import { trocarSenha } from '../dados/sessao'
import { baixarCopiaDosDados } from '../dados/backup'
import { aplicarTema, temaAtual, type Tema } from '../tema'
import type { Categoria, Motorista, SenhaRedefinida, Usuario } from '../types/modelos'
import { ligarAcessoAoSocorrista, listarMotoristas } from '../dados/motoristas'
import { Carregando } from '../components/EstadoPagina'
import { Campo, Selecao } from '../components/Campos'
import { Modal } from '../components/Modal'
import { ComissaoPadrao } from './ComissaoPadrao'
import { DespesasFixas } from './DespesasFixas'

// A aba Cadastros saiu (Kawa, 23/09/2026): o contratante vem sozinho na
// importacao e nunca e editado aqui, e o custo por km ja fica na viatura.
type Aba='financeiro'|'acessos'|'sistema'
const ABAS:[Aba,string][]=[['financeiro','Financeiro'],['acessos','Acessos'],['sistema','Sistema']]

export default function ConfiguracoesPage(){
  const usuario = useSessaoOpcional()
  // A aba fica na URL (?aba=acessos): um link de outra tela abre direto nela.
  const [aba,setAba]=useState<Aba>(()=>{const a=new URLSearchParams(window.location.search).get('aba');return ABAS.some(([id])=>id===a)?a as Aba:'financeiro'})
  function trocarAba(nova:Aba){setAba(nova);window.history.replaceState(null,'',`${window.location.pathname}?aba=${nova}`)}
  const [categorias,setCategorias]=useState<Categoria[]>([]),[usuarios,setUsuarios]=useState<Usuario[]>([])
  // Socorristas do cadastro: para criar o acesso ja ligado a um deles, e para
  // ligar uma conta que nasceu solta.
  const [motoristas,setMotoristas]=useState<Motorista[]>([])
  const [perfilNovo,setPerfilNovo]=useState<Usuario['perfil']>('FUNCIONARIO')
  const [ligando,setLigando]=useState<Usuario|null>(null)
  const [tema,setTema]=useState<Tema>(temaAtual)
  const [pedido,setPedido]=useState<PedidoConfirmacao|null>(null)
  // Categoria aberta para editar ou excluir.
  const [editandoCadastro,setEditandoCadastro]=useState<{tipo:'categoria',item:Categoria}|null>(null)
  const [excluindoCadastro,setExcluindoCadastro]=useState<{tipo:'categoria',item:Categoria}|null>(null)
  function trocarTema(novo:Tema){setTema(novo);aplicarTema(novo)}
  const [mensagem,setMensagem]=useState(''),[erro,setErro]=useState(''),[gerada,setGerada]=useState<SenhaRedefinida|null>(null),[copiada,setCopiada]=useState(false),[baixando,setBaixando]=useState(false)
  const carregar=()=>Promise.all([listarCategorias(),listarUsuarios(),listarMotoristas().catch(()=>[] as Motorista[])])
    .then(([c,u,m])=>{setCategorias(c);setUsuarios(u);setMotoristas(m)}).catch(x=>setErro((x as Error).message))
  const [carregando,setCarregando]=useState(true)
  useEffect(()=>{void carregar().finally(()=>setCarregando(false))},[])
  async function cadastrar(e:FormEvent<HTMLFormElement>){e.preventDefault();const formulario=e.currentTarget;const f=new FormData(formulario)
    setErro('');setMensagem('')
    try{
      await criarCategoria(String(f.get('nome')),f.get('tipo') as 'RECEITA'|'DESPESA')
      formulario.reset();await carregar()
    }catch(x){setErro((x as Error).message)}
  }
  async function salvarCadastro(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!editandoCadastro)return;const f=new FormData(e.currentTarget)
    setErro('');setMensagem('')
    try{
      await atualizarCategoria(editandoCadastro.item.id,String(f.get('nome')))
      setEditandoCadastro(null);setMensagem('Cadastro atualizado.');await carregar()
    }catch(x){setErro((x as Error).message)}
  }
  // O dono nao escolhe senha por ninguem: o sistema sorteia uma provisoria, mostra
  // uma unica vez para ele repassar, e a pessoa troca no primeiro acesso.
  async function criarAcesso(e:FormEvent<HTMLFormElement>){e.preventDefault();const formulario=e.currentTarget;const f=new FormData(formulario)
    setErro('');setMensagem('');setCopiada(false)
    try{
      // Socorrista: a conta nasce ligada ao cadastro dele (e o nome vem de la).
      const criado=perfilNovo==='FUNCIONARIO'
        ?await criarAcessoSocorrista(Number(f.get('motoristaId')),String(f.get('email')),motoristas.find(m=>m.id===Number(f.get('motoristaId')))?.nome)
        :await criarUsuario(String(f.get('nome')),String(f.get('email')),'ADMINISTRADOR')
      formulario.reset();setGerada(criado);await carregar()
    }catch(x){setErro((x as Error).message)}
  }
  async function ligar(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!ligando)return
    const motoristaId=Number(new FormData(e.currentTarget).get('motoristaId'))
    const quem=motoristas.find(m=>m.id===motoristaId)
    setErro('');setMensagem('')
    try{await ligarAcessoAoSocorrista(motoristaId,String(ligando.id))
      setMensagem(`A conta ${ligando.email} agora é de ${quem?.nome??'o socorrista'}: ele passa a ver os próprios serviços, turnos e comissão.`)
      setLigando(null);await carregar()}
    catch(x){setErro((x as Error).message)}
  }
  // Encerrar nao apaga: o login e banido e o cadastro do socorrista se solta.
  // O historico dele continua, porque depende do motorista e nao do login.
  function pedirEncerramento(u:Usuario){
    setPedido({titulo:`Encerrar o acesso de ${u.nome}?`,
      efeito:<><strong>{u.nome}</strong> deixa de entrar no sistema para sempre, com senha nenhuma. O que ele lançou, as comissões e o histórico continuam. Se for socorrista, o cadastro dele fica e pode receber um acesso novo depois.</>,
      resumo:[['Usuário',u.nome],['E-mail',u.email]],
      textoConfirmar:'Encerrar acesso',perigo:true,
      aoConfirmar:async()=>{setErro('');setMensagem('')
        try{await encerrarAcesso(String(u.id));setMensagem(`O acesso de ${u.nome} foi encerrado.`);await carregar()}
        catch(x){setErro((x as Error).message)}}})
  }
  // Conta criada errada se apaga; conta que ja trabalhou, nao. O banco decide,
  // e a mensagem dele aponta o caminho quando recusa.
  function pedirExclusao(u:Usuario){
    setPedido({titulo:`Excluir o acesso de ${u.nome}?`,
      efeito:<>A conta de <strong>{u.nome}</strong> é apagada. Só dá certo se ela ainda não lançou nada no sistema — se já tiver histórico, o sistema recusa e explica, e aí o caminho é encerrar.</>,
      resumo:[['Usuário',u.nome],['E-mail',u.email]],
      textoConfirmar:'Excluir',perigo:true,
      aoConfirmar:async()=>{setErro('');setMensagem('')
        try{await excluirAcesso(String(u.id));setMensagem(`O acesso de ${u.nome} foi excluído.`);await carregar()}
        catch(x){setErro((x as Error).message)}}})
  }
  // Encerrar sem volta, num sistema com uma pessoa so administrando, e pegadinha.
  function pedirReativacao(u:Usuario){
    setPedido({titulo:`Reativar o acesso de ${u.nome}?`,
      efeito:<><strong>{u.nome}</strong> volta a entrar no sistema. Se não souber a senha, use Redefinir senha depois.</>,
      resumo:[['Usuário',u.nome],['E-mail',u.email]],
      textoConfirmar:'Reativar',
      aoConfirmar:async()=>{setErro('');setMensagem('')
        try{await reativarAcesso(String(u.id));setMensagem(`O acesso de ${u.nome} foi reativado.`);await carregar()}
        catch(x){setErro((x as Error).message)}}})
  }
  async function redefinir(usuario:Usuario){
    setErro('');setMensagem('');setCopiada(false)
    try{setGerada(await redefinirSenha(usuario));await carregar()}
    catch(x){setErro((x as Error).message)}
  }
  // o banco esta num plano sem backup automatico: esta copia e o que fica na mao do dono
  async function alternarSocorrista(c:Categoria){setErro('');setMensagem('')
    try{await definirCategoriaDoSocorrista(c.id,!c.socorristaPode)
      setMensagem(c.socorristaPode?`${c.nome} não aparece mais para o socorrista.`:`${c.nome} liberada para o socorrista.`)
      await carregar()}
    catch(x){setErro((x as Error).message)}}
  async function baixarCopia(){setErro('');setMensagem('');setBaixando(true)
    // a copia percorre o banco inteiro: sem sinal na tela, parece que o clique nao pegou
    try{await baixarCopiaDosDados();setMensagem('Cópia gerada. Guarde o arquivo fora do sistema.')}
    catch(x){setErro((x as Error).message)}
    finally{setBaixando(false)}
  }
  async function copiar(valor:string){try{await navigator.clipboard.writeText(valor);setCopiada(true)}catch{setCopiada(false)}}
  async function senha(e:FormEvent<HTMLFormElement>){e.preventDefault();const formulario=e.currentTarget;const f=new FormData(formulario)
    setErro('');setMensagem('')
    if(f.get('novaSenha')!==f.get('confirmacao')){setErro('A nova senha e a repetição não são iguais.');return}
    try{await trocarSenha(String(f.get('senhaAtual')),String(f.get('novaSenha')))
      formulario.reset();setMensagem('Senha alterada. Os acessos abertos em outros dispositivos foram encerrados.')}
    catch(x){setErro((x as Error).message)}
  }
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Base financeira</span><h1>Configurações</h1><p>Comissão, despesas fixas e categorias; acessos; sua senha e o sistema.</p></div></header>
    {erro?<div className="form-alert">{erro}</div>:null}{carregando?<Carregando/>:null}{mensagem?<div className="success-notice">{mensagem}</div>:null}
      {/* Abas: cada assunto no seu lugar, em vez de uma parede de cartoes. */}
      <nav className="config-abas" role="tablist" aria-label="Seções das configurações">
        {ABAS.map(([id,rotulo])=><button key={id} type="button" role="tab" aria-selected={aba===id}
          className={aba===id?'ativa':undefined} onClick={()=>trocarAba(id)}>{rotulo}</button>)}
      </nav>
      {aba==='financeiro'?<div className="settings-grid">
      <ComissaoPadrao/>
      <DespesasFixas/>
      {/* Categorias em tabela (Kawa, 23/09/2026: "ta muito esquisito"): nome, tipo,
          se o socorrista pode usar e as acoes, tudo na mesma linha. */}
      <section className="panel settings-card settings-wide"><header><h2>Categorias</h2><p>Classifique para entender para onde o dinheiro vai. Marque as que o <strong>socorrista pode usar</strong> ao lançar uma despesa: as outras nem aparecem para ele.</p></header>
        <form onSubmit={cadastrar} className="inline-form form-nova-linha">
          <Campo rotulo="Nova categoria"><input name="nome" required autoCapitalize="words" autoComplete="off" placeholder="Ex.: Pedágio"/></Campo>
          <Selecao rotulo="Tipo" name="tipo" opcoes={[{valor:'DESPESA',texto:'Despesa'},{valor:'RECEITA',texto:'Receita'}]}/>
          <button className="button button-primary">Adicionar categoria</button></form>
        <div className="table-scroll"><table className="tabela-config" aria-label="Categorias">
          <thead><tr><th>Categoria</th><th>Tipo</th><th>Socorrista pode lançar</th><th className="col-acoes"/></tr></thead>
          <tbody>{categorias.map(c=><tr key={c.id}>
            <td><strong>{c.nome}</strong></td>
            <td><span className={`etiqueta-tipo ${c.tipo==='RECEITA'?'tipo-receita':'tipo-despesa'}`}>{c.tipo==='RECEITA'?'Receita':'Despesa'}</span></td>
            <td>{c.tipo==='DESPESA'?<label className="categoria-socorrista"><input type="checkbox" checked={Boolean(c.socorristaPode)} onChange={()=>void alternarSocorrista(c)}/><span>{c.socorristaPode?'Sim':'Não'}</span></label>:<small className="texto-apoio">Só o administrador</small>}</td>
            <td className="col-acoes"><button className="table-action" onClick={()=>setEditandoCadastro({tipo:'categoria',item:c})}>Editar</button><button className="table-action table-action-danger" onClick={()=>setExcluindoCadastro({tipo:'categoria',item:c})}>Excluir</button></td>
          </tr>)}</tbody>
        </table></div></section>
      </div>:null}
      {aba==='acessos'?<div className="settings-grid">
      <section className="panel settings-card settings-wide"><header><h2>Acessos</h2><p>Quem entra no sistema. Crie uma conta nova, ou redefina a senha de quem esqueceu e passe a provisória para a pessoa.</p></header>
        <div className="table-scroll"><table className="tabela-config" aria-label="Acessos">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th className="col-acoes"/></tr></thead>
          <tbody>{usuarios.map(u=><tr key={u.id}>
            <td><strong>{u.nome}</strong></td>
            <td className="col-email" title={u.email}>{u.email}</td>
            <td>{u.perfil==='ADMINISTRADOR'?'Administrador':'Socorrista'}</td>
            <td>{!u.ativo?<span className="etiqueta-situacao situacao-encerrado">Encerrado</span>:u.perfil==='FUNCIONARIO'&&!motoristas.some(m=>m.usuarioId===String(u.id))?<span className="etiqueta-situacao situacao-pendente" title="A pessoa entra, mas não vê os próprios serviços e comissão">Sem cadastro ligado</span>:u.senhaProvisoria?<span className="etiqueta-situacao situacao-pendente">Senha provisória</span>:<span className="etiqueta-situacao situacao-ativo">Ativo</span>}</td>
            <td className="col-acoes">{u.ativo&&u.perfil==='FUNCIONARIO'&&!motoristas.some(m=>m.usuarioId===String(u.id))?<button className="table-action" onClick={()=>setLigando(u)}>Ligar ao socorrista</button>:null}<button className="table-action" onClick={()=>setPedido({titulo:'Redefinir senha?',efeito:<>A senha atual de <strong>{u.nome}</strong> para de funcionar na hora. O sistema gera uma senha provisória para você repassar, e a pessoa troca no primeiro acesso.</>,resumo:[['Usuário',u.nome],['E-mail',u.email]],textoConfirmar:'Redefinir senha',perigo:true,aoConfirmar:()=>redefinir(u)})}>Redefinir senha</button>{u.ativo?<button className="table-action table-action-danger" onClick={()=>pedirEncerramento(u)}>Encerrar acesso</button>:<button className="table-action" onClick={()=>pedirReativacao(u)}>Reativar acesso</button>}<button className="table-action table-action-danger" onClick={()=>pedirExclusao(u)}>Excluir</button></td>
          </tr>)}</tbody>
        </table></div>
        <h3 className="subtitulo-config">Novo acesso</h3>
        {/* Acesso de socorrista em um passo (Kawa, 23/09/2026): escolhe quem e da o
            e-mail; a conta ja nasce ligada ao cadastro dele. */}
        <form onSubmit={criarAcesso} className="inline-form form-novo-acesso">
          <Selecao rotulo="Perfil" name="perfil" value={perfilNovo} onChange={e=>setPerfilNovo(e.target.value as Usuario['perfil'])}
            opcoes={[{valor:'FUNCIONARIO',texto:'Socorrista'},{valor:'ADMINISTRADOR',texto:'Administrador'}]}/>
          {perfilNovo==='FUNCIONARIO'
            ?<Selecao rotulo="Socorrista" name="motoristaId" required vazio={motoristas.filter(m=>m.ativo&&!m.usuarioId).length?'Selecione':'Todos já têm acesso'}
                opcoes={motoristas.filter(m=>m.ativo&&!m.usuarioId).map(m=>({valor:m.id,texto:m.nome}))}/>
            :<Campo rotulo="Nome"><input name="nome" required autoCapitalize="words" autoComplete="off"/></Campo>}
          <Campo rotulo="E-mail de acesso"><input name="email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} required/></Campo>
          <button className="button button-primary">Criar acesso</button></form>
        <p className="empty-inline">Socorrista: escolha a pessoa do cadastro e informe o e-mail. A conta já nasce ligada a ela, e ela vê só os próprios serviços, turnos e comissão. Administrador vê e mexe em tudo: financeiro, Porto, equipe e os acessos das outras pessoas.</p></section>
      </div>:null}
      {aba==='sistema'?<div className="settings-grid">
      {/* A senha de quem esta usando o sistema agora. Ficava ao lado da lista de
          acessos e parecia trocar a senha de outra pessoa (Kawa, 23/09/2026:
          "trocar senha ta muito ambiguo"). A de outra pessoa e "Redefinir senha". */}
      <section className="panel settings-card"><header><h2>Minha senha</h2><p>Troca a senha <strong>da sua conta</strong>{usuario?<> ({usuario.nome} · {usuario.email})</>:null}. Para a senha de outra pessoa, use <em>Redefinir senha</em> em Acessos.</p></header>
        <form onSubmit={senha} className="form-grid">
          <label className="field"><span>Sua senha atual</span><EntradaSenha name="senhaAtual" autoComplete="current-password" required/></label>
          <label className="field"><span>Nova senha</span><EntradaSenha name="novaSenha" autoComplete="new-password" minLength={8} required/><small className="texto-apoio">Pelo menos 8 caracteres.</small></label>
          <label className="field"><span>Repita a nova senha</span><EntradaSenha name="confirmacao" autoComplete="new-password" minLength={8} required/></label>
          <button className="button button-primary">Trocar minha senha</button></form></section>
      <section className="panel settings-card"><header><h2>Aparência</h2><p>Vale só neste computador e neste navegador.</p></header><div className="segmented tema-escolha" role="group" aria-label="Tema visual"><button className={tema==='claro'?'active':''} aria-pressed={tema==='claro'} onClick={()=>trocarTema('claro')}>Claro</button><button className={tema==='escuro'?'active':''} aria-pressed={tema==='escuro'} onClick={()=>trocarTema('escuro')}>Escuro</button></div><p className="empty-inline">O sistema não segue o tema do computador: a cor só muda quando você escolhe aqui.</p></section>
      <section className="panel settings-card"><header><h2>Cópia dos dados</h2><p>O banco não tem backup automático. Baixe de tempos em tempos e guarde fora do sistema.</p></header>
        <p className="empty-inline">Um arquivo do Excel com ordens de pagamento, ordens de serviço, receitas, despesas, contas a receber, socorristas, veículos, quilometragem, calendário e despesas fixas.</p>
        <button className="button button-primary" disabled={baixando} onClick={()=>void baixarCopia()}>{baixando?'Preparando cópia…':'Baixar cópia de tudo'}</button></section>
      </div>:null}
    {ligando?<Modal etiqueta={ligando.email} titulo="Ligar a conta ao socorrista" aoFechar={()=>setLigando(null)}>
      <form onSubmit={ligar} className="form-grid">
        <p>A conta <strong>{ligando.email}</strong> entra no sistema, mas não está ligada a nenhum socorrista do cadastro, então a pessoa não vê os próprios serviços, turnos e comissão. Escolha de quem ela é.</p>
        <Selecao rotulo="Socorrista" name="motoristaId" required vazio="Selecione"
          defaultValue={motoristas.find(m=>m.ativo&&!m.usuarioId&&m.nome.toUpperCase()===ligando.nome.toUpperCase())?.id??''}
          opcoes={motoristas.filter(m=>m.ativo&&!m.usuarioId).map(m=>({valor:m.id,texto:m.nome}))}/>
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={()=>setLigando(null)}>Cancelar</button><button className="button button-primary">Ligar conta</button></div>
      </form>
    </Modal>:null}
    {gerada?<Modal etiqueta={gerada.nome} titulo="Senha provisória" aoFechar={()=>setGerada(null)}>
      <p>Passe esta senha para {gerada.nome}. Ela aparece <strong>uma única vez</strong> e só serve para o próximo acesso: o sistema vai obrigar a troca antes de liberar qualquer tela.</p>
      <p className="senha-provisoria"><code>{gerada.email}</code></p>
      <p className="senha-provisoria"><code>{gerada.senhaProvisoria}</code></p>
      {copiada?<div className="success-notice">Senha copiada.</div>:null}
      <div className="modal-actions"><button className="button button-ghost" onClick={()=>void copiar(gerada.senhaProvisoria)}>Copiar</button><button className="button button-primary" onClick={()=>setGerada(null)}>Já anotei</button></div>
    </Modal>:null}
    {editandoCadastro?<Modal etiqueta="Cadastro" titulo="Editar categoria" aoFechar={()=>setEditandoCadastro(null)}>
      <form onSubmit={salvarCadastro} className="form-grid">
        <Campo rotulo="Nome"><input name="nome" defaultValue={editandoCadastro.item.nome} required autoCapitalize="words" autoComplete="off"/></Campo>
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={()=>setEditandoCadastro(null)}>Cancelar</button><button className="button button-primary">Salvar alterações</button></div>
      </form>
    </Modal>:null}
    {excluindoCadastro?<ConfirmarExclusao coisa={excluindoCadastro.tipo} nome={excluindoCadastro.item.nome}
      aviso="A categoria sai da lista. Se já tiver lançamento nela, o sistema não deixa excluir."
      resumo={[['Nome',excluindoCadastro.item.nome]]}
      aoConfirmar={async()=>{await excluirCategoria(excluindoCadastro.item.id);setMensagem('Categoria excluída.');await carregar()}}
      aoFechar={()=>setExcluindoCadastro(null)}/>:null}
    {pedido?<ConfirmarAcao {...pedido} aoFechar={()=>setPedido(null)}/>:null}
  </div>
}
