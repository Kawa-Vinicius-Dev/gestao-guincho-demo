import { useEffect, useState } from 'react'
import { ConfirmarAcao, type PedidoConfirmacao } from '../../components/ConfirmarAcao'
import { LinkOp, LinkSocorrista, LinkViatura } from '../../components/LinksDeDado'
import { Modal } from '../../components/Modal'
import { definirComissaoDaOs } from '../../dados/comissoes'
import { lerMarcasDaOs, type LinhaOs, type MarcasDaOs } from '../../dados/porto/listaOs'
import { data, moeda } from '../../utils/formatadores'
import { ETIQUETAS_SITUACAO } from '../situacaoOs'

/**
 * Detalhe da OS: tudo sobre ela e tudo o que se pode fazer com ela, num lugar so.
 *
 * Kawa, 22/09/2026: a aba de Ordens de servico "tem que aparecer edicao de
 * comissao, mais informacoes", com as telas mais enxutas. A tabela fica com o
 * essencial para achar a OS; o resto — competencia, valores, comissao e as acoes
 * — mora aqui. O valor da OS que veio da OP nao se edita: e o que a Porto pagou.
 */
/** "17/09 a 30/09/2026", com o ano uma vez so quando os dois caem no mesmo ano. */
export function competenciaDe(os: LinhaOs) {
  if (!os.competenciaInicio || !os.competenciaFim) return '—'
  const ini = data(os.competenciaInicio), fim = data(os.competenciaFim)
  return ini.slice(6) === fim.slice(6) ? `${ini.slice(0, 5)} a ${fim}` : `${ini} a ${fim}`
}

export function DetalheDaOs({ os, veiculoId, aoCorrigir, aoInformarValor, aoMudar, aoFechar }: {
  os: LinhaOs
  veiculoId?: number
  aoCorrigir: () => void
  aoInformarValor: () => void
  /** A comissao mudou: a lista recarrega. */
  aoMudar: (mensagem: string) => void
  aoFechar: () => void
}) {
  const [marcas, setMarcas] = useState<MarcasDaOs | null>(null)
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)

  useEffect(() => { lerMarcasDaOs(os.id).then(setMarcas).catch(() => setMarcas(null)) }, [os.id])

  const etiqueta = ETIQUETAS_SITUACAO[os.situacao]
  const semComissao = Boolean(marcas?.semComissao)
  const competencia = competenciaDe(os)

  function pedirComissao() {
    const tirando = !semComissao
    setPedido({
      titulo: tirando ? 'Tirar a comissão e cancelar esta OS?' : 'Devolver a comissão e reativar esta OS?',
      efeito: tirando
        ? <>A OS fica <strong>cancelada</strong>: sai da comissão e da produção de <strong>{os.motorista ?? 'quem rodou'}</strong> e
            deixa de contar nos painéis. Se ela já estiver paga numa OP, a comissão daquela OP é refeita. O que a Porto pagou
            continua nas receitas.</>
        : <>A OS volta à situação que tinha antes de ser cancelada, volta a gerar comissão, e a comissão da OP é refeita.</>,
      resumo: [
        ['OS', os.numero],
        ['Socorrista', os.motorista ?? '—'],
        [tirando ? 'Sai da comissão' : 'Volta para a comissão', os.comissao !== undefined ? moeda(os.comissao) : 'Ainda sem valor: a OS não foi paga numa OP'],
      ],
      textoConfirmar: tirando ? 'Tirar comissão e cancelar' : 'Devolver comissão',
      perigo: tirando,
      aoConfirmar: async () => {
        await definirComissaoDaOs(os.id, tirando)
        aoMudar(tirando ? `OS ${os.numero} cancelada, sem comissão.` : `OS ${os.numero} reativada, com comissão.`)
      },
    })
  }

  return <Modal etiqueta="Ordem de serviço" titulo={os.numero} className="detalhe-os" fecharAoClicarFora aoFechar={aoFechar}>
    <div className="detalhe-os-situacao">
      <span className={`vehicle-status ${etiqueta.classe}`}>{etiqueta.texto}</span>
      {semComissao ? <span className="vehicle-status status-erro_leitura">Cancelada · sem comissão</span> : null}
    </div>

    <dl className="detalhe-os-dados">
      <div><dt>Atendimento</dt><dd>{os.dataAtendimento ? data(os.dataAtendimento) : '—'}</dd></div>
      <div><dt>Competência</dt><dd>{competencia}</dd></div>
      <div className="detalhe-os-largo"><dt>Especialidade</dt><dd>{os.especialidade || '—'}</dd></div>
      <div><dt>Socorrista</dt><dd>{os.motorista
        ? <LinkSocorrista id={os.motoristaId} nome={os.motorista}/>
        : <span className="dado-vazio">{os.socorristaNoArquivo ? `No arquivo: ${os.socorristaNoArquivo}` : 'Sem socorrista'}</span>}</dd></div>
      <div><dt>Viatura</dt><dd>{os.viatura ? <LinkViatura id={veiculoId} sigla={os.viatura} chip/> : <span className="dado-vazio">Sem viatura</span>}</dd></div>
      <div><dt>OP</dt><dd>{os.numeroOp ? <LinkOp numero={os.numeroOp}/> : <span className="dado-vazio">Aguardando OP</span>}</dd></div>
    </dl>

    <dl className="detalhe-os-valores">
      <div><dt>{os.ordemPagamentoId ? 'Valor pago na OP' : 'Valor informado'}</dt>
        <dd>{os.ordemPagamentoId ? moeda(os.valorTotal)
          : os.valorManual !== undefined ? moeda(os.valorManual) : <span className="dado-vazio">Sem valor</span>}</dd></div>
      {os.ordemPagamentoId && os.valorManual !== undefined
        ? <div><dt>Informado antes da OP</dt><dd>{moeda(os.valorManual)}
            {os.divergencia ? <small> · diferença {os.divergencia > 0 ? '+' : ''}{moeda(os.divergencia)}</small> : null}</dd></div>
        : null}
      <div><dt>Comissão</dt><dd>{semComissao ? <span className="dado-vazio">Sem comissão</span>
        : os.comissao !== undefined ? moeda(os.comissao) : <span className="dado-vazio">Só quando a OP chegar</span>}</dd></div>
    </dl>

    <div className="detalhe-os-acoes">
      <button type="button" className="button button-ghost" onClick={aoCorrigir}>Corrigir socorrista e viatura</button>
      {os.ordemPagamentoId ? null
        : <button type="button" className="button button-ghost" onClick={aoInformarValor}>
            {os.valorManual !== undefined ? 'Alterar valor informado' : 'Informar valor'}</button>}
      <button type="button" className={semComissao ? 'button button-primary' : 'button button-ghost botao-perigo'}
        disabled={!marcas} onClick={pedirComissao}>
        {semComissao ? 'Devolver comissão' : 'Tirar comissão e cancelar'}</button>
    </div>
    {os.ordemPagamentoId
      ? <p className="nota-fora-do-fechamento">O valor desta OS veio da OP e não se edita: é o que a Porto pagou.</p>
      : null}

    {pedido ? <ConfirmarAcao {...pedido} aoFechar={() => setPedido(null)}/> : null}
  </Modal>
}
