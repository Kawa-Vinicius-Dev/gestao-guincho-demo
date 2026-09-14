import { useEffect, useState } from 'react'

/**
 * Segura um valor que muda rapido e so o entrega quando a mao para.
 *
 * O campo de busca das Contas a receber estava ligado direto na dependencia do
 * efeito que chama a API: digitar "Porto" disparava cinco requisicoes, uma por
 * tecla, e as quatro primeiras eram canceladas no meio. Agora sai uma.
 */
export function useValorAdiado<T>(valor: T, espera = 300) {
  const [adiado, setAdiado] = useState(valor)
  useEffect(() => {
    const relogio = setTimeout(() => setAdiado(valor), espera)
    return () => clearTimeout(relogio)
  }, [valor, espera])
  return adiado
}
