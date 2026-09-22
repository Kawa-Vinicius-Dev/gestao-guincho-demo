import { useEffect, useState, type FormEvent } from 'react'
import { criarUsuario, listarUsuarios, redefinirSenha } from '../dados/usuarios'
import { atualizarCategoria, atualizarContratante, criarCategoria, criarContratante, excluirCategoria, excluirContratante, listarCategorias, listarContratantes } from '../dados/cadastros'
import { ConfirmarExclusao } from '../components/ConfirmarExclusao'
import { ConfirmarAcao, type PedidoConfirmacao } from '../components/ConfirmarAcao'
import { trocarSenha } from '../dados/sessao'
import { baixarCopiaDosDados } from '../dados/backup'
import { aplicarTema, temaAtual, type Tema } from '../tema'
import type { Categoria, Contratante, SenhaRedefinida, Usuario } from '../types/modelos'
import { Carregando } from '../components/EstadoPagina'
import { CampoDocumento } from '../components/CamposMascarados'
import { Campo, Selecao } from '../components/Campos'
import { Modal } from '../components/Modal'

export default function ConfiguracoesPage(){
  const [categorias,setCategorias]=useState<Categoria[]>([]),[contratantes,setContratantes]=useState<Contratante[]>([]),[usuarios,setUsuarios]=useState<Usuario[]>([])
  const [tema,setTema]=useState<Tema>(temaAtual)
  const [pedido,setPedido]=useState<PedidoConfirmacao|null>(null)
  // Categoria ou contratante aberto para editar ou excluir.
  const [editandoCadastro,setEditandoCadastro]=useState<{tipo:'categoria',item:Categoria}|{tipo:'contratante',item:Contratante}|null>(null)
  const [excluindoCadastro,setExcluindoCadastro]=useState<{tipo:'categoria',item:Categoria}|{tipo:'contratante',item:Contratante}|null>(null)
  function trocarTema(novo:Tema){setTema(novo);aplicarTema(novo)}
  const [mensagem,setMensagem]=useState(''),[erro,setErro]=useState(''),[gerada,setGerada]=useState<SenhaRedefinida|null>(null),[copiada,setCopiada]=useState(false),[baixando,setBaixando]=useState(false)
  const carregar=()=>Promise.all([listarCategorias(),listarContratantes(),listarUsuarios()])
    .then(([c,o,u])=>{setCategorias(c);setContratantes(o);setUsuarios(u)}).catch(x=>setErro((x as Error).message))
  const [carregando,setCarregando]=useState(true)
  useEffect(()=>{void carregar().finally(()=>setCarregando(false))},[])
  async function cadastrar(e:FormEvent<HTMLFormElement>,alvo:'categorias'|'contratantes'){e.preventDefault();const formulario=e.currentTarget;const f=new FormData(formulario)
    const body=alvo==='categorias'?{nome:f.get('nome'),tipo:f.get('tipo')}:{nome:f.get('nome'),documento:f.get('documento')||null}
    setErro('');setMensagem('')
    try{
      if(alvo==='categorias')await criarCategoria(String(body.nome),body.tipo as 'RECEITA'|'DESPESA')
      else await criarContratante(String(body.nome),body.documento as string|null)
      formulario.reset();await carregar()
    }catch(x){setErro((x as Error).message)}
  }
  async function salvarCadastro(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!editandoCadastro)return;const f=new FormData(e.currentTarget)
    setErro('');setMensagem('')
    try{
      if(editandoCadastro.tipo==='categoria')await atualizarCategoria(editandoCadastro.item.id,String(f.get('nome')))
      else await atualizarContratante(editandoCadastro.item.id,String(f.get('nome')),String(f.get('documento')||'')||null)
      setEditandoCadastro(null);setMensagem('Cadastro atualizado.');await carregar()
    }catch(x){setErro((x as Error).message)}
  }
  // O dono nao escolhe senha por ninguem: o sistema sorteia uma provisoria, mostra
  // uma unica vez para ele repassar, e a pessoa troca no primeiro acesso.
  async function criarAcesso(e:FormEvent<HTMLFormElement>){e.preventDefault();const formulario=e.currentTarget;const f=new FormData(formulario)
    setErro('');setMensagem('');setCopiada(false)
    try{
      const criado=await criarUsuario(String(f.get('nome')),String(f.get('email')),f.get('perfil') as Usuario['perfil'])
      formulario.reset();setGerada(criado);await carregar()
    }catch(x){setErro((x as Error).message)}
  }
  async function redefinir(usuario:Usuario){
    setErro('');setMensagem('');setCopiada(false)
    try{setGerada(await redefinirSenha(usuario));await carregar()}
    catch(x){setErro((x as Error).message)}
  }
  // o banco esta num plano sem backup automatico: esta copia e o que fica na mao do dono
  async function baixarCopia(){setErro('');setMensagem('');setBaixando(true)
    // a copia percorre o banco inteiro: sem sinal na tela, parece que o clique nao pegou
    try{await baixarCopiaDosDados();setMensagem('Cópia gerada. Guarde o arquivo fora do sistema.')}
    catch(x){setErro((x as Error).message)}
    finally{setBaixando(false)}
  }
  async function copiar(valor:string){try{await navigator.clipboard.writeText(valor);setCopiada(true)}catch{setCopiada(false)}}
  async function senha(e:FormEvent<HTMLFormElement>){e.preventDefault();const formulario=e.currentTarget;const f=new FormData(formulario)
    setErro('');setMensagem('')
    try{await trocarSenha(String(f.get('senhaAtual')),String(f.get('novaSenha')))
      formulario.reset();setMensagem('Senha alterada. Os acessos abertos em outros dispositivos foram encerrados.')}
    catch(x){setErro((x as Error).message)}
  }
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Base financeira</span><h1>Configurações</h1><p>Contratantes, categorias e segurança da conta.</p></div></header>
    {erro?<div className="form-alert">{erro}</div>:null}{carregando?<Carregando/>:null}{mensagem?<div className="success-notice">{mensagem}</div>:null}<div className="settings-grid">
      <section className="panel settings-card"><header><h2>Aparência</h2><p>Vale só neste computador e neste navegador.</p></header><div className="segmented tema-escolha" role="group" aria-label="Tema visual"><button className={tema==='claro'?'active':''} aria-pressed={tema==='claro'} onClick={()=>trocarTema('claro')}>Claro</button><button className={tema==='escuro'?'active':''} aria-pressed={tema==='escuro'} onClick={()=>trocarTema('escuro')}>Escuro</button></div><p className="empty-inline">O sistema não segue o tema do computador: a cor só muda quando você escolhe aqui.</p></section>
      <section className="panel settings-card"><header><h2>Contratantes</h2><p>Porto Seguro e demais clientes pagadores.</p></header><ul className="simple-list">{contratantes.map(c=><li key={c.id}><strong>{c.nome}</strong><small>{c.documento||'Sem documento'}</small><span className="acoes-da-linha"><button className="table-action" onClick={()=>setEditandoCadastro({tipo:'contratante',item:c})}>Editar</button><button className="table-action table-action-danger" onClick={()=>setExcluindoCadastro({tipo:'contratante',item:c})}>Excluir</button></span></li>)}</ul>
        <form onSubmit={e=>cadastrar(e,'contratantes')} className="inline-form">
          <Campo rotulo="Nome do contratante"><input name="nome" required autoCapitalize="words" autoComplete="off"/></Campo>
          <CampoDocumento rotulo="CNPJ ou CPF" name="documento"/>
          <button className="button button-ghost">Adicionar</button></form></section>
      <section className="panel settings-card"><header><h2>Categorias</h2><p>Classifique para entender para onde o dinheiro vai.</p></header><ul className="simple-list">{categorias.map(c=><li key={c.id}><strong>{c.nome}</strong><small>{c.tipo==='RECEITA'?'Receita':'Despesa'}</small><span className="acoes-da-linha"><button className="table-action" onClick={()=>setEditandoCadastro({tipo:'categoria',item:c})}>Editar</button><button className="table-action table-action-danger" onClick={()=>setExcluindoCadastro({tipo:'categoria',item:c})}>Excluir</button></span></li>)}</ul>
        <form onSubmit={e=>cadastrar(e,'categorias')} className="inline-form">
          <Campo rotulo="Nome da categoria"><input name="nome" required autoCapitalize="words" autoComplete="off"/></Campo>
          <Selecao rotulo="Tipo da categoria" name="tipo" opcoes={[{valor:'DESPESA',texto:'Despesa'},{valor:'RECEITA',texto:'Receita'}]}/>
          <button className="button button-ghost">Adicionar</button></form></section>
      <section className="panel settings-card"><header><h2>Trocar senha</h2><p>A nova senha deve ter pelo menos oito caracteres.</p></header><form onSubmit={senha} className="form-grid"><label className="field"><span>Senha atual</span><input name="senhaAtual" type="password" autoComplete="current-password" required/></label><label className="field"><span>Nova senha</span><input name="novaSenha" type="password" autoComplete="new-password" minLength={8} required/></label><button className="button button-primary">Alterar senha</button></form></section>
      <section className="panel settings-card"><header><h2>Acessos</h2><p>Quem entra no sistema. Crie uma conta nova, ou redefina a senha de quem esqueceu e passe a provisória para a pessoa.</p></header><ul className="simple-list">{usuarios.map(u=><li key={u.id}><strong>{u.nome}</strong><small>{u.email} · {u.perfil==='ADMINISTRADOR'?'Administrador':'Socorrista'}{u.senhaProvisoria?' · senha provisória pendente':''}</small><button className="table-action" onClick={()=>setPedido({titulo:'Redefinir senha?',efeito:<>A senha atual de <strong>{u.nome}</strong> para de funcionar na hora. O sistema gera uma senha provisória para você repassar, e a pessoa troca no primeiro acesso.</>,resumo:[['Usuário',u.nome],['E-mail',u.email]],textoConfirmar:'Redefinir senha',perigo:true,aoConfirmar:()=>redefinir(u)})}>Redefinir senha</button></li>)}</ul>
        <form onSubmit={criarAcesso} className="inline-form">
          <Campo rotulo="Nome"><input name="nome" required autoCapitalize="words" autoComplete="off"/></Campo>
          <Campo rotulo="E-mail de acesso"><input name="email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} required/></Campo>
          <Selecao rotulo="Perfil" name="perfil" opcoes={[{valor:'FUNCIONARIO',texto:'Socorrista'},{valor:'ADMINISTRADOR',texto:'Administrador'}]}/>
          <button className="button button-ghost">Criar acesso</button></form>
        <p className="empty-inline">Administrador vê e mexe em tudo: financeiro, Porto, equipe e os acessos das outras pessoas. Socorrista só registra as próprias despesas e vê a comissão dele. Para dar acesso a um socorrista já cadastrado, use o botão na tela de Socorristas — lá a conta já nasce ligada ao cadastro dele.</p></section>
      <section className="panel settings-card"><header><h2>Cópia dos dados</h2><p>O banco não tem backup automático. Baixe de tempos em tempos e guarde fora do sistema.</p></header>
        <p className="empty-inline">Um arquivo do Excel com ordens de pagamento, ordens de serviço, receitas, despesas, contas a receber, socorristas, veículos, quilometragem, calendário e despesas fixas.</p>
        <button className="button button-primary" disabled={baixando} onClick={()=>void baixarCopia()}>{baixando?'Preparando cópia…':'Baixar cópia de tudo'}</button></section>
      <section className="panel settings-card"><header><h2>Custos da frota</h2><p>O custo por km é configurado em cada veículo e aplicado ao km morto no momento do registro.</p></header><a className="button button-ghost" href="/veiculos">Configurar veículos</a></section>
    </div>
    {gerada?<Modal etiqueta={gerada.nome} titulo="Senha provisória" aoFechar={()=>setGerada(null)}>
      <p>Passe esta senha para {gerada.nome}. Ela aparece <strong>uma única vez</strong> e só serve para o próximo acesso: o sistema vai obrigar a troca antes de liberar qualquer tela.</p>
      <p className="senha-provisoria"><code>{gerada.email}</code></p>
      <p className="senha-provisoria"><code>{gerada.senhaProvisoria}</code></p>
      {copiada?<div className="success-notice">Senha copiada.</div>:null}
      <div className="modal-actions"><button className="button button-ghost" onClick={()=>void copiar(gerada.senhaProvisoria)}>Copiar</button><button className="button button-primary" onClick={()=>setGerada(null)}>Já anotei</button></div>
    </Modal>:null}
    {editandoCadastro?<Modal etiqueta="Cadastro" titulo={editandoCadastro.tipo==='categoria'?'Editar categoria':'Editar contratante'} aoFechar={()=>setEditandoCadastro(null)}>
      <form onSubmit={salvarCadastro} className="form-grid">
        <Campo rotulo="Nome"><input name="nome" defaultValue={editandoCadastro.item.nome} required autoCapitalize="words" autoComplete="off"/></Campo>
        {editandoCadastro.tipo==='contratante'?<CampoDocumento rotulo="CNPJ ou CPF" name="documento" defaultValue={editandoCadastro.item.documento}/>:null}
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={()=>setEditandoCadastro(null)}>Cancelar</button><button className="button button-primary">Salvar alterações</button></div>
      </form>
    </Modal>:null}
    {excluindoCadastro?<ConfirmarExclusao coisa={excluindoCadastro.tipo} nome={excluindoCadastro.item.nome}
      aviso={excluindoCadastro.tipo==='categoria'?'A categoria sai da lista. Se já tiver lançamento nela, o sistema não deixa excluir.':'O contratante sai da lista. Se já tiver receita ligada, o sistema não deixa excluir.'}
      resumo={[['Nome',excluindoCadastro.item.nome]]}
      aoConfirmar={async()=>{if(excluindoCadastro.tipo==='categoria')await excluirCategoria(excluindoCadastro.item.id);else await excluirContratante(excluindoCadastro.item.id);setMensagem('Cadastro excluído.');await carregar()}}
      aoFechar={()=>setExcluindoCadastro(null)}/>:null}
    {pedido?<ConfirmarAcao {...pedido} aoFechar={()=>setPedido(null)}/>:null}
  </div>
}
