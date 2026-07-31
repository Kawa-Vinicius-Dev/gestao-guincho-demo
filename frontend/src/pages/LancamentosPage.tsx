import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useDemo } from '../demo/DemoContext'
import type { ClasseCusto, TipoLancamento } from '../demo/modelosDemo'
import { data, moeda } from '../utils/formatadores'

const receitas = ['Serviços de guincho', 'Serviços via Porto Seguro', 'Outras seguradoras/parceiros', 'Serviços particulares', 'Outras receitas']
const despesasVariaveis = ['Combustível', 'Pedágio', 'Alimentação em serviço', 'Km morto', 'Comissão/diária de motorista', 'Outros custos operacionais']
const despesasFixas = ['Manutenção', 'Seguro', 'Parcela/financiamento de veículo', 'Salários', 'Contabilidade', 'Internet/telefone', 'Outros custos administrativos']

export default function LancamentosPage({ filtroInicial = '' }: { filtroInicial?: '' | TipoLancamento }) {
  const { state, adicionarLancamento, atualizarStatusLancamento } = useDemo()
  const { usuario } = useAuth()
  const [params] = useSearchParams()
  const funcionario = usuario?.perfil === 'FUNCIONARIO'
  const tipoFixo = funcionario ? 'DESPESA' : filtroInicial
  const [modal, setModal] = useState(params.get('novo') === '1')
  const [mensagem, setMensagem] = useState('')
  const [tipoFormulario, setTipoFormulario] = useState<TipoLancamento>(tipoFixo || 'RECEITA')
  const [categoriaFormulario, setCategoriaFormulario] = useState(tipoFixo === 'DESPESA' ? despesasVariaveis[0] : receitas[0])
  const [filtros, setFiltros] = useState({ mes: '2026-07', tipo: tipoFixo, veiculo: '', pesquisa: '' })

  const lista = useMemo(() => state.lancamentos
    .filter(item => item.data.startsWith(filtros.mes))
    .filter(item => !filtros.tipo || item.tipo === filtros.tipo)
    .filter(item => !filtros.veiculo || item.veiculoId === Number(filtros.veiculo))
    .filter(item => !filtros.pesquisa || `${item.descricao} ${item.categoria} ${item.protocolo ?? ''}`.toLowerCase().includes(filtros.pesquisa.toLowerCase()))
    .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id), [state.lancamentos, filtros])

  const categorias = tipoFormulario === 'RECEITA' ? receitas : [...despesasVariaveis, ...despesasFixas]
  const exigeVeiculo = ['Combustível', 'Manutenção', 'Km morto'].includes(categoriaFormulario)
  const total = lista.reduce((soma, item) => soma + (item.tipo === 'RECEITA' ? item.valor : -item.valor), 0)

  function mudarTipo(tipo: TipoLancamento) {
    setTipoFormulario(tipo)
    setCategoriaFormulario(tipo === 'RECEITA' ? receitas[0] : despesasVariaveis[0])
  }

  function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const formulario = new FormData(evento.currentTarget)
    const tipo = funcionario ? 'DESPESA' : tipoFormulario
    const categoria = String(formulario.get('categoria'))
    const classeCusto: ClasseCusto | undefined = tipo === 'DESPESA'
      ? (despesasFixas.includes(categoria) ? 'FIXO' : 'VARIAVEL')
      : undefined
    adicionarLancamento({
      tipo,
      categoria,
      descricao: String(formulario.get('descricao')),
      valor: Number(formulario.get('valor')),
      data: String(formulario.get('data')),
      veiculoId: formulario.get('veiculoId') ? Number(formulario.get('veiculoId')) : undefined,
      funcionarioId: formulario.get('funcionarioId') ? Number(formulario.get('funcionarioId')) : undefined,
      status: tipo === 'RECEITA'
        ? String(formulario.get('status')) as 'RECEBIDO' | 'A_RECEBER'
        : funcionario ? 'PENDENTE' : String(formulario.get('status')) as 'PAGO' | 'PENDENTE',
      origem: 'Manual',
      contratanteFonte: tipo === 'RECEITA'
        ? String(formulario.get('contratanteFonte')) as 'Porto Seguro' | 'Outra seguradora' | 'Cliente particular' | 'Empresa contratante' | 'Outros'
        : undefined,
      classeCusto,
      protocolo: String(formulario.get('protocolo') || '') || undefined,
      litros: categoria === 'Combustível' && formulario.get('litros') ? Number(formulario.get('litros')) : undefined,
    })
    setModal(false)
    setMensagem(funcionario ? 'Despesa enviada para conferência do administrador.' : 'Lançamento salvo. O dashboard e a DRE já foram atualizados.')
  }

  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">{tipoFixo === 'RECEITA' ? 'Entradas' : tipoFixo === 'DESPESA' ? 'Saídas' : 'Financeiro operacional'}</span>
      <h1>{tipoFixo === 'RECEITA' ? 'Receitas' : tipoFixo === 'DESPESA' ? 'Despesas' : 'Entradas e saídas'}</h1>
      <p>{funcionario ? 'Registre despesas e custos do veículo; o administrador fará a conferência.' : 'Cadastre uma vez, vincule à operação e acompanhe o efeito em todo o sistema.'}</p></div>
      <div className="heading-total-with-action"><span><small>Saldo filtrado</small><strong className={total >= 0 ? 'positive' : 'negative'}>{moeda(total)}</strong></span>
        <button className="button button-primary" onClick={() => setModal(true)}>+ {tipoFixo === 'DESPESA' ? 'Registrar despesa' : tipoFixo === 'RECEITA' ? 'Nova receita' : 'Nova entrada ou saída'}</button></div>
    </header>
    {mensagem ? <div className="success-notice">{mensagem}</div> : null}
    <section className="panel">
      <div className="ledger-filters">
        <label><span>Competência</span><input type="month" value={filtros.mes} onChange={evento => setFiltros(atual => ({ ...atual, mes: evento.target.value }))}/></label>
        {!tipoFixo ? <label><span>Tipo</span><select value={filtros.tipo} onChange={evento => setFiltros(atual => ({ ...atual, tipo: evento.target.value as '' | TipoLancamento }))}><option value="">Todos</option><option value="RECEITA">Receitas</option><option value="DESPESA">Despesas</option></select></label> : null}
        <label><span>Veículo</span><select value={filtros.veiculo} onChange={evento => setFiltros(atual => ({ ...atual, veiculo: evento.target.value }))}><option value="">Todos</option>{state.veiculos.map(item => <option value={item.id} key={item.id}>{item.codigo}</option>)}</select></label>
        <label className="filter-grow"><span>Buscar</span><input placeholder="Descrição, categoria ou protocolo" value={filtros.pesquisa} onChange={evento => setFiltros(atual => ({ ...atual, pesquisa: evento.target.value }))}/></label>
      </div>
      <div className="table-scroll"><table><thead><tr><th>Data</th><th>Entrada ou saída</th><th>Categoria</th><th>Veículo</th><th>Contratante / Fonte</th><th>Situação</th><th>Valor</th><th/></tr></thead>
        <tbody>{lista.map(item => {
          const veiculo = state.veiculos.find(veiculoItem => veiculoItem.id === item.veiculoId)
          return <tr key={item.id}><td>{data(item.data)}</td><td><strong>{item.descricao}</strong><small>{item.protocolo ?? (item.tipo === 'RECEITA' ? 'Entrada' : item.classeCusto === 'FIXO' ? 'Custo fixo' : 'Custo variável')}</small></td>
            <td>{item.categoria}</td><td>{veiculo?.codigo ?? '—'}</td><td>{item.contratanteFonte ?? '—'}</td><td><span className={`ledger-status ledger-${item.status.toLowerCase()}`}>{item.status.replace('_', ' ')}</span></td>
            <td className={item.tipo === 'RECEITA' ? 'positive' : 'negative'}><strong>{item.tipo === 'RECEITA' ? '+' : '−'} {moeda(item.valor)}</strong></td>
            <td>{item.status === 'A_RECEBER' ? <button className="table-action" onClick={() => atualizarStatusLancamento(item.id, 'RECEBIDO')}>Receber</button> : item.status === 'PENDENTE' && !funcionario ? <button className="table-action" onClick={() => atualizarStatusLancamento(item.id, 'PAGO')}>Aprovar</button> : null}</td></tr>
        })}</tbody></table></div>
    </section>

    {modal ? <div className="modal-backdrop"><section className="modal modal-financial" role="dialog" aria-modal="true" aria-labelledby="titulo-lancamento"><header><div><span className="eyebrow">Novo registro financeiro</span><h2 id="titulo-lancamento">Novo lançamento</h2></div><button aria-label="Fechar" onClick={() => setModal(false)}>×</button></header>
      <form onSubmit={salvar} className="form-grid two-columns">
        {!tipoFixo && !funcionario ? <div className="segmented field-wide"><button type="button" className={tipoFormulario === 'RECEITA' ? 'active' : ''} onClick={() => mudarTipo('RECEITA')}>Receita</button><button type="button" className={tipoFormulario === 'DESPESA' ? 'active' : ''} onClick={() => mudarTipo('DESPESA')}>Despesa</button></div> : null}
        <label className="field field-wide"><span>Descrição</span><input name="descricao" placeholder="Ex.: atendimento Porto Seguro lote 092" required/></label>
        <label className="field"><span>Valor</span><input name="valor" type="number" min=".01" step=".01" required/></label>
        <label className="field"><span>Categoria</span><select name="categoria" value={categoriaFormulario} onChange={evento => setCategoriaFormulario(evento.target.value)}>{categorias.map(categoria => <option key={categoria}>{categoria}</option>)}</select></label>
        <label className="field"><span>Data</span><input name="data" type="date" defaultValue="2026-07-24" required/></label>
        <label className="field"><span>Situação</span><select name="status" disabled={funcionario}>{tipoFormulario === 'RECEITA' ? <><option value="RECEBIDO">Recebido</option><option value="A_RECEBER">A receber</option></> : <><option value="PAGO">Pago</option><option value="PENDENTE">Pendente</option></>}</select></label>
        <label className="field"><span>Veículo{exigeVeiculo ? ' *' : ''}</span><select name="veiculoId" required={exigeVeiculo}><option value="">Não vinculado</option>{state.veiculos.map(item => <option value={item.id} key={item.id}>{item.codigo} · {item.modelo}</option>)}</select></label>
        <label className="field"><span>Responsável</span><select name="funcionarioId"><option value="">Não vinculado</option>{state.funcionarios.map(item => <option value={item.id} key={item.id}>{item.nome}</option>)}</select></label>
        {tipoFormulario === 'RECEITA' ? <label className="field"><span>Contratante / Fonte</span><select name="contratanteFonte" required><option>Porto Seguro</option><option>Outra seguradora</option><option>Cliente particular</option><option>Empresa contratante</option><option>Outros</option></select></label> : null}
        <label className="field"><span>Protocolo ou referência</span><input name="protocolo" placeholder="Opcional"/></label>
        {categoriaFormulario === 'Combustível' ? <label className="field"><span>Litros abastecidos</span><input name="litros" type="number" min="0" step=".01"/></label> : null}
        <div className="modal-actions field-wide"><button className="button button-ghost" type="button" onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary">Salvar lançamento</button></div>
      </form>
    </section></div> : null}
  </div>
}
