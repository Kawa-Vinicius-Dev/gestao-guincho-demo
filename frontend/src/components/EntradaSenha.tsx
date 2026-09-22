import { useState, type InputHTMLAttributes } from 'react'

/**
 * Campo de senha com o olho para ver o que se digitou.
 *
 * Kawa, 22/09/2026: "olhinho pra ver quando esta digitando a senha". A senha
 * provisoria e ditada por telefone e digitada no celular, onde errar uma letra
 * sem ver e o normal.
 *
 * O botao e type="button" para nao enviar o formulario, e diz em voz alta o que
 * faz (mostrar ou esconder), que e o que um leitor de tela precisa ouvir.
 */
export function EntradaSenha(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visivel, setVisivel] = useState(false)
  return <span className="entrada-senha">
    <input {...props} type={visivel ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false}/>
    <button type="button" className="entrada-senha-olho" onClick={() => setVisivel(v => !v)}
      aria-label={visivel ? 'Esconder a senha' : 'Mostrar a senha'} aria-pressed={visivel}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/>
        <circle cx="12" cy="12" r="3"/>
        {visivel ? <path d="M4 4l16 16"/> : null}
      </svg>
    </button>
  </span>
}
