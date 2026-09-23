import { useEffect, useState, type FormEvent } from 'react'
import { CampoValor } from '../components/CampoValor'
import { Campo, Selecao } from '../components/Campos'
import { CampoNumero } from '../components/CamposMascarados'
import { ConfirmarAcao, type PedidoConfirmacao } from '../components/ConfirmarAcao'
import { ConfirmarExclusao } from '../components/ConfirmarExclusao'
import { AcoesModal, Modal } from '../components/Modal'
import { listarCategorias } from '../dados/cadastros'
import {
  alternarAtivoDespesaFixa, atualizarDespesaFixa, criarDespesaFixa, excluirDespesaFixa,
  listarDespesasFixas, type DadosDespesaFixa,
} from '../dados/despesasFixas'
import { listarVeiculos } from '../dados/veiculos'
import type { Categoria, DespesaRecorrente, Veiculo } from '../types/modelos'
import { moeda } from '../utils/formatadores'
import './despesasFixas.css'

/**
 * Despesas fixas: cadastra uma vez, e ela entra sozinha todo mes.
 *
 * Kawa, 23/09/2026: seguro, parcela, IPTU — "para eu nao precisar colocar todos
 * os meses esse valor". No dia do vencimento, a despesa do mes entra ja paga,
 * com o valor daqui. Se num mes o valor for outro, edita-se aquela despesa na
 * tela de Despesas; o cadastro daqui continua valendo para os proximos meses.
 * Com parcelas (3 de 10), a contagem segue sozinha e a fixa acaba na ultima.
 *
 * Kawa, 23/09/2026: seguro e "realmente um valor fixo", pago todo mes, sem
 * parcela. Por isso o cadastro pergunta primeiro o tipo — "Valor fixo todo mes"
 * ou "Parcelada" — e so a parcelada mostra total de parcelas e parcelas pagas.
 */
