import { useEffect, useState, type FormEvent } from 'react'
import { useAoVivo } from '../dados/aoVivo'
import { listarCategorias, listarContratantes, criarCategoria } from '../dados/cadastros'
import { listarPeriodosDeOp } from '../dados/porto'
import { atualizarReceita, criarReceita, excluirReceita, listarReceitas } from '../dados/receitas'
import { CampoValor } from '../components/CampoValor'
import { Campo, Selecao } from '../components/Campos'
import { ConfirmarExclusao } from '../components/ConfirmarExclusao'
import { Carregando } from '../components/EstadoPagina'
import { Modal } from '../components/Modal'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { CabecalhoPagina, GradeIndicadores, Indicador, Painel } from '../components/ui/Pagina'
import type { OrdemPagamentoPorto, Receita } from '../types/modelos'
import { data, hojeIso, moeda } from '../utils/formatadores'
import { usePeriodoGlobal } from '../utils/periodoGlobal'

/**
 * Creditos da Porto.
 *
 * O Valor da OP no portal e servicos + creditos - descontos, e o arquivo de OS so
 * traz os servicos. Kawa: "tudo que nao for OP e tiver com esse valor divergente
 * provavelmente sera credito, entao so adicione uma aba para adicionar receita,
 * mas apenas com essa opcao de adicionar Creditos".
 *
 * O credito e receita da empresa e nao entra na comissao, que continua 20% so dos
 * servicos. Escolher a OP preenche a data com o fim do periodo dela, para o
 * credito cair na mesma quinzena; a OP fica escrita na descricao, e nao ligada a
 * receita, para o credito continuar editavel e excluivel.
 */
const CATEGORIA = 'Créditos Porto'

