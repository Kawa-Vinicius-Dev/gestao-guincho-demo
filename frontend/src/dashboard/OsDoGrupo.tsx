import { LinkOs, LinkViatura } from '../components/LinksDeDado'
import { valorDaOs, type LinhaOs } from '../dados/porto/listaOs'
import { data, moeda } from '../utils/formatadores'
import '../financeiro/dre/dre.css'

/** As OS de um socorrista, uma por linha, da mais antiga para a mais nova. */
export function OsDoGrupo({ oss }: { oss: LinhaOs[] }) {
  return <ol className="sem-valor-os">
    {[...oss].sort((a, b) => (a.dataAtendimento ?? '').localeCompare(b.dataAtendimento ?? '') || a.numero.localeCompare(b.numero))
      .map(os => <li key={os.id}>
        <LinkOs numero={os.numero}/>
        <span>{os.dataAtendimento ? data(os.dataAtendimento) : '—'}</span>
        <span>{os.especialidade || '—'} · <LinkViatura sigla={os.viatura}/></span>
        <span>{os.semValor ? 'Sem valor' : moeda(valorDaOs(os))}</span>
      </li>)}
  </ol>
}
