import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { LinkOp, LinkViatura } from '../../components/LinksDeDado'
import { Carregando, Vazio } from '../../components/EstadoPagina'
import type { LancamentoFinanceiro } from '../../types/modelos'
import { data, moeda } from '../../utils/formatadores'
import './extrato.css'

type Props = {
  itens: LancamentoFinanceiro[]
  carregando: boolean
  aoPagar: (item: LancamentoFinanceiro) => void
  /** So para receita lancada a mao; a da Porto nao se edita. */
  aoEditarReceita?: (item: LancamentoFinanceiro) => void
  aoExcluirReceita?: (item: LancamentoFinanceiro) => void
}

const ORIGENS: Record<string, string> = {
  MANUAL: 'Lançada à mão', IMPORTADA: 'Importada da Porto',
  COMISSAO: 'Comissão calculada pelo sistema', RECORRENTE: 'Despesa fixa',
}

/** Com sinal: receita soma, despesa subtrai. */
const comSinal = (item: LancamentoFinanceiro) => item.tipo === 'RECEITA' ? item.valor : -item.valor

const diaDaSemana = (dia: string) =>
  new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(new Date(`${dia}T12:00:00`)).replace('.', '')

/**
 * Extrato agrupado por dia.
 *
 * A data de cada linha virou o cabecalho do dia, com o saldo realizado dele (a
 * soma dos dias bate com o saldo do topo) e, a parte, o que ainda e previsto.
 * Categoria, viatura, origem e protocolo sairam das colunas: ficam no detalhe
 * da linha, que abre com um clique. Na linha fica o que se le de relance — o
 * que foi, se ja foi pago e quanto.
 */
export function TabelaExtrato({ itens, carregando, aoPagar, aoEditarReceita, aoExcluirReceita }: Props) {
  const [aberto, setAberto] = useState<string | null>(null)
  if (carregando) return <Carregando card />
  if (!itens.length) {
    return <Vazio titulo="Nenhum lançamento"
      descricao="Nada lançado neste período."/>
  }
  const dias = new Map<string, LancamentoFinanceiro[]>()
  for (const item of itens) dias.set(item.data, [...(dias.get(item.data) ?? []), item])

  return <div className="table-scroll">
    <table className="tabela-extrato">
      <thead><tr>
        <th>Descrição</th><th>Situação</th><th className="th-numero">Valor</th><th/>
      </tr></thead>
      <tbody>
        {[...dias].map(([dia, doDia]) => {
          const realizado = doDia.reduce((t, i) => t + (i.realizado ? comSinal(i) : 0), 0)
          const previsto = doDia.reduce((t, i) => t + (i.realizado || i.status === 'REJEITADO' ? 0 : comSinal(i)), 0)
          return <Fragment key={dia}>
            <tr className="extrato-dia">
              <th scope="colgroup" colSpan={2}>
                <span>{diaDaSemana(dia)}</span> {data(dia)}
                <small>{doDia.length} {doDia.length === 1 ? 'lançamento' : 'lançamentos'}</small>
              </th>
              {/* O saldo do dia fica na coluna do valor; o previsto, ao lado. */}
              <td className="extrato-subtotal">
                {doDia.some(i => i.realizado)
                  ? <strong className={realizado >= 0 ? 'positive' : 'negative'}>{moeda(realizado)}</strong>
                  : <span className="empty-inline">—</span>}
              </td>
              <td className="extrato-previsto">
                {previsto ? <small>{previsto > 0 ? '+' : '−'} {moeda(Math.abs(previsto))} previsto</small> : null}
              </td>
            </tr>
            {doDia.map(item => <Linha key={item.id} item={item} aberta={aberto === item.id}
              aoAlternar={() => setAberto(a => a === item.id ? null : item.id)}
              aoPagar={aoPagar} aoEditarReceita={aoEditarReceita} aoExcluirReceita={aoExcluirReceita}/>)}
          </Fragment>
        })}
      </tbody>
    </table>
  </div>
}

