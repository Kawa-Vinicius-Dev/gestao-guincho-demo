import { useEffect, useState } from 'react'
import { LinkOs, LinkSocorrista, LinkViatura } from '../../components/LinksDeDado'
import { Carregando } from '../../components/EstadoPagina'
import { Modal } from '../../components/Modal'
import { listarTodasAsOs, type PaginaOs } from '../../dados/porto/listaOs'
import { data, moeda } from '../../utils/formatadores'
import { ETIQUETAS_SITUACAO } from '../situacaoOs'

/**
 * As OS de um dia do calendario do Diario Operacional.
 *
 * Kawa, 22/09/2026: "conseguir clicar no calendario e mostrar as OS daquele
 * dia". Mesma fonte da tela de Ordens de servico (porto_listar_os), recortada
 * pela data do atendimento.
 */
export function OsDoDia({ dia, aoFechar }: { dia: string; aoFechar: () => void }) {
  const [pagina, setPagina] = useState<PaginaOs | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    listarTodasAsOs({ inicio: dia, fim: dia }).then(setPagina).catch((e: Error) => setErro(e.message))
  }, [dia])

  return <Modal etiqueta="Diário" titulo={`OS de ${data(dia)}`} largo fecharAoClicarFora aoFechar={aoFechar}>
    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
    {!pagina && !erro ? <Carregando/> : null}
    {pagina ? <>
      <p className="saida-texto">
        <strong>{pagina.total}</strong> {pagina.total === 1 ? 'serviço' : 'serviços'} neste dia
        {pagina.semValor ? `, ${pagina.semValor} ainda sem valor` : ''}.
      </p>
      {pagina.itens.length
        ? <div className="table-scroll"><table>
          <thead><tr><th>OS</th><th>Especialidade</th><th>Socorrista</th><th>Viatura</th><th>Situação</th><th>Valor</th></tr></thead>
          <tbody>{pagina.itens.map(os => <tr key={os.id}>
            <td><strong><LinkOs numero={os.numero}/></strong></td>
            <td>{os.especialidade || '—'}</td>
            <td>{os.motorista ? <LinkSocorrista id={os.motoristaId} nome={os.motorista}/> : os.socorristaNoArquivo || '—'}</td>
            <td><LinkViatura sigla={os.viatura} chip/></td>
            <td><span className={`vehicle-status ${ETIQUETAS_SITUACAO[os.situacao].classe}`}>{ETIQUETAS_SITUACAO[os.situacao].texto}</span></td>
            <td>{os.valorPrevisto ? moeda(os.valorPrevisto) : <span className="commission-waiting">Sem valor</span>}</td>
          </tr>)}</tbody>
        </table></div>
        : <p className="empty-inline">Nenhuma OS registrada neste dia.</p>}
      <div className="modal-actions">
        <button type="button" className="button button-primary" onClick={aoFechar}>Fechar</button>
      </div>
    </> : null}
  </Modal>
}