export default function CreditosPage() {
  const [periodo, setPeriodo] = usePeriodoGlobal()
  const [creditos, setCreditos] = useState<Receita[]>([])
  const [ops, setOps] = useState<OrdemPagamentoPorto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [form, setForm] = useState(false)
  const [editando, setEditando] = useState<Receita | null>(null)
  const [excluindo, setExcluindo] = useState<Receita | null>(null)
  const [dataDoForm, setDataDoForm] = useState(hojeIso())
  const [salvando, setSalvando] = useState(false)

  const carregar = () => listarReceitas()
    .then(lista => setCreditos(lista.filter(r => r.manual && r.categoria === CATEGORIA)))
    .catch(e => setErro((e as Error).message))
  useEffect(() => { void carregar().finally(() => setCarregando(false)) }, [])
  useEffect(() => { listarPeriodosDeOp().then(setOps).catch(() => setOps([])) }, [])
  useAoVivo(() => { void carregar() })

  const doPeriodo = creditos.filter(c => c.dataCompetencia >= periodo.inicio && c.dataCompetencia <= periodo.fim)
  const total = doPeriodo.reduce((soma, c) => soma + c.valor, 0)

  function abrirNovo() { setEditando(null); setDataDoForm(hojeIso()); setForm(true) }
  function abrirEdicao(c: Receita) { setEditando(c); setDataDoForm(c.dataCompetencia); setForm(true) }
  function fechar() { setForm(false); setEditando(null) }

  async function categoriaDosCreditos(): Promise<number> {
    const existente = (await listarCategorias('RECEITA')).find(c => c.nome === CATEGORIA)
    return existente ? existente.id : (await criarCategoria(CATEGORIA, 'RECEITA')).id
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const op = ops.find(o => String(o.id) === String(f.get('op')))
    const descricao = String(f.get('descricao') || '').trim()
      || (op ? `Créditos da OP ${op.numero}` : 'Créditos Porto')
    const dataCredito = String(f.get('data'))
    setSalvando(true); setErro(''); setMensagem('')
    try {
      const [categoriaId, porto] = await Promise.all([
        categoriaDosCreditos(),
        listarContratantes().then(lista => lista.find(c => c.nome.toLowerCase().includes('porto'))),
      ])
      const dados = {
        descricao, valor: Number(f.get('valor')), dataCompetencia: dataCredito, dataRecebimento: dataCredito,
        status: 'RECEBIDA' as const, recorrente: false, categoriaId, contratanteId: porto?.id ?? null,
        observacoes: String(f.get('observacoes') || '') || null,
      }
      if (editando) await atualizarReceita(editando.id, dados)
      else await criarReceita(dados)
      setMensagem(editando ? 'Crédito atualizado.' : `Crédito de ${moeda(dados.valor)} lançado. Já está nas receitas.`)
      fechar(); await carregar()
    } catch (x) { setErro((x as Error).message) }
    finally { setSalvando(false) }
  }

  return <div className="page-enter">
    <CabecalhoPagina
      modulo="Financeiro"
      titulo="Créditos"
      descricao="Créditos que a Porto paga na OP além dos serviços. Entram nas receitas e não mudam a comissão."
      contexto={<>Período: <strong>{data(periodo.inicio)}</strong> → <strong>{data(periodo.fim)}</strong></>}
      acoes={<button className="button button-primary" onClick={abrirNovo}>+ Adicionar crédito</button>}/>

    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
    {mensagem ? <div className="success-notice">{mensagem}</div> : null}

    <Painel className="painel-filtros">
      <form className="ledger-filters" onSubmit={e => e.preventDefault()}>
        <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/>
      </form>
    </Painel>

    <GradeIndicadores>
      <Indicador rotulo="Créditos no período" valor={moeda(total)}
        apoio={doPeriodo.length ? `${doPeriodo.length} ${doPeriodo.length === 1 ? 'lançamento' : 'lançamentos'}` : 'Nenhum crédito lançado'}/>
    </GradeIndicadores>

    {carregando ? <Carregando/> : null}

    <Painel semRespiro>
      {!carregando && !doPeriodo.length
        ? <p className="empty-inline">Nenhum crédito neste período. Quando o Valor da OP no portal for maior que o valor dos serviços, lance a diferença aqui.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th>Descrição</th><th>Data</th><th>Valor</th><th/></tr></thead>
          <tbody>{doPeriodo.map(c => <tr key={c.id}>
            <td><strong>{c.descricao}</strong>{c.observacoes ? <small>{c.observacoes}</small> : null}</td>
            <td>{data(c.dataCompetencia)}</td>
            <td className="positive"><strong>{moeda(c.valor)}</strong></td>
            <td><span className="acoes-da-linha">
              <button className="table-action" onClick={() => abrirEdicao(c)}>Editar</button>
              <button className="table-action table-action-danger" onClick={() => setExcluindo(c)}>Excluir</button>
            </span></td>
          </tr>)}</tbody>
        </table></div>}
    </Painel>

    {form ? <Modal etiqueta="Receita" titulo={editando ? 'Editar crédito' : 'Adicionar crédito'} aoFechar={fechar}>
      <form onSubmit={salvar} className="form-grid two-columns">
        <CampoValor rotulo="Valor do crédito" name="valor" defaultValue={editando?.valor} required/>
        <Selecao rotulo="OP" name="op" vazio="Sem OP"
          onChange={e => { const op = ops.find(o => String(o.id) === e.target.value); if (op?.periodoFim) setDataDoForm(op.periodoFim) }}
          opcoes={ops.map(o => ({ valor: o.id, texto: `OP ${o.numero}${o.periodoFim ? ` · até ${data(o.periodoFim)}` : ''}` }))}/>
        <Campo rotulo="Data"><input name="data" type="date" value={dataDoForm} onChange={e => setDataDoForm(e.target.value)} required/></Campo>
        <Campo rotulo="Descrição"><input name="descricao" defaultValue={editando?.descricao} placeholder="Opcional" autoCapitalize="sentences" autoComplete="off"/></Campo>
        <Campo rotulo="Observações" className="field-wide"><input name="observacoes" defaultValue={editando?.observacoes} autoCapitalize="sentences" autoComplete="off"/></Campo>
        <div className="modal-actions field-wide">
          <button type="button" className="button button-ghost" onClick={fechar}>Cancelar</button>
          <button className="button button-primary" disabled={salvando}>{salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Adicionar crédito'}</button>
        </div>
      </form>
    </Modal> : null}

    {excluindo ? <ConfirmarExclusao coisa="crédito" nome={excluindo.descricao}
      aviso="O crédito sai das receitas e dos totais."
      resumo={[['Descrição', excluindo.descricao], ['Data', data(excluindo.dataCompetencia)], ['Valor', moeda(excluindo.valor)]]}
      aoConfirmar={async () => { await excluirReceita(excluindo.id); setMensagem('Crédito excluído.'); await carregar() }}
      aoFechar={() => setExcluindo(null)}/> : null}
  </div>
}
