import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Carregando, ErroPagina, Vazio } from '../components/EstadoPagina'
import { Etiqueta, GradeIndicadores, Indicador } from '../components/ui/Pagina'
import {
  criarEmpresa, criarGestor, definirEmpresaAtiva, listarEmpresas, listarUsuariosDaEmpresa,
  redefinirSenhaDoGestor, type EmpresaDaPlataforma, type UsuarioDaPlataforma,
} from '../dados/plataforma'
import type { SenhaRedefinida } from '../types/modelos'
import { dataHora } from '../utils/formatadores'
import './plataforma.css'

/**
 * Painel da ANAIV (multiempresa, 14/11/2026): as empresas que usam o sistema,
 * quantas pessoas cada uma tem, e as tres acoes do desenvolvedor — cadastrar
 * uma empresa com o primeiro gestor, bloquear e reativar.
 *
 * Nao mostra dado de operacao de ninguem. A equipe de cada empresa quem monta
 * e o gestor dela, em Equipe.
 */

const quando = (valor: string | null) => valor ? dataHora(valor) : 'Nunca entrou'

export default function PlataformaPage() {
  const { usuario, logout } = useAuth()
  const [empresas, setEmpresas] = useState<EmpresaDaPlataforma[] | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [gerada, setGerada] = useState<SenhaRedefinida | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)

  const carregar = useCallback(() => {
    setErro('')
    listarEmpresas().then(setEmpresas).catch(e => setErro((e as Error).message))
  }, [])
  useEffect(carregar, [carregar])

  const lista = empresas ?? []
  const bloqueadas = lista.filter(e => !e.ativa).length
  const empresaAberta = lista.find(e => e.id === aberta) ?? null

  return <main className="plataforma page-enter">
    <header className="page-heading"><div>
      <span className="eyebrow">ANAIV · plataforma</span>
      <h1>Empresas</h1>
      <p>Quem usa o sistema, quantas pessoas cada empresa tem e o acesso de cada uma.</p>
    </div>
      <div className="heading-actions">
        <span className="plataforma-quem">{usuario?.email}</span>
        <button type="button" className="button button-ghost" onClick={() => void logout()}>Sair</button>
      </div>
    </header>

    {gerada ? <SenhaGerada gerada={gerada} fechar={() => setGerada(null)}/> : null}
    {aviso ? <div className="success-notice" role="status">{aviso}</div> : null}

    {erro ? <ErroPagina mensagem={erro} tentarNovamente={carregar}/>
      : !empresas ? <Carregando/>
      : <>
          <GradeIndicadores>
            <Indicador rotulo="Empresas" valor={lista.length} apoio={bloqueadas ? `${bloqueadas} bloqueada${bloqueadas > 1 ? 's' : ''}` : 'todas ativas'}
              tom={bloqueadas ? 'atencao' : 'neutro'}/>
            <Indicador rotulo="Usuários ativos" valor={lista.reduce((t, e) => t + e.usuariosAtivos, 0)} apoio="gestores e socorristas com acesso"/>
            <Indicador rotulo="Gestores" valor={lista.reduce((t, e) => t + e.gestores, 0)}/>
            <Indicador rotulo="Viaturas" valor={lista.reduce((t, e) => t + e.viaturas, 0)}/>
          </GradeIndicadores>

          <NovaEmpresa aoCriar={(senha, mensagem) => { setGerada(senha); setAviso(mensagem); carregar() }}/>

          <section className="panel">
            {lista.length
              ? <div className="table-scroll"><table>
                  <thead><tr>
                    <th>Empresa</th><th>Situação</th><th>Gestores</th><th>Usuários ativos</th>
                    <th>Socorristas</th><th>Viaturas</th><th>Último acesso</th><th>Desde</th><th aria-label="Ações"/>
                  </tr></thead>
                  <tbody>{lista.map(e => <LinhaEmpresa key={e.id} empresa={e} aberta={aberta === e.id}
                    alternar={() => setAberta(a => a === e.id ? null : e.id)}/>)}</tbody>
                </table></div>
              : <Vazio titulo="Nenhuma empresa cadastrada" descricao="Cadastre a primeira empresa acima."/>}
          </section>

          {/* Fora da tabela: no celular ela rola para o lado, e um formulario la dentro some. */}
          {empresaAberta ? <section className="panel" aria-label={`Gerenciar ${empresaAberta.nome}`}>
            <header className="plataforma-detalhe-titulo"><span className="eyebrow">Gerenciar</span><h2>{empresaAberta.nome}</h2></header>
            <DetalheEmpresa key={empresaAberta.id} empresa={empresaAberta}
              aoMudar={mensagem => { setAviso(mensagem); carregar() }} aoGerarSenha={setGerada}/>
          </section> : null}
        </>}
  </main>
}

