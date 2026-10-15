import { useState, type FormEvent } from 'react'
import { AtivarAvisos, InstalarApp } from '../components/AtivarAvisos'
import { EntradaSenha } from '../components/EntradaSenha'
import { trocarSenha } from '../dados/sessao'
import { aplicarTema, temaAtual, type Tema } from '../tema'

/**
 * Configuracoes do socorrista (Kawa, 15/10/2026): o que ele ajusta sozinho, num
 * lugar so — instalar o app, ligar os avisos, a aparencia e a senha. Antes o
 * instalar e os avisos ficavam no Turno do dia, no meio do trabalho.
 */
export default function ConfiguracoesSocorristaPage() {
  const [tema, setTema] = useState<Tema>(temaAtual)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  function trocarTema(novo: Tema) { setTema(novo); aplicarTema(novo) }

  async function salvarSenha(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const formulario = evento.currentTarget
    const campos = new FormData(formulario)
    setErro('')
    setMensagem('')
    if (campos.get('novaSenha') !== campos.get('confirmacao')) {
      setErro('As duas senhas novas não são iguais. Digite de novo.')
      return
    }
    setSalvando(true)
    try {
      await trocarSenha(String(campos.get('senhaAtual')), String(campos.get('novaSenha')))
      formulario.reset()
      setMensagem('Senha alterada. Nos outros aparelhos, entre de novo com a senha nova.')
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return <div className="socorrista">
    <header className="socorrista-topo">
      <h1>Configurações</h1>
    </header>

    <section className="socorrista-cartao">
      <h2>App no celular</h2>
      <p className="socorrista-intro">Instalado, ele abre direto da tela inicial, como um app.</p>
      <InstalarApp />
    </section>

    <section className="socorrista-cartao">
      <h2>Avisos</h2>
      <p className="socorrista-intro">Receba no celular quando o administrador responder o seu turno ou a sua despesa.</p>
      <AtivarAvisos mostrarLigado />
    </section>

    <section className="socorrista-cartao">
      <h2>Aparência</h2>
      <div className="segmented tema-escolha" role="group" aria-label="Aparência">
        <button type="button" className={tema === 'claro' ? 'active' : ''} aria-pressed={tema === 'claro'}
          onClick={() => trocarTema('claro')}>Claro</button>
        <button type="button" className={tema === 'escuro' ? 'active' : ''} aria-pressed={tema === 'escuro'}
          onClick={() => trocarTema('escuro')}>Escuro</button>
      </div>
    </section>

    <form className="socorrista-cartao" onSubmit={e => void salvarSenha(e)}>
      <h2>Senha</h2>
      <div className="socorrista-campo">
        <label htmlFor="senha-atual">Senha atual</label>
        <EntradaSenha id="senha-atual" name="senhaAtual" autoComplete="current-password" required />
      </div>
      <div className="socorrista-campo">
        <label htmlFor="senha-nova">Senha nova</label>
        <EntradaSenha id="senha-nova" name="novaSenha" autoComplete="new-password" minLength={8} required />
        <p className="socorrista-apoio">Pelo menos 8 caracteres.</p>
      </div>
      <div className="socorrista-campo">
        <label htmlFor="senha-repetida">Repita a senha nova</label>
        <EntradaSenha id="senha-repetida" name="confirmacao" autoComplete="new-password" minLength={8} required />
      </div>
      {erro ? <p className="socorrista-alerta" role="alert">{erro}</p> : null}
      {mensagem ? <p className="socorrista-apoio servicos-lancado" role="status">{mensagem}</p> : null}
      <div className="socorrista-rodape-acao">
        <button type="submit" className="socorrista-acao" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Trocar senha'}
        </button>
      </div>
    </form>
  </div>
}
