import { useEffect, useState } from 'react'
import { ativarAvisos, avisosAtivos, avisosSuportados } from '../dados/avisos'
import { instalar, jaInstalado, ouvirInstalacao, podeInstalar } from '../dados/instalacao'

const noIphone = /iphone|ipad|ipod/i.test(navigator.userAgent)
const noAndroid = /android/i.test(navigator.userAgent)

/**
 * "Ativar avisos neste celular". Some depois de ativado: o aparelho continua
 * recebendo sem precisar lembrar. No iPhone, aviso so funciona com o app na
 * tela inicial, e o botao vira a instrucao de como instalar.
 *
 * `mostrarLigado`: na tela de Configuracoes do socorrista o estado fica a vista
 * ("Avisos ligados"), em vez de sumir.
 */
export function AtivarAvisos({ mostrarLigado = false }: { mostrarLigado?: boolean }) {
  const [estado, setEstado] = useState<'carregando' | 'desligado' | 'ligado' | 'recem-ligado'>('carregando')
  const [erro, setErro] = useState('')
  const suportado = avisosSuportados()
  useEffect(() => {
    if (suportado) avisosAtivos().then(ativo => setEstado(ativo ? 'ligado' : 'desligado')).catch(() => setEstado('desligado'))
  }, [suportado])

  if (!suportado) {
    return noIphone
      ? <p className="avisos-ativar-dica">Para receber avisos no iPhone, instale o app: toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</p>
      : mostrarLigado ? <p className="avisos-ativar-dica">Este navegador não recebe avisos. Abra o sistema pelo <strong>Chrome</strong> para ligar.</p> : null
  }
  if (estado === 'recem-ligado' || (mostrarLigado && estado === 'ligado')) {
    return <p className="avisos-ativar-dica" role="status">✓ Avisos ligados neste celular.</p>
  }
  if (estado !== 'desligado') return null

  return <div className="avisos-ativar">
    <button type="button" className="button button-ghost"
      onClick={() => { setErro(''); ativarAvisos().then(() => setEstado('recem-ligado')).catch(x => setErro((x as Error).message)) }}>
      Ativar avisos neste celular
    </button>
    {erro ? <p className="form-alert" role="alert">{erro}</p> : null}
  </div>
}

/**
 * Instalar o app (Kawa, 15/10/2026): nao ha loja, o app e o site na tela
 * inicial. No Android o botao abre a janela de instalacao do Chrome; no iPhone,
 * que nao deixa instalar por botao, vira o passo a passo.
 */
export function InstalarApp() {
  const [, atualizar] = useState(0)
  const [instalado, setInstalado] = useState(jaInstalado)
  useEffect(() => ouvirInstalacao(() => { atualizar(n => n + 1); setInstalado(jaInstalado()) }), [])

  if (instalado) return <p className="avisos-ativar-dica" role="status">✓ Você está usando o app instalado.</p>
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
      No Safari, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
    </p>
  }
  if (noAndroid) {
    return <p className="avisos-ativar-dica">
      Abra este endereço no <strong>Chrome</strong>, toque em <strong>⋮</strong> e depois em <strong>Instalar app</strong>.
    </p>
  }
  return <p className="avisos-ativar-dica">Abra este endereço no celular para instalar o app.</p>
}
