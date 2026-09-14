import type { FormEvent } from 'react'
import { Campo, Selecao } from '../../components/Campos'
import { AcoesModal, Modal } from '../../components/Modal'
import type { OrdemPagamentoPorto } from '../../types/modelos'
import { SITUACAO_FINANCEIRA, STATUS_PORTO } from './opcoes'
import { CampoValor } from '../../components/CampoValor'

/**
 * Cadastro e edicao de OP.
 *
 * Eram dois modais com os mesmos seis campos, escritos duas vezes. Alem do
 * tamanho, tinham divergido: o de cadastro trazia "Selecione" em Status Porto e
 * o de edicao nao, e o de edicao deixava Situacao financeira sem required.
 */

type Props = {
  /** Ausente: cadastro. Presente: edicao, com os campos preenchidos. */
  edicao?: OrdemPagamentoPorto
  aoEnviar: (evento: FormEvent<HTMLFormElement>) => void
  aoFechar: () => void
}

export function FormularioOp({ edicao, aoEnviar, aoFechar }: Props) {
  return <Modal
    etiqueta="Porto Seguro"
    titulo={edicao ? 'Editar ordem de pagamento' : 'Nova ordem de pagamento'}
    aoFechar={aoFechar}>
    <form className="form-grid two-columns" onSubmit={aoEnviar}>
      <Campo rotulo="Número da OP">
        <input name="numero" defaultValue={edicao?.numero} required/>
      </Campo>
      <Campo rotulo="Data prevista">
        <input name="dataPrevista" type="date" defaultValue={edicao?.dataPagamentoProgramada} required/>
      </Campo>
      <CampoValor rotulo="Valor informado" name="valorInformado" defaultValue={edicao?.valorTotal} required
        exigirPositivo={false}/>
      <Selecao rotulo="Status Porto" name="statusPorto" required
        defaultValue={edicao?.statusPorto ?? undefined}
        vazio={edicao ? undefined : 'Selecione'}
        opcoes={STATUS_PORTO}/>
      <Selecao rotulo="Situação financeira" name="situacaoFinanceira" required
        defaultValue={edicao?.situacao} opcoes={SITUACAO_FINANCEIRA}/>
      <Campo rotulo="Observação" className="field-wide">
        <textarea name="observacao" defaultValue={edicao?.observacao}/>
      </Campo>
      <AcoesModal aoCancelar={aoFechar}>
        <button className="button button-primary">{edicao ? 'Salvar alterações' : 'Salvar ordem'}</button>
      </AcoesModal>
    </form>
  </Modal>
}
