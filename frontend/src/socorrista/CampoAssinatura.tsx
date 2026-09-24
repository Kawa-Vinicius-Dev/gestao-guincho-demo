import { useEffect, useRef, useState } from 'react'

/**
 * Assinatura com o dedo, na tela do celular. Devolve a imagem em PNG (fundo
 * branco) quando ha traco; vazio, devolve null. Sem biblioteca: pointer events
 * num canvas, com o tamanho real da tela para o traco nao sair borrado.
 */
export function CampoAssinatura({ aoMudar }: { aoMudar: (assinatura: Blob | null) => void }) {
  const tela = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)
  const [temTraco, setTemTraco] = useState(false)

  useEffect(() => {
    const c = tela.current
    if (!c) return
    const escala = window.devicePixelRatio || 1
    const { width, height } = c.getBoundingClientRect()
    c.width = Math.round(width * escala)
    c.height = Math.round(height * escala)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(escala, escala)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f2a44'
  }, [])

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function terminar() {
    if (!desenhando.current) return
    desenhando.current = false
    tela.current?.toBlob(b => aoMudar(b), 'image/png')
  }

  function limpar() {
    const c = tela.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const { width, height } = c.getBoundingClientRect()
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    setTemTraco(false)
    aoMudar(null)
  }

  return <div className="assinatura">
    <canvas ref={tela} className="assinatura-tela" aria-label="Assinatura do segurado"
      onPointerDown={e => {
        const ctx = tela.current?.getContext('2d'); if (!ctx) return
        e.currentTarget.setPointerCapture(e.pointerId)
        desenhando.current = true
        const { x, y } = ponto(e)
        ctx.beginPath(); ctx.moveTo(x, y)
      }}
      onPointerMove={e => {
        if (!desenhando.current) return
        const ctx = tela.current?.getContext('2d'); if (!ctx) return
        const { x, y } = ponto(e)
        ctx.lineTo(x, y); ctx.stroke()
        if (!temTraco) setTemTraco(true)
      }}
      onPointerUp={terminar} onPointerCancel={terminar} onPointerLeave={terminar} />
    <div className="assinatura-rodape">
      <span>{temTraco ? '✓ Assinado' : 'Peça para o segurado assinar aqui com o dedo'}</span>
      {temTraco ? <button type="button" className="checklist-mais assinatura-limpar" onClick={limpar}>Limpar</button> : null}
    </div>
  </div>
}
