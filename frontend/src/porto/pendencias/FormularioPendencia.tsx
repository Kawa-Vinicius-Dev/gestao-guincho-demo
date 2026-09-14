import type { FormEvent } from 'react'
import { Campo, Selecao } from '../../components/Campos'
import { AcoesModal, Modal } from '../../components/Modal'
import { CampoValor } from '../../components/CampoValor'

const SITUACAO_FINANCEIRA = [
  { valor: 'BLOQUEADO_PARA_PAGAMENTO', texto: 'Bloqueado para pagamento' },
  { valor: 'VALOR_DIVERGENTE', texto: 'Valor divergente' },
  { valor: 'AGUARDANDO_OP', texto: 'Aguardando OP' },
]

type Props = {
  aoEnviar: (evento: FormEvent<HTMLFormElement>) => void
  aoFechar: () => void
}

export function FormularioPendencia({ aoEnviar, aoFechar }: Props) {
  return <Modal etiqueta="Porto Seguro" titulo="Nova pendência" aoFechar={aoFechar}>
    <form className="form-grid two-columns" onSubmit={aoEnviar}>
      <Campo rotulo="Número da OS"><input name="numeroOs" required/></Campo>
      <Campo rotulo="Motivo"><input name="motivo" required/></Campo>
      <CampoValor rotulo="Valor" name="valor" required exigirPositivo={false}/>
      <Campo rotulo="Data da pendência"><input name="dataPendencia" type="date" required/></Campo>
      <Campo rotulo="Responsável"><input name="responsavel" required/></Campo>
      <Selecao rotulo="Situação financeira" name="statusFinanceiro" required opcoes={SITUACAO_FINANCEIRA}/>
      <Campo rotulo="Prazo"><input name="prazo" type="date"/></Campo>
      <Campo rotulo="Referência Porto"><input name="referenciaPorto"/></Campo>
      <Campo rotulo="Observação" className="field-wide"><textarea name="observacao" required/></Campo>
      <AcoesModal aoCancelar={aoFechar}>
        <button className="button button-primary">Salvar pendência</button>
      </AcoesModal>
    </form>
  </Modal>
}