/** A senha provisoria aparece uma vez so: nao fica guardada em lugar nenhum. */
function SenhaGerada({ gerada, fechar }: { gerada: SenhaRedefinida; fechar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try { await navigator.clipboard.writeText(gerada.senhaProvisoria); setCopiado(true) } catch { setCopiado(false) }
  }
  return <section className="panel plataforma-senha" role="status">
    <div>
      <span className="eyebrow">Senha provisória</span>
      <h2>{gerada.nome}</h2>
      <p>Repasse ao gestor. No primeiro acesso o sistema pede que ele escolha a própria senha. Ela não aparece de novo depois de fechar.</p>
      <p>{gerada.email}</p>
    </div>
    <code>{gerada.senhaProvisoria}</code>
    <div className="heading-actions">
      <button type="button" className="button button-ghost" onClick={() => void copiar()}>{copiado ? 'Copiada' : 'Copiar'}</button>
      <button type="button" className="button button-primary" onClick={fechar}>Já anotei</button>
    </div>
  </section>
}

function NovaEmpresa({ aoCriar }: { aoCriar: (senha: SenhaRedefinida | null, mensagem: string) => void }) {
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const formulario = evento.currentTarget
    const campos = new FormData(formulario)
    const nome = String(campos.get('empresa') ?? '').trim()
    const gestor = String(campos.get('gestor') ?? '').trim()
    const email = String(campos.get('email') ?? '').trim()
    setErro(''); setEnviando(true)
    try {
      const empresaId = await criarEmpresa(nome)
      // Dois passos: a empresa nasce no banco, o login do gestor na Edge Function.
      // Se o segundo falhar, a empresa fica na lista e o gestor entra por "Novo gestor".
      try {
        const senha = await criarGestor(empresaId, gestor, email)
        formulario.reset()
        aoCriar(senha, `${nome} cadastrada.`)
      } catch (e) {
        aoCriar(null, '')
        setErro(`${nome} foi criada, mas o gestor não: ${(e as Error).message} Use "Novo gestor" na linha da empresa.`)
      }
    } catch (e) { setErro((e as Error).message) }
    finally { setEnviando(false) }
  }

  return <section className="panel plataforma-nova">
    <form onSubmit={enviar}>
      <div><span className="eyebrow">Nova venda</span><h2>Cadastrar empresa</h2>
        <p>A empresa já nasce com as categorias básicas. O gestor recebe uma senha provisória e monta a própria equipe.</p></div>
      {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
      <div className="form-grid three-columns">
        <label className="field"><span>Nome da empresa</span><input name="empresa" required maxLength={80}/></label>
        <label className="field"><span>Nome do gestor</span><input name="gestor" required maxLength={80} autoComplete="off"/></label>
        <label className="field"><span>E-mail do gestor</span><input name="email" type="email" required autoComplete="off" autoCapitalize="none"/></label>
      </div>
      <button className="button button-primary" disabled={enviando}>{enviando ? 'Cadastrando…' : 'Cadastrar empresa'}</button>
    </form>
  </section>
}

function LinhaEmpresa({ empresa, aberta, alternar }: {
  empresa: EmpresaDaPlataforma
  aberta: boolean
  alternar: () => void
}) {
  return <>
    <tr className={empresa.ativa ? undefined : 'plataforma-bloqueada'}>
      <td><strong>{empresa.nome}</strong><small className="plataforma-codigo">{empresa.codigo}</small></td>
      <td>{empresa.ativa
        ? <Etiqueta tom="ok">Ativa</Etiqueta>
        : <span title={empresa.motivoBloqueio ?? undefined}><Etiqueta tom="alerta">Bloqueada</Etiqueta></span>}</td>
      <td>{empresa.gestores}</td>
      <td>{empresa.usuariosAtivos}{empresa.usuariosTotal > empresa.usuariosAtivos ? <small className="plataforma-codigo">de {empresa.usuariosTotal}</small> : null}</td>
      <td>{empresa.socorristas}</td>
      <td>{empresa.viaturas}</td>
      <td>{quando(empresa.ultimoAcesso)}</td>
      <td>{dataHora(empresa.criadoEm)}</td>
      <td><button type="button" className="button button-ghost" aria-expanded={aberta} onClick={alternar}>{aberta ? 'Fechar' : 'Gerenciar'}</button></td>
    </tr>
  </>
}

