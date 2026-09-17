import { useState, type InputHTMLAttributes } from 'react'
import { Campo } from './Campos'

/**
 * Campos com mascara e teclado certo.
 *
 * Todo campo numerico tem de abrir o teclado numerico do celular — quem lanca
 * quilometragem no patio nao pode caçar numero num teclado de letras. E todo
 * campo com formato (documento, telefone) formata enquanto se digita, para a
 * pessoa nao ter de lembrar onde vai ponto, barra ou hifen.
 *
 * O que vai para o backend e sempre o valor cru: so digito, sem pontuacao.
 */

const digitos = (valor: string) => valor.replace(/\D/g, '')

/**
 * 12345678000190 -> 12.345.678/0001-90; 12345678901 -> 123.456.789-01.
 *
 * Com `aceitaRg`, so ganha pontuacao o que tem o tamanho exato de CPF (11) ou
 * CNPJ (14): RG nao tem tamanho fixo e aparecia como um CPF pela metade.
 */
export function formatarDocumento(valor: string, aceitaRg = false) {
  const d = digitos(valor).slice(0, 14)
  if (aceitaRg && d.length !== 11 && d.length !== 14) return d
  if (d.length <= 11) {
    return d.replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/** 8599998888 -> (85) 9999-8888; 85999998888 -> (85) 99999-8888 */
export function formatarTelefone(valor: string) {
  const d = digitos(valor).slice(0, 11)
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  }
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

type MascaraProps = {
  /** Documento de pessoa: aceita RG alem de CPF e CNPJ. */
  aceitaRg?: boolean
  rotulo: string
  name: string
  className?: string
  ajuda?: string
  required?: boolean
  defaultValue?: string | null
  placeholder?: string
}

/**
 * Documento com mascara e um campo oculto com os digitos crus.
 *
 * A tela mostra 12.345.678/0001-90; o backend recebe 12345678000190. Guardar o
 * formatado faria o mesmo documento existir de duas formas no banco.
 */
export function CampoDocumento({ rotulo, name, className, ajuda, required, defaultValue, placeholder, aceitaRg }: MascaraProps) {
  const [texto, setTexto] = useState(formatarDocumento(defaultValue ?? '', aceitaRg))
  return <Campo rotulo={rotulo} className={className} ajuda={ajuda}>
    <input
      type="text" inputMode="numeric" required={required}
      placeholder={placeholder ?? (aceitaRg ? 'CPF, CNPJ ou RG' : 'CNPJ ou CPF')}
      value={texto}
      onChange={evento => setTexto(formatarDocumento(evento.target.value, aceitaRg))}/>
    <input type="hidden" name={name} value={digitos(texto)}/>
  </Campo>
}

export function CampoTelefone({ rotulo, name, className, ajuda, required, defaultValue, placeholder }: MascaraProps) {
  const [texto, setTexto] = useState(formatarTelefone(defaultValue ?? ''))
  return <Campo rotulo={rotulo} className={className} ajuda={ajuda}>
    <input
      type="text" inputMode="tel" required={required}
      placeholder={placeholder ?? '(00) 00000-0000'}
      value={texto}
      onChange={evento => {
        const novo = formatarTelefone(evento.target.value)
        setTexto(novo)
        // Sem DDD o numero nao serve para ligar: 10 digitos (fixo) ou 11 (celular).
        const quantos = digitos(novo).length
        evento.target.setCustomValidity(quantos === 0 || quantos >= 10 ? '' : 'Informe o telefone com DDD: (00) 00000-0000.')
      }}/>
    <input type="hidden" name={name} value={digitos(texto)}/>
  </Campo>
}

/**
 * Placa sempre em maiuscula, sem espaco.
 *
 * A Porto escreve a placa em maiuscula; quem digita em minuscula criava um
 * segundo veiculo para o mesmo carro.
 */
export function CampoPlaca({ rotulo, name, className, ajuda, required, defaultValue }: MascaraProps) {
  const [texto, setTexto] = useState((defaultValue ?? '').toUpperCase())
  return <Campo rotulo={rotulo} className={className} ajuda={ajuda}>
    <input
      name={name} type="text" required={required} placeholder="AAA0A00"
      // Placa antiga (AAA0000) ou Mercosul (AAA0A00): sempre 7 caracteres.
      pattern="[A-Z]{3}[0-9][A-Z0-9][0-9]{2}" title="Placa com 7 caracteres: AAA0000 ou AAA0A00."
      autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={7}
      value={texto}
      onChange={evento => setTexto(evento.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}/>
  </Campo>
}

type NumeroProps = MascaraProps & {
  /** Casas decimais aceitas. 0 abre o teclado de inteiros. */
  decimais?: number
  min?: number
  max?: number
  step?: string
}

/**
 * Numero sem pontuacao de moeda: hodometro, quilometragem, dia do mes.
 *
 * O ganho sobre o <input type="number"> cru e o teclado: `numeric` abre o
 * teclado de digitos no celular, `decimal` abre com a virgula. Sem isso o
 * Android abre o teclado de letras em alguns campos.
 */
export function CampoNumero(
  { rotulo, name, className, ajuda, required, defaultValue, placeholder,
    decimais = 2, min, max, step }: NumeroProps,
) {
  const atributos: InputHTMLAttributes<HTMLInputElement> = {
    inputMode: decimais > 0 ? 'decimal' : 'numeric',
    step: step ?? (decimais > 0 ? '0.01' : '1'),
  }
  return <Campo rotulo={rotulo} className={className} ajuda={ajuda}>
    <input
      name={name} type="number" required={required}
      defaultValue={defaultValue ?? undefined} placeholder={placeholder}
      min={min} max={max} {...atributos}/>
  </Campo>
}
