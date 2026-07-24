import { useDemo } from '../demo/DemoContext'
import { data } from '../utils/formatadores'

const status = { CONFIRMADA: 'Confirmada', PLANTAO: 'Plantão', FOLGA: 'Folga' }
const turno = { DIURNO: '07h às 19h', NOTURNO: '19h às 07h', COMERCIAL: '08h às 17h' }

export default function EscalaPage() {
  const { state } = useDemo()
  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Semana de 20 a 26 de julho</span><h1>Escala operacional</h1><p>Uma visão simples da cobertura por funcionário, veículo e turno.</p></div><button className="button button-ghost" onClick={() => window.print()}>Imprimir escala</button></header>
    <section className="schedule-strip">
      <div><span>Em operação</span><strong>{state.escala.filter(item => item.status !== 'FOLGA').length}</strong><small>turnos cobertos</small></div>
      <div><span>Plantões</span><strong>{state.escala.filter(item => item.status === 'PLANTAO').length}</strong><small>turnos noturnos</small></div>
      <div><span>Veículos escalados</span><strong>{new Set(state.escala.map(item => item.veiculoId)).size}</strong><small>na semana</small></div>
    </section>
    <section className="panel schedule-table"><div className="table-scroll"><table><thead><tr><th>Dia</th><th>Funcionário</th><th>Veículo</th><th>Turno</th><th>Status</th></tr></thead>
      <tbody>{state.escala.map(item => <tr key={item.id}><td><strong>{data(item.dia)}</strong><small>{new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(new Date(`${item.dia}T12:00:00`))}</small></td>
        <td><strong>{state.funcionarios.find(funcionario => funcionario.id === item.funcionarioId)?.nome}</strong></td>
        <td><span className="vehicle-chip">{state.veiculos.find(veiculo => veiculo.id === item.veiculoId)?.codigo}</span></td>
        <td>{turno[item.turno]}</td><td><span className={`schedule-status schedule-${item.status.toLowerCase()}`}>{status[item.status]}</span></td></tr>)}</tbody>
    </table></div></section>
  </div>
}
