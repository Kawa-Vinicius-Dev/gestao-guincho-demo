import { useEffect, useRef, useState } from 'react'
import { Campo } from './Campos'

/**
 * Campo de dinheiro com mascara.
 *
 * Antes era <input type="number">: para lancar mil quatrocentos e oitenta reais e
 * noventa centavos a pessoa digitava "1480.90" — com ponto, porque o type=number
 * do navegador nao aceita a virgula que ela usa no dia a dia, e no celular ainda
 * tinha de achar o ponto no teclado. Quem errava o separador mandava outro valor.
 *
 * Aqui so entram digitos, e eles entram pela direita: 1 vira 0,01, 148 vira 1,48,
 * 148090 vira 1.480,90. Nao ha ponto, virgula, seta de incremento nem formato a
 * decorar — e o teclado do celular abre no numerico. O que vai para o backend
 * continua sendo numero cru, num campo oculto.
 */

/** Digitos crus -> centavos. "148090" -> 148090 centavos. */
export function centavosDe(digitos: string) {
  const limpo = digitos.replace(/\D/g, '').slice(0, 13)
  return limpo ? Number(limpo) : 0
}

/** Centavos -> texto na tela. 148090 -> "1.480,90". */
export function formatarCentavos(centavos: number) {
  return (centavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

/** Centavos -> o que o backend recebe. 148090 -> "1480.90". */
export function valorEnviado(centavos: number) {
  return (centavos / 100).toFixed(2)
}

type Props = {
  rotulo: string
  name: string
  className?: string
  ajuda?: string
  required?: boolean
  /** Valor inicial em reais, como vem do backend (1480.9). */
  defaultValue?: number | string
  /** Bloqueia o envio de zero. Ligado por padrao: despesa de R$ 0,00 e engano. */
  exigirPositivo?: boolean
}

const porCursorNoFim = (evento: { target: EventTarget | null }) => {
  const alvo = evento.target
  if (alvo instanceof HTMLInputElement) alvo.setSelectionRange(alvo.value.length, alvo.value.length)
}

export function CampoValor({ rotulo, name, className, ajuda, required, defaultValue, exigirPositivo = true }: Props) {
  const inicial = Math.round(Number(defaultValue ?? 0) * 100) || 0
  const [centavos, setCentavos] = useState(inicial)
  const [tocado, setTocado] = useState(inicial > 0)
  const campo = useRef<HTMLInputElement>(null)

  // Zero passaria pelo required do HTML, que so olha se o campo esta vazio.
  useEffect(() => {
    if (!campo.current) return
    const invalido = required && exigirPositivo && centavos === 0
    campo.current.setCustomValidity(invalido ? 'Informe um valor maior que zero.' : '')
  }, [centavos, required, exigirPositivo])

  /**
   * O cursor volta ao fim a cada digito. A mascara reformata o texto — "1.480,90"
   * tem dois caracteres a mais que "148090" —, e o navegador mantem o cursor no
   * indice antigo. Sem isto, digitar 1-4-8-0-9-0 seguido produzia "480.001,90":
   * do terceiro digito em diante cada um entrava no meio do numero.
   */
  useEffect(() => {
    const alvo = campo.current
    if (!alvo || document.activeElement !== alvo) return
    const fim = alvo.value.length
    alvo.setSelectionRange(fim, fim)
  }, [centavos])

  return <Campo rotulo={rotulo} className={className} ajuda={ajuda}>
    {/* O "R$" e desenhado pelo CSS, nao por um elemento: dentro do <label> ele
        entraria no nome acessivel do campo, que viraria "Valor R$". */}
    <span className="campo-valor">
      <input
        ref={campo}
        type="text"
        // decimal abre o teclado numerico do celular ja com a virgula,
        // sem a pessoa procurar por ela.
        inputMode="decimal"
        required={required}
        value={tocado ? formatarCentavos(centavos) : ''}
        placeholder="0,00"
        onChange={evento => {
          setTocado(true)
          setCentavos(centavosDe(evento.target.value))
        }}
        onFocus={porCursorNoFim}
        onClick={porCursorNoFim}/>
    </span>
    <input type="hidden" name={name} value={tocado ? valorEnviado(centavos) : ''}/>
  </Campo>
}
