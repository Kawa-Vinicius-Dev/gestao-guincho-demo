import { useCallback, useEffect, useRef, useState } from 'react'
import { aoMudar, listarFila, processarFila, usuarioDaFila, type ItemDaFila } from '../dados/filaOffline'

/**
 * A fila de envio do socorrista, vista pela tela: o que esta esperando e o gatilho
 * para enviar. Tenta quando a tela abre, quando o celular avisa que voltou o sinal
 * e a cada 20 s enquanto houver algo esperando. `aoEnviar` roda quando algo saiu
 * da fila, para a tela recarregar o que veio do banco.
 */
export function useFilaOffline(aoEnviar?: () => void) {
  const [usuarioId, setUsuarioId] = useState<string | null>(null)
  const [itens, setItens] = useState<ItemDaFila[]>([])
  const [enviando, setEnviando] = useState(false)
  const callback = useRef(aoEnviar)
  useEffect(() => { callback.current = aoEnviar }, [aoEnviar])

  useEffect(() => { void usuarioDaFila().then(setUsuarioId) }, [])

  const atualizar = useCallback(async () => {
    if (!usuarioId) return
    setItens(await listarFila(usuarioId).catch(() => []))
  }, [usuarioId])

  const enviar = useCallback(async () => {
    if (!usuarioId) return
    setEnviando(true)
    try {
      const enviados = await processarFila(usuarioId).catch(() => 0)
      await atualizar()
      if (enviados > 0) callback.current?.()
    } finally {
      setEnviando(false)
    }
  }, [usuarioId, atualizar])

  useEffect(() => {
    void atualizar()
    return aoMudar(() => void atualizar())
  }, [atualizar])

  const temItens = itens.length > 0
  useEffect(() => {
    if (!usuarioId) return
    void enviar()
    const voltou = () => void enviar()
    window.addEventListener('online', voltou)
    const relogio = temItens
      ? window.setInterval(() => { if (navigator.onLine !== false) void enviar() }, 20_000)
      : undefined
    return () => {
      window.removeEventListener('online', voltou)
      if (relogio) window.clearInterval(relogio)
    }
  }, [usuarioId, temItens, enviar])

  return { usuarioId, itens, enviando, enviar }
}