type LinhaProps = Omit<Props, 'itens' | 'carregando'> & {
  item: LancamentoFinanceiro
  aberta: boolean
  aoAlternar: () => void
}

function Linha({ item, aberta, aoAlternar, aoPagar, aoEditarReceita, aoExcluirReceita }: LinhaProps) {
  const receita = item.tipo === 'RECEITA'
  // Despesa ja rejeitada nao volta a ser pagavel: o botao sumiria de
  // qualquer forma no backend, e mostra-lo so gera erro na cara da pessoa.
  const podePagar = !receita && !item.realizado && item.status !== 'REJEITADO'
  const receitaManual = receita && item.origem === 'MANUAL'
  const detalhe = `extrato-detalhe-${item.id}`
  return <>
    {/* Clicar na linha abre o detalhe; links e botoes dentro dela seguem o proprio caminho. */}
    <tr className={`linha-clicavel${aberta ? ' extrato-aberta' : ''}`}
      onClick={e => { if (!(e.target as HTMLElement).closest('a,button')) aoAlternar() }}>
      <td>
        <button type="button" className="extrato-abrir" aria-expanded={aberta} aria-controls={detalhe}
          aria-label={`${aberta ? 'Fechar' : 'Ver'} detalhes de ${item.descricao}`} onClick={aoAlternar}/>
        <strong><Descricao item={item}/></strong>
        <small>{item.categoria}</small>
      </td>
      <td>
        <span className={`ledger-status ${item.realizado ? 'ledger-recebido' : 'ledger-pendente'}`}>
          {item.realizado ? (receita ? 'Recebido' : 'Pago') : 'Previsto'}
        </span>
      </td>
      <td className={`col-valor ${receita ? 'positive' : 'negative'}`}>
        <strong>{receita ? '+' : '−'} {moeda(item.valor)}</strong>
      </td>
      <td className="extrato-acoes">
        {podePagar
          ? <button className="table-action" onClick={() => aoPagar(item)}>Registrar pagamento</button>
          : null}
        {!receita && item.origem !== 'COMISSAO'
          ? <Link className="table-action" to={`/despesas?editar=${item.referenciaId}`}>Editar</Link>
          : null}
        {receitaManual && aoEditarReceita && aoExcluirReceita
          ? <span className="acoes-da-linha">
            <button className="table-action" onClick={() => aoEditarReceita(item)}>Editar</button>
            <button className="table-action table-action-danger" onClick={() => aoExcluirReceita(item)}>Excluir</button>
          </span>
          : null}
      </td>
    </tr>
    {aberta ? <tr className="extrato-detalhe" id={detalhe}>
      <td colSpan={4}>
        <dl>
          <div><dt>Categoria</dt><dd>{item.categoria}</dd></div>
          <div><dt>Viatura</dt><dd><LinkViatura id={item.veiculoId} sigla={item.veiculo}/></dd></div>
          <div><dt>Socorrista</dt><dd>{item.motorista ?? '—'}</dd></div>
          <div><dt>Origem</dt><dd>{ORIGENS[item.origem] ?? item.origem}</dd></div>
          <div><dt>Protocolo</dt><dd>{item.protocolo ?? '—'}</dd></div>
        </dl>
      </td>
    </tr> : null}
  </>
}

/**
 * A comissao que o sistema lanca diz de quem e e de qual OP, e o nome leva a
 * ficha do socorrista, onde a comissao dele esta aberta por servico. Sem isso,
 * o extrato tinha uma linha "Comissao de socorrista" por pessoa, todas iguais.
 */
function Descricao({ item }: { item: LancamentoFinanceiro }) {
  if (!item.numeroOp || !item.motoristaId) return <>{item.descricao}</>
  return <>
    <Link className="extrato-socorrista" to={`/equipe/${item.motoristaId}`}
      title="Abrir a comissão deste socorrista">{item.motorista ?? 'Socorrista'}</Link>
    {' — comissão da OP '}<LinkOp numero={item.numeroOp}/>
  </>
}