function DetalheEmpresa({ empresa, aoMudar, aoGerarSenha }: {
  empresa: EmpresaDaPlataforma
  aoMudar: (mensagem: string) => void
  aoGerarSenha: (senha: SenhaRedefinida) => void
}) {
  const [usuarios, setUsuarios] = useState<UsuarioDaPlataforma[] | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(() => {
    listarUsuariosDaEmpresa(empresa.id).then(setUsuarios).catch(e => setErro((e as Error).message))
  }, [empresa.id])
  useEffect(carregar, [carregar])

  async function executar(acao: () => Promise<void>) {
    setErro(''); setOcupado(true)
    try { await acao() } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }

  function bloquear(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const motivo = String(new FormData(evento.currentTarget).get('motivo') ?? '').trim()
    void executar(async () => {
      await definirEmpresaAtiva(empresa.id, false, motivo)
      aoMudar(`${empresa.nome} bloqueada: ninguém da empresa entra até ser reativada.`)
    })
  }

  function novoGestor(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const formulario = evento.currentTarget
    const campos = new FormData(formulario)
    void executar(async () => {
      const senha = await criarGestor(empresa.id, String(campos.get('gestor') ?? '').trim(), String(campos.get('email') ?? '').trim())
      formulario.reset(); aoGerarSenha(senha); carregar(); aoMudar('')
    })
  }

  return <div className="plataforma-gerenciar">
    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}

    {empresa.ativa
      ? <form className="plataforma-acao" onSubmit={bloquear}>
          <label className="field"><span>Bloquear o acesso da empresa (motivo, só você vê)</span>
            <input name="motivo" maxLength={200} placeholder="Ex.: mensalidade em atraso"/></label>
          <button className="button button-ghost" disabled={ocupado}>Bloquear empresa</button>
        </form>
      : <div className="plataforma-acao">
          <p>Bloqueada{empresa.bloqueadaEm ? ` em ${dataHora(empresa.bloqueadaEm)}` : ''}{empresa.motivoBloqueio ? `: ${empresa.motivoBloqueio}.` : '.'} Nada foi apagado.</p>
          <button type="button" className="button button-primary" disabled={ocupado}
            onClick={() => void executar(async () => { await definirEmpresaAtiva(empresa.id, true); aoMudar(`${empresa.nome} reativada.`) })}>Reativar empresa</button>
        </div>}

    <form className="plataforma-acao" onSubmit={novoGestor}>
      <label className="field"><span>Novo gestor: nome</span><input name="gestor" required maxLength={80} autoComplete="off"/></label>
      <label className="field"><span>E-mail</span><input name="email" type="email" required autoComplete="off" autoCapitalize="none"/></label>
      <button className="button button-ghost" disabled={ocupado}>Criar gestor</button>
    </form>

    {!usuarios ? <Carregando/>
      : usuarios.length
        ? <div className="table-scroll"><table>
            <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th aria-label="Ações"/></tr></thead>
            <tbody>{usuarios.map(u => <tr key={u.id}>
              <td>{u.nome}</td>
              <td>{u.email}</td>
              <td>{u.perfil === 'ADMINISTRADOR' ? 'Gestor' : 'Socorrista'}</td>
              <td>{!u.ativo ? <Etiqueta tom="neutro">Encerrado</Etiqueta>
                : u.senhaProvisoria ? <Etiqueta tom="atencao">Senha provisória</Etiqueta>
                : <Etiqueta tom="ok">Ativo</Etiqueta>}</td>
              <td>{quando(u.ultimoAcesso)}</td>
              <td>{u.perfil === 'ADMINISTRADOR' && u.ativo
                ? <button type="button" className="button button-ghost" disabled={ocupado}
                    onClick={() => void executar(async () => { aoGerarSenha(await redefinirSenhaDoGestor(u.id)); carregar() })}>Redefinir senha</button>
                : null}</td>
            </tr>)}</tbody>
          </table></div>
        : <p className="inline-empty">Esta empresa ainda não tem ninguém com acesso. Crie o primeiro gestor acima.</p>}
  </div>
}
