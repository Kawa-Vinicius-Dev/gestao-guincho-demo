import { useEffect, useState } from 'react'
import { ativarAvisos, avisosAtivos, avisosSuportados } from '../dados/avisos'
import { instalar, jaInstalado, ouvirInstalacao, podeInstalar } from '../dados/instalacao'

const noIphone = /iphone|ipad|ipod/i.test(navigator.userAgent)
const noAndroid = /android/i.test(navigator.userAgent)

/**
 * "Instalar o app" (Kawa, 15/10/2026): nao ha loja, o app e o site na tela
 * inicial. No Android o botao abre a janela de instalacao do Chrome; no iPhone,
 * que nao deixa instalar por botao, vira o passo a passo. Instalado, some.
 */
function InstalarApp() {
  const [, atualizar] = useState(0)
  const [instalado, setInstalado] = useState(jaInstalado)
  useEffect(() => ouvirInstalacao(() => { atualizar(n => n + 1); setInstalado(jaInstalado()) }), [])

  if (instalado) return null
  if (podeInstalar()) {
    return <div className="avisos-ativar">
      <button type="button" className="button button-ghost"
        onClick={() => { void instalar().then(aceitou => { if (aceitou) setInstalado(true) }) }}>
        Instalar o app no celular
      </button>
    </div>
  }
  if (noIphone) {
    return <p className="avisos-ativar-dica">
      Instale o app para abrir mais rápido e receber avisos: toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
    </p>
  }
  if (noAndroid) {
    return <p className="avisos-ativar-dica">
      Para instalar o app, abra pelo <strong>Chrome</strong>, toque em <strong>⋮</strong> e depois em <strong>Instalar app</strong>.
    </p>
  }
  return null
}

/**
 * "Ativar avisos neste celular". Some depois de ativado: o aparelho continua
 * recebendo sem precisar lembrar. No iPhone, aviso so funciona com o app na
 * tela inicial, e o botao vira a instrucao de como instalar.
 */
export function AtivarAvisos() {
  const [estado, setEstado] = useState<'carregando' | 'desligado' | 'ligado' | 'recem-ligado'>('carregando')
  const [erro, setErro] = useState('')
  const suportado = avisosSuportados()
  useEffect(() => {
    if (suportado) avisosAtivos().then(ativo => setEstado(ativo ? 'ligado' : 'desligado')).catch(() => setEstado('desligado'))
  }, [suportado])

  // No iPhone sem o app instalado, aviso nao funciona: o passo a passo de
  // instalar (em InstalarApp) ja diz isso.
  if (!suportado) return <InstalarApp />
  if (estado === 'recem-ligado') return <><InstalarApp /><p className="avisos-ativar-dica" role="status">Avisos ligados neste celular.</p></>
  if (estado !== 'desligado') return <InstalarApp />

  return <><InstalarApp /><div className="avisos-ativar">
    <button type="button" className="button button-ghost"
      onClick={() => { setErro(''); ativarAvisos().then(() => setEstado('recem-ligado')).catch(x => setErro((x as Error).message)) }}>
      Ativar avisos neste celular
    </button>
    {erro ? <p className="form-alert" role="alert">{erro}</p> : null}
  </div></>
}
