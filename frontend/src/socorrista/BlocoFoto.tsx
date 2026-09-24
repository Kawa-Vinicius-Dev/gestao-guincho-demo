import { useEffect, useRef, useState } from 'react'

/** Um bloco de foto: toque abre a camera; pronto, mostra a miniatura com ✓. */
export function BlocoFoto({ id, rotulo, arquivo, aoEscolher }: {
  id: string; rotulo: string; arquivo: File | null | undefined; aoEscolher: (f: File) => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [previa, setPrevia] = useState('')
  useEffect(() => {
    if (!arquivo) { setPrevia(''); return }
    const url = URL.createObjectURL(arquivo)
    setPrevia(url)
    return () => URL.revokeObjectURL(url)
  }, [arquivo])

  return <>
    <input ref={entrada} id={id} type="file" accept="image/*" capture="environment"
      className="socorrista-arquivo" aria-label={rotulo}
      onChange={e => { const f = e.target.files?.[0]; if (f) aoEscolher(f); e.target.value = '' }} />
    <button type="button" className={`checklist-bloco${previa ? ' esta-pronto' : ''}`}
      onClick={() => entrada.current?.click()}>
      {previa ? <img src={previa} alt="" /> : <span className="checklist-camera" aria-hidden="true">📷</span>}
      <span className="checklist-rotulo">{previa ? '✓ ' : ''}{rotulo}</span>
    </button>
  </>
}
