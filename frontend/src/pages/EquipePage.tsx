import { useState, type FormEvent } from 'react'
import { useDemo } from '../demo/DemoContext'
import { moeda } from '../utils/formatadores'

const rotuloStatus = { EM_SERVICO: 'Em serviço', DISPONIVEL: 'Disponível', FOLGA: 'Folga' }

export default function EquipePage() {
  const { state, adicionarFuncionario } = useDemo()
  const [modal, setModal] = useState(false)

  function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const form = new FormData(evento.currentTarget)
    adicionarFuncionario({
      nome: String(form.get('nome')),
      funcao: String(form.get('funcao')),
      veiculoId: form.get('veiculoId') ? Number(form.get('veiculoId')) : undefined,
      status: 'DISPONIVEL',
      metaReceita: Number(form.get('metaReceita')),
      metaKmMorto: Number(form.get('metaKmMorto')),
      metaMargem: Number(form.get('metaMargem')),
    })
    setModal(false)
  }

  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Operação e desempenho</span><h1>Funcionários</h1><p>Veículo principal, metas e volume de registros de cada pessoa da equipe.</p></div><button className="button button-primary" onClick={() => setModal(true)}>+ Cadastrar funcionário</button></header>
    <section className="team-grid">{state.funcionarios.map(funcionario => {
      const veiculo = state.veiculos.find(item => item.id === funcionario.veiculoId)
      const lancamentos = state.lancamentos.filter(item => item.funcionarioId === funcionario.id && item.data.startsWith('2026-07'))
      const receita = lancamentos.filter(item => item.tipo === 'RECEITA').reduce((soma, item) => soma + item.valor, 0)
      const progresso = funcionario.metaReceita ? Math.min(100, (receita / funcionario.metaReceita) * 100) : 0
      return <article className="panel team-card" key={funcionario.id}>
        <header><span className="team-avatar">{funcionario.nome.split(' ').map(parte => parte[0]).slice(0, 2).join('')}</span><span><strong>{funcionario.nome}</strong><small>{funcionario.funcao}</small></span><span className={`staff-status staff-${funcionario.status.toLowerCase()}`}>{rotuloStatus[funcionario.status]}</span></header>
        <div className="team-vehicle"><span>Veículo principal</span><strong>{veiculo ? `${veiculo.codigo} · ${veiculo.modelo}` : 'Não definido'}</strong></div>
        <div className="goal-line"><span><small>Meta de faturamento</small><strong>{moeda(receita)} <i>/ {moeda(funcionario.metaReceita)}</i></strong></span><b>{progresso.toFixed(0)}%</b></div>
        <div className="progress-track"><span style={{ width: `${progresso}%` }}/></div>
        <footer><span><strong>{lancamentos.length}</strong><small>lançamentos</small></span><span><strong>{funcionario.metaKmMorto}%</strong><small>meta km morto</small></span><span><strong>{funcionario.metaMargem}%</strong><small>meta margem</small></span></footer>
      </article>
    })}</section>

    {modal ? <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Equipe</span><h2>Novo funcionário</h2></div><button aria-label="Fechar" onClick={() => setModal(false)}>×</button></header>
      <form onSubmit={salvar} className="form-grid two-columns">
        <label className="field field-wide"><span>Nome</span><input name="nome" required/></label>
        <label className="field"><span>Função</span><input name="funcao" placeholder="Motorista de guincho" required/></label>
        <label className="field"><span>Veículo principal</span><select name="veiculoId"><option value="">Não definido</option>{state.veiculos.map(item => <option value={item.id} key={item.id}>{item.codigo}</option>)}</select></label>
        <label className="field"><span>Meta de faturamento</span><input name="metaReceita" type="number" min="0" defaultValue="18000" required/></label>
        <label className="field"><span>Meta máx. km morto (%)</span><input name="metaKmMorto" type="number" min="0" max="100" defaultValue="12" required/></label>
        <label className="field"><span>Meta de margem (%)</span><input name="metaMargem" type="number" min="0" max="100" defaultValue="30" required/></label>
        <div className="modal-actions field-wide"><button type="button" className="button button-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary">Salvar funcionário</button></div>
      </form></section></div> : null}
  </div>
}
