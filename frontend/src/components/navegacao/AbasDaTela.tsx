import { Link, useLocation } from 'react-router-dom'
import { destinoDaAba, ondeEstou } from './grupos'
import './abas.css'

/**
 * Barra de abas no topo das telas de um grupo (Viaturas, Socorristas,
 * Servicos, OPs...). Cada aba e a tela que antes era um item proprio do menu.
 * Grupo de uma tela so, ou tela fora dos grupos, nao mostra barra.
 */
export function AbasDaTela() {
  const { pathname, search } = useLocation()
  const aqui = ondeEstou(pathname, search)
  if (!aqui || aqui.grupo.abas.length < 2) return null
  return <nav className="abas-da-tela" aria-label={`Seções de ${aqui.grupo.titulo}`}>
    {aqui.grupo.abas.map(aba => {
      const ativa = aba === aqui.aba
      return <Link key={destinoDaAba(aba)} to={destinoDaAba(aba)} className={ativa ? 'ativa' : undefined}
        aria-current={ativa ? 'page' : undefined}>{aba.rotulo}</Link>
    })}
  </nav>
}
