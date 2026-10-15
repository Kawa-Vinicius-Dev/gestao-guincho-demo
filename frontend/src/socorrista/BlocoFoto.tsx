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

/** Foto do odometro: abre a camera e mostra a miniatura para conferir o numero. */
export function BotaoFoto({
  id, rotulo, arquivo, aoEscolher, obrigatoria,
}: {
  id: string; rotulo: string; arquivo: File | null
  aoEscolher: (f: File | null) => void; obrigatoria?: boolean
}) {
  const entrada = useRef<HTMLInputElement>(null)
  // A miniatura existe para ele conferir, ali mesmo, se o odometro saiu legivel:
  // descobrir que a foto ficou tremida so quando o administrador devolve o turno
  // custa uma volta inteira.
  const [previa, setPrevia] = useState('')
  useEffect(() => {
    if (!arquivo) { setPrevia(''); return }
    const url = URL.createObjectURL(arquivo)
    setPrevia(url)
    return () => URL.revokeObjectURL(url)
  }, [arquivo])

  return <div className="socorrista-campo">
    <label htmlFor={id}>
      {rotulo} {obrigatoria ? <em className="socorrista-exigido">obrigatória</em> : <span>opcional</span>}
    </label>
    <input
      ref={entrada} id={id} type="file" accept="image/*"
      // `capture` abre a camera direto, em vez da galeria: a foto e do painel
      // agora, nao de um arquivo antigo do celular.
      capture="environment"
      className="socorrista-arquivo"
      onChange={e => aoEscolher(e.target.files?.[0] ?? null)}
    />
    {previa
      ? <div className="socorrista-foto-pronta">
          <img src={previa} alt="Foto do painel que será enviada"/>
          <div>
            <strong>Foto pronta</strong>
            <span>Confira se a quilometragem aparece na foto.</span>
            <button type="button" className="socorrista-trocar-foto" onClick={() => entrada.current?.click()}>
              Tirar outra
            </button>
          </div>
        </div>
      : <button type="button" className="socorrista-botao-foto" onClick={() => entrada.current?.click()}>
          Tirar foto do painel
        </button>}
  </div>
}
