import { Link } from 'react-router-dom'
import type { LinhaOs } from '../dados/porto/listaOs'
import { numero } from '../utils/formatadores'
import { LinkSocorrista, LinkViatura } from './LinksDeDado'
import { nomesCurtos } from '../utils/nomes'
import './servicosPorGrupo.css'

/**
 * Quantos servicos cada viatura (ou socorrista) fez, e o total embaixo.
 *
 * Kawa, 23/09/2026: "quero sempre a soma total de servicos quando aparecer,
 * tanto em viatura, tanto em socorrista — L25 31, L168 54... e aparece o total
 * da soma dos servicos. Sempre assim, em qualquer tela que tenha servicos", no
 * mesmo padrao clicavel: o nome abre a viatura ou a ficha do socorrista. A OS
 * sem dono entra por ultimo, para a soma fechar com o total do periodo.
 */
export interface LinhaServicos { chave: string; rotulo: string; id?: number; quantidade: number; semDono?: boolean }

export function ServicosPorGrupo({ tipo, linhas, titulo }: {
  tipo: 'viatura' | 'socorrista'; linhas: LinhaServicos[]; titulo?: string
}) {
  const ordenadas = [...linhas].sort((a, b) =>
    Number(Boolean(a.semDono)) - Number(Boolean(b.semDono)) || b.quantidade - a.quantidade || a.rotulo.localeCompare(b.rotulo))
  const total = linhas.reduce((t, l) => t + l.quantidade, 0)
  const rotulo = (l: LinhaServicos) => l.semDono
    ? tipo === 'viatura'
      ? <Link className="link-dado" to="/porto/ordens-servico?semViatura=1" title="Abrir as OS sem viatura">{l.rotulo}</Link>
      : <span>{l.rotulo}</span>
    : tipo === 'viatura' ? <LinkViatura id={l.id} sigla={l.rotulo}/> : <LinkSocorrista id={l.id} nome={l.rotulo}/>

  return <div className="servicos-grupo">
    {titulo ? <h3>{titulo}</h3> : null}
    {!ordenadas.length ? <p className="empty-inline">Nenhum serviço neste período.</p>
      : <ul aria-label={titulo ?? (tipo === 'viatura' ? 'Serviços por viatura' : 'Serviços por socorrista')}>
        {ordenadas.map(l => <li key={l.chave} className={l.semDono ? 'sem-dono' : undefined}>
          <span className="servicos-grupo-nome">{rotulo(l)}</span>
          <strong>{numero(l.quantidade)}</strong>
        </li>)}
        <li className="servicos-grupo-total"><span>Total</span><strong>{numero(total)}</strong></li>
      </ul>}
  </div>
}

/** Conta as OS por viatura (pela sigla da Porto) ou por socorrista. */
export function contarServicos(oss: LinhaOs[], tipo: 'viatura' | 'socorrista'): LinhaServicos[] {
  const mapa = new Map<string, LinhaServicos>()
  for (const os of oss) {
    const nome = tipo === 'viatura' ? os.viatura?.toUpperCase() : os.motorista
    const chave = nome || '__sem'
    const linha = mapa.get(chave) ?? {
      chave, quantidade: 0,
      rotulo: nome || (tipo === 'viatura' ? 'Sem viatura' : 'Sem socorrista'),
      id: tipo === 'socorrista' ? os.motoristaId : undefined,
      semDono: !nome,
    }
    linha.quantidade += 1
    mapa.set(chave, linha)
  }
  // Socorrista pelo nome curto: primeiro nome, e o ultimo sobrenome se repetir.
  const curtos = nomesCurtos([...mapa.values()].filter(l => !l.semDono).map(l => l.rotulo))
  return [...mapa.values()].map(l => l.semDono || tipo !== 'socorrista' ? l : { ...l, rotulo: curtos.get(l.rotulo) ?? l.rotulo })
}
