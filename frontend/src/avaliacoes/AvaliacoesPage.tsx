import { useCallback, useEffect, useState } from 'react'
import { Carregando, ErroPagina, Vazio } from '../components/EstadoPagina'
import { Etiqueta, GradeIndicadores, Indicador } from '../components/ui/Pagina'
import { listarAvaliacoes, type Avaliacao } from '../dados/avaliacoes'
import { dataHora } from '../utils/formatadores'

/**
 * O que os clientes acharam do atendimento (03/11/2026). O link de /avaliar
 * fica aqui para o dono mandar por WhatsApp depois do servico.
 */

const estrelas = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

export default function AvaliacoesPage() {
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[] | null>(null)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)
  const link = `${window.location.origin}/avaliar`

  const carregar = useCallback(() => {
    setErro(''); setAvaliacoes(null)
    listarAvaliacoes().then(setAvaliacoes).catch(e => setErro((e as Error).message))
  }, [])
  useEffect(carregar, [carregar])

  async function copiar() {
    try { await navigator.clipboard.writeText(link); setCopiado(true) } catch { setCopiado(false) }
  }

  const lista = avaliacoes ?? []
  const media = lista.length ? lista.reduce((t, a) => t + a.nota, 0) / lista.length : 0
  const ruins = lista.filter(a => a.nota <= 2).length

  return <div className="page-enter">
    <header className="page-heading"><div>
      <span className="eyebrow">Visão geral</span>
      <h1>Avaliações</h1>
      <p>Mande o link para o cliente depois do serviço: <strong className="avaliar-link">{link}</strong></p>
    </div>
      <div className="heading-actions">
        <button type="button" className="button button-primary" onClick={copiar}>{copiado ? 'Link copiado' : 'Copiar link'}</button>
      </div>
    </header>

    {erro ? <ErroPagina mensagem={erro} tentarNovamente={carregar}/>
      : !avaliacoes ? <Carregando/>
      : <>
          <GradeIndicadores>
            <Indicador rotulo="Média" valor={lista.length ? media.toFixed(1).replace('.', ',') : '—'} apoio="de 5 estrelas"/>
            <Indicador rotulo="Avaliações" valor={lista.length}/>
            <Indicador rotulo="Notas 1 ou 2" valor={ruins} tom={ruins ? 'alerta' : 'neutro'}/>
          </GradeIndicadores>

          {lista.length
            ? <section className="panel"><div className="table-scroll"><table>
                <thead><tr><th>Quando</th><th>Nota</th><th>Cliente</th><th>Placa</th><th>Comentário</th></tr></thead>
                <tbody>{lista.map(a => <tr key={a.id}>
                  <td>{dataHora(a.criadoEm)}</td>
                  <td><Etiqueta tom={a.nota >= 4 ? 'ok' : a.nota === 3 ? 'neutro' : 'alerta'}>{estrelas(a.nota)}</Etiqueta></td>
                  <td>{a.nome ?? '—'}</td>
                  <td>{a.placa ?? '—'}</td>
                  <td>{a.comentario ?? '—'}</td>
                </tr>)}</tbody>
              </table></div></section>
            : <Vazio titulo="Nenhuma avaliação ainda" descricao="Copie o link acima e mande para o cliente depois do próximo serviço."/>}
        </>}
  </div>
}
