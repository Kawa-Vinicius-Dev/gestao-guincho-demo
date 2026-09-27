import { useEffect, useState } from 'react'
import { ativarAvisos, avisosAtivos, avisosSuportados } from '../dados/avisos'

const noIphone = /iphone|ipad|ipod/i.test(navigator.userAgent)

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

  if (!suportado) {
    return noIphone
      ? <p className="avisos-ativar-dica">Para receber avisos no iPhone, instale o app: toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</p>
      : null
  }
  if (estado === 'recem-ligado') return <p className="avisos-ativar-dica" role="status">Avisos ligados neste celular.</p>
  if (estado !== 'desligado') return null

  return <div className="avisos-ativar">
    <button type="button" className="button button-ghost"
      onClick={() => { setErro(''); ativarAvisos().then(() => setEstado('recem-ligado')).catch(x => setErro((x as Error).message)) }}>
      Ativar avisos neste celular
    </button>
    {erro ? <p className="form-alert" role="alert">{erro}</p> : null}
  </div>
}
