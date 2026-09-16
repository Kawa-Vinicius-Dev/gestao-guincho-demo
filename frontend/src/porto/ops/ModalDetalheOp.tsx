import type { FormEvent } from 'react'
import { Campo, Selecao } from '../../components/Campos'
import { Modal } from '../../components/Modal'
import type { DetalheOpPorto, PreviaPorto } from '../../types/modelos'
import { moeda } from '../../utils/formatadores'
import { MOTIVOS_COMPOSICAO, MOTIVOS_DIVERGENCIA, data, rotulo } from './opcoes'
import { CampoArquivo } from '../../components/CampoArquivo'

type Props = {
  detalhe: DetalheOpPorto
  previa: PreviaPorto | null
  aoEscolherArquivo: (arquivo: File | null) => void
  arquivoEscolhido: boolean
  /** Nome do arquivo escolhido, para a tela dizer qual e. */
  nomeArquivo?: string
  aoAnalisar: () => void
  aoConfirmarComposicao: (evento: FormEvent<HTMLFormElement>) => void
  aoJustificar: (evento: FormEvent<HTMLFormElement>) => void
  aoEditar: () => void
  aoExportar: (formato: 'excel' | 'pdf') => void
  baixando: string
  aoFechar: () => void
}

export function ModalDetalheOp(props: Props) {
  const { detalhe, previa, aoEscolherArquivo,
    arquivoEscolhido, nomeArquivo, aoAnalisar, aoConfirmarComposicao, aoJustificar, aoEditar,
    aoExportar, baixando, aoFechar } = props
  const op = detalhe.ordemPagamento

  const acoes = <>
    <button type="button" className="button button-ghost button-sm" disabled={baixando !== ''}
      onClick={() => aoExportar('excel')}>
      {baixando === 'op-excel' ? 'Gerando Excel…' : 'Baixar Excel da OP'}
    </button>
    <button type="button" className="button button-ghost button-sm" disabled={baixando !== ''}
      onClick={() => aoExportar('pdf')}>
      {baixando === 'op-pdf' ? 'Gerando PDF…' : 'Baixar PDF da OP'}
    </button>
    {op.situacao !== 'RECEBIDO'
      ? <button type="button" className="button button-ghost button-sm" onClick={aoEditar}>Editar OP</button>
      : null}
  </>

  return <Modal etiqueta="Detalhes da OP" titulo={op.numero} className="porto-op-detail"
    acoes={acoes} aoFechar={aoFechar}>
    <div className="porto-detail-summary">
      <span>Previsto<strong>{moeda(op.valorTotal)}</strong></span>
      <span>Soma das OS<strong>{moeda(op.valorOrdensServico)}</strong></span>
      <span>Diferença<strong>{moeda(op.divergencia)}</strong></span>
    </div>

    <div className="porto-composition-upload">
      <CampoArquivo rotulo="Composição CSV/TXT da OP" accept=".csv,.txt"
        nome={nomeArquivo} aoEscolher={aoEscolherArquivo}/>
      <button className="button button-ghost" disabled={!arquivoEscolhido} onClick={aoAnalisar}>
        Analisar composição
      </button>
    </div>

    {previa
      ? <FormularioComposicao previa={previa} detalhe={detalhe} aoEnviar={aoConfirmarComposicao}/>
      : null}

    <div className="table-scroll">
      <table>
        <thead><tr><th>OS</th><th>Especialidade</th><th>Data</th><th>Valor</th></tr></thead>
        <tbody>
          {detalhe.ordensServico.map(os => <tr key={os.id}>
            <td>{os.numero}</td><td>{os.especialidade}</td>
            <td>{data(os.dataAtendimento)}</td><td>{moeda(os.valorTotal)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>

    {op.divergencia !== 0
      ? <form className="porto-justification" onSubmit={aoJustificar}>
          <Selecao rotulo="Motivo" name="motivo" required vazio="Selecione" opcoes={MOTIVOS_DIVERGENCIA}/>
          <Campo rotulo="Observação"><textarea name="observacao" required/></Campo>
          <button className="button button-primary">Registrar justificativa</button>
        </form>
      : null}

    {detalhe.historico?.length
      ? <div className="porto-history">
          <h3>Histórico</h3>
          {detalhe.historico.map(item => <p key={item.id}>
            <strong>{rotulo(item.evento)}</strong> · {item.descricao}
          </p>)}
        </div>
      : null}
  </Modal>
}

type ComposicaoProps = {
  previa: PreviaPorto
  detalhe: DetalheOpPorto
  aoEnviar: (evento: FormEvent<HTMLFormElement>) => void
}

function FormularioComposicao({ previa, detalhe, aoEnviar }: ComposicaoProps) {
  const op = detalhe.ordemPagamento
  const somaDaPrevia = previa.resumo?.valorTotal ?? 0
  // Um centavo de folga: o previsto da OP e a soma das OS vem de arredondamentos
  // diferentes, e exigir igualdade exata pediria justificativa por nada.
  const temDiferenca = Math.abs(somaDaPrevia - op.valorTotal) > .01
  const temErro = previa.linhas.some(linha => linha.acao === 'ERRO')

  return <form className="porto-justification" onSubmit={aoEnviar}>
    <strong>{previa.totalLinhas} serviços na prévia · {moeda(somaDaPrevia)}</strong>
    {temDiferenca
      ? <>
          <Selecao rotulo="Motivo da diferença" name="motivo" required vazio="Selecione"
            opcoes={MOTIVOS_COMPOSICAO}/>
          <Campo rotulo="Justificativa da diferença"><textarea name="justificativa" required/></Campo>
        </>
      : null}
    <button className="button button-primary" disabled={temErro}>Confirmar composição</button>
  </form>
}
