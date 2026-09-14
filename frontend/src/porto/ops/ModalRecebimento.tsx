import type { FormEvent } from 'react'
import { Campo, Selecao } from '../../components/Campos'
import { AcoesModal, Modal } from '../../components/Modal'
import type { CalendarioPorto, OrdemPagamentoPorto } from '../../types/modelos'
import { hojeIso } from '../../utils/formatadores'
import { data } from './opcoes'
import { CampoValor } from '../../components/CampoValor'

type Props = {
  ordem: OrdemPagamentoPorto
  periodos: CalendarioPorto[]
  periodo: number
  aoTrocarPeriodo: (periodo: number) => void
  aoEnviar: (evento: FormEvent<HTMLFormElement>) => void
  aoFechar: () => void
}

export function ModalRecebimento({ ordem, periodos, periodo, aoTrocarPeriodo, aoEnviar, aoFechar }: Props) {
  // Quinzena encerrada some da lista, menos a da propria OP: sem essa excecao,
  // confirmar o recebimento de uma OP antiga nao teria periodo para escolher.
  const disponiveis = periodos.filter(p => p.ativo || p.id === ordem.calendarioPagamentoId)
  return <Modal etiqueta={ordem.numero} titulo="Confirmar recebimento" aoFechar={aoFechar}>
    <form className="form-grid two-columns" onSubmit={aoEnviar}>
      <CampoValor rotulo="Valor recebido" name="valor" defaultValue={ordem.valorTotal} required/>
      <Campo rotulo="Data do recebimento">
        <input name="data" type="date" defaultValue={hojeIso()} required/>
      </Campo>
      <Selecao rotulo="Período financeiro da OP" className="field-wide" required
        vazio="Selecione" value={periodo || ''}
        onChange={evento => aoTrocarPeriodo(Number(evento.target.value))}
        opcoes={disponiveis.map(p => ({
          valor: p.id,
          texto: `${p.descricao} · ${data(p.competenciaInicio)} a ${data(p.competenciaFim)}`,
        }))}/>
      <AcoesModal aoCancelar={aoFechar}>
        <button className="button button-primary" disabled={!periodo}>Salvar recebimento</button>
      </AcoesModal>
    </form>
  </Modal>
}
