import { Selecao } from '../../components/Campos'
import { Modal } from '../../components/Modal'
import type { Motorista, OrdemServicoPorto } from '../../types/modelos'
import { moeda } from '../../utils/formatadores'

type Props = {
  ordem: OrdemServicoPorto
  motoristas: Motorista[]
  motoristaId: number
  aoTrocar: (id: number) => void
  aoConfirmar: () => void
  aoFechar: () => void
  salvando: boolean
}

export function ModalAssociarSocorrista({ ordem, motoristas, motoristaId, aoTrocar, aoConfirmar, aoFechar, salvando }: Props) {
  const entra = motoristaId ? motoristas.find(m => m.id === motoristaId)?.nome ?? '' : ''

  return <Modal etiqueta={ordem.numero} titulo="Associar socorrista" aoFechar={aoFechar}>
    <p>
      Confirme quem atendeu. A escolha manual é preservada nas próximas importações —
      o relatório financeiro não a sobrescreve.
    </p>

    {ordem.sugestaoAmbigua
      ? <div className="form-alert" role="alert">
          O nome que a Porto enviou (<strong>{ordem.socorrista}</strong>) serve para mais de um
          socorrista cadastrado. A tela da Porto corta o nome em 20 caracteres, então pai e filho
          ficam idênticos aqui — só quem acompanhou a operação sabe quem foi.
        </div>
      : ordem.sugestaoMotorista
        ? <p className="empty-inline">
            A Porto enviou “{ordem.socorrista}”, que corresponde a{' '}
            <strong>{ordem.sugestaoMotorista}</strong>. Confirme ou troque.
          </p>
        : null}

    <Selecao rotulo="Socorrista responsável" required vazio="Selecione" value={motoristaId || ''}
      onChange={evento => aoTrocar(Number(evento.target.value))}
      opcoes={motoristas.filter(m => m.ativo).map(m => ({
        valor: m.id, texto: `${m.nome}${m.qra ? ` · ${m.qra}` : ''}`,
      }))}/>

    {entra ? <ImpactoDaTroca ordem={ordem} entra={entra}/> : null}

    <div className="modal-actions">
      <button className="button button-ghost" onClick={aoFechar}>Cancelar</button>
      <button className="button button-primary" disabled={!motoristaId || salvando} onClick={aoConfirmar}>
        {salvando ? 'Confirmando…' : 'Confirmar associação'}
      </button>
    </div>
  </Modal>
}

/** Quanto muda de mao na troca: e dinheiro de comissao, e a conferencia e visual. */
function ImpactoDaTroca({ ordem, entra }: { ordem: OrdemServicoPorto; entra: string }) {
  return <div className="fleet-summary">
    <div>
      <span>Serviço</span><strong>{moeda(ordem.valorTotal)}</strong>
      <small>{ordem.valorTotal > 0 ? 'Valor da OS' : 'Valor só entra quando a Porto pagar'}</small>
    </div>
    <div>
      <span>Comissão em jogo</span><strong>{moeda(ordem.valorTotal * 0.2)}</strong>
      <small>20% do serviço</small>
    </div>
    <div>
      <span>Sai de</span><strong>{ordem.motorista || '—'}</strong>
      <small>{ordem.motorista ? 'Perde esta comissão' : 'Ninguém vinculado hoje'}</small>
    </div>
    <div>
      <span>Entra para</span><strong>{entra}</strong><small>Passa a receber</small>
    </div>
  </div>
}