export function DespesasFixas() {
  const [fixas, setFixas] = useState<DespesaRecorrente[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [editando, setEditando] = useState<DespesaRecorrente | 'nova' | null>(null)
  const [parcelada, setParcelada] = useState(false)
  const [excluindo, setExcluindo] = useState<DespesaRecorrente | null>(null)
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')

  const carregar = () => listarDespesasFixas().then(setFixas).catch((e: Error) => setErro(e.message))
  useEffect(() => {
    void carregar()
    listarCategorias('DESPESA').then(setCategorias).catch(() => setCategorias([]))
    listarVeiculos().then(setVeiculos).catch(() => setVeiculos([]))
  }, [])

  const ativas = fixas.filter(f => f.ativo)
  const totalMes = ativas.reduce((t, f) => t + f.valor, 0)
  const aberta = editando === 'nova' ? null : editando
  const abrir = (fixa: DespesaRecorrente | 'nova') => {
    setErro(''); setParcelada(fixa !== 'nova' && Boolean(fixa.totalParcelas)); setEditando(fixa)
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const f = new FormData(evento.currentTarget)
    const total = parcelada ? Number(f.get('totalParcelas')) || null : null
    if (parcelada && !total) { setErro('Informe em quantas parcelas ela é paga.'); return }
    // "10 parcelas, 3 ja pagas": a proxima a entrar e a 4a.
    const pagas = parcelada ? Number(f.get('parcelasPagas')) || 0 : 0
    if (total && pagas >= total) { setErro('Se todas as parcelas já foram pagas, não há o que lançar.'); return }
    const dados: DadosDespesaFixa = {
      descricao: String(f.get('descricao')).trim(),
      categoriaId: Number(f.get('categoriaId')),
      valor: Number(f.get('valor')),
      diaVencimento: Number(f.get('diaVencimento')),
      veiculoId: f.get('veiculoId') ? Number(f.get('veiculoId')) : null,
      observacoes: String(f.get('observacoes') || '') || null,
      totalParcelas: total,
      parcelaInicial: total ? pagas + 1 : null,
    }
    setErro('')
    try {
      if (aberta) await atualizarDespesaFixa(aberta.id, dados)
      else await criarDespesaFixa(dados)
      setMensagem(aberta
        ? 'Despesa fixa atualizada. Vale a partir do próximo lançamento.'
        : `${dados.descricao} cadastrada. Entra sozinha, já paga, todo dia ${dados.diaVencimento}.`)
      setEditando(null)
      await carregar()
    } catch (e) { setErro((e as Error).message) }
  }

  function pedirAtivo(fixa: DespesaRecorrente) {
    const resumo: [string, string][] = [['Despesa fixa', fixa.descricao], ['Valor', moeda(fixa.valor)]]
    const alternar = async () => { await alternarAtivoDespesaFixa(fixa); await carregar() }
    setPedido(fixa.ativo
      ? { titulo: 'Pausar esta despesa fixa?', perigo: true, textoConfirmar: 'Pausar', resumo, aoConfirmar: alternar,
          efeito: <><strong>{fixa.descricao}</strong> para de entrar sozinha nos próximos meses. O que já foi lançado continua.</> }
      : { titulo: 'Voltar a lançar esta despesa fixa?', textoConfirmar: 'Voltar a lançar', resumo, aoConfirmar: alternar,
          efeito: <><strong>{fixa.descricao}</strong> volta a entrar sozinha, já paga, todo dia {fixa.diaVencimento}.</> })
  }

  const parcelas = (f: DespesaRecorrente) => {
    if (!f.totalParcelas) return 'Valor fixo todo mês'
    const pagas = Math.min((f.proximaParcela ?? f.parcelaInicial ?? 1) - 1, f.totalParcelas)
    return pagas >= f.totalParcelas ? `${f.totalParcelas} de ${f.totalParcelas} pagas · encerrada`
      : `${pagas} de ${f.totalParcelas} pagas · próxima ${pagas + 1}ª`
  }

  return <section className="panel settings-card settings-card-largo" aria-label="Despesas fixas">
    <header className="settings-card-cabecalho">
      <div>
        <h2>Despesas fixas</h2>
        <p>Seguro, parcela, IPTU, contador: cadastre uma vez e ela <strong>entra sozinha, já paga, no dia do
          vencimento</strong> de cada mês. Se num mês o valor for diferente, edite aquela despesa na tela de Despesas.</p>
      </div>
      <button className="button button-primary" onClick={() => abrir('nova')}>+ Nova despesa fixa</button>
    </header>
    {erro && !editando ? <div className="form-alert" role="alert">{erro}</div> : null}
    {mensagem ? <div className="success-notice">{mensagem}</div> : null}

    {fixas.length ? <>
      <p className="fixas-total">{ativas.length} {ativas.length === 1 ? 'ativa' : 'ativas'} · <strong>{moeda(totalMes)}</strong> por mês</p>
      <div className="table-scroll"><table>
        <thead><tr><th>Descrição</th><th>Categoria</th><th>Todo dia</th><th>Tipo</th><th className="th-numero">Valor</th><th/></tr></thead>
        <tbody>{fixas.map(f => <tr key={f.id} className={f.ativo ? undefined : 'linha-inativa'}>
          <td><strong>{f.descricao}</strong>{f.veiculo ? <small>{f.veiculo}</small> : null}{f.ativo ? null : <small>Pausada</small>}</td>
          <td>{f.categoria}</td>
          <td>{f.diaVencimento}</td>
          <td>{parcelas(f)}</td>
          <td className="col-numero"><strong>{moeda(f.valor)}</strong></td>
          <td className="col-acoes"><span className="acoes-da-linha">
            <button className="table-action" onClick={() => abrir(f)}>Editar</button>
            <button className="table-action" onClick={() => pedirAtivo(f)}>{f.ativo ? 'Pausar' : 'Retomar'}</button>
            <button className="table-action table-action-danger" onClick={() => setExcluindo(f)}>Excluir</button>
          </span></td>
        </tr>)}</tbody>
      </table></div>
    </> : <p className="empty-inline">Nenhuma despesa fixa ainda. Cadastre o seguro das viaturas, as parcelas e o que mais se repete todo mês.</p>}

    {editando ? <Modal etiqueta="Despesa fixa" titulo={aberta ? `Editar ${aberta.descricao}` : 'Nova despesa fixa'} aoFechar={() => setEditando(null)}>
      <form onSubmit={salvar} className="form-grid two-columns">
        {erro ? <div className="form-alert field-wide" role="alert">{erro}</div> : null}
        <Campo rotulo="Descrição" className="field-wide">
          <input name="descricao" required defaultValue={aberta?.descricao} placeholder="Ex.: Seguro dos caminhões"
            autoCapitalize="sentences" autoComplete="off"/>
        </Campo>
        <CampoValor rotulo="Valor por mês" name="valor" defaultValue={aberta?.valor} required/>
        <CampoNumero rotulo="Dia do vencimento" name="diaVencimento" decimais={0} min={1} max={31} required
          defaultValue={aberta ? String(aberta.diaVencimento) : ''} ajuda="Nesse dia, a despesa do mês entra já paga."/>
        <Selecao rotulo="Categoria" name="categoriaId" required defaultValue={aberta?.categoriaId ?? ''}
          opcoes={categorias.filter(c => c.ativo).map(c => ({ valor: c.id, texto: c.nome }))}/>
        <Selecao rotulo="Viatura" name="veiculoId" vazio="Sem viatura" defaultValue={aberta?.veiculoId ?? ''}
          opcoes={veiculos.map(v => ({ valor: v.id, texto: v.identificacao }))}/>
        <div className="field field-wide tipo-da-fixa">
          <span>Tipo</span>
          <div className="segmented" role="group" aria-label="Tipo da despesa fixa">
            <button type="button" className={parcelada ? '' : 'active'} aria-pressed={!parcelada}
              onClick={() => setParcelada(false)}>Valor fixo todo mês</button>
            <button type="button" className={parcelada ? 'active' : ''} aria-pressed={parcelada}
              onClick={() => setParcelada(true)}>Parcelada</button>
          </div>
          <small>{parcelada
            ? 'Tem fim, como o financiamento de um caminhão: na última parcela ela para sozinha.'
            : 'Seguro, aluguel, contador: o mesmo valor todo mês, sem data para acabar.'}</small>
        </div>
        {parcelada ? <>
          <CampoNumero rotulo="Total de parcelas" name="totalParcelas" decimais={0} min={1} required placeholder="Ex.: 10"
            defaultValue={aberta?.totalParcelas ? String(aberta.totalParcelas) : ''}/>
          <CampoNumero rotulo="Parcelas já pagas" name="parcelasPagas" decimais={0} min={0} placeholder="Ex.: 3"
            defaultValue={aberta?.parcelaInicial ? String(aberta.parcelaInicial - 1) : ''}
            ajuda="10 parcelas com 3 já pagas: a próxima a entrar é a 4ª."/>
        </> : null}
        <Campo rotulo="Observações" className="field-wide">
          <input name="observacoes" defaultValue={aberta?.observacoes} autoCapitalize="sentences" autoComplete="off"/>
        </Campo>
        <AcoesModal aoCancelar={() => setEditando(null)}>
          <button className="button button-primary">{aberta ? 'Salvar alterações' : 'Cadastrar despesa fixa'}</button>
        </AcoesModal>
      </form>
    </Modal> : null}

    {excluindo ? <ConfirmarExclusao coisa="despesa fixa" nome={excluindo.descricao}
      aviso="Ela para de entrar nos próximos meses. As despesas já lançadas continuam."
      resumo={[['Descrição', excluindo.descricao], ['Valor', moeda(excluindo.valor)], ['Todo dia', String(excluindo.diaVencimento)]]}
      aoConfirmar={async () => { await excluirDespesaFixa(excluindo.id); setMensagem('Despesa fixa excluída.'); await carregar() }}
      aoFechar={() => setExcluindo(null)}/> : null}
    {pedido ? <ConfirmarAcao {...pedido} aoFechar={() => setPedido(null)}/> : null}
  </section>
}
