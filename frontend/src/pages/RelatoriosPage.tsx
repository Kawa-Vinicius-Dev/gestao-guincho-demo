import { useState } from 'react'
import { resultadoPorVeiculo } from '../demo/calculos'
import { useDemo } from '../demo/DemoContext'

function csv(linhas: Array<Array<string | number>>) {
  return linhas.map(linha => linha.map(celula => `"${String(celula).replaceAll('"', '""')}"`).join(';')).join('\n')
}
function baixar(nome: string, linhas: Array<Array<string | number>>) {
  const url = URL.createObjectURL(new Blob([`\ufeff${csv(linhas)}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${nome}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

const cards = [
  ['lancamentos', 'Entradas e saídas', 'Todos os movimentos financeiros do período.'],
  ['resultado', 'Resultado por veículo', 'Receita, despesas, lucro, margem e quilometragem.'],
  ['despesas', 'Despesas por categoria', 'Base para entender onde a operação mais gasta.'],
  ['quilometragem', 'Quilometragem e km morto', 'Percurso total, improdutivo e custo calculado.'],
  ['recebiveis', 'Contas a receber', 'Valores faturados que ainda não entraram no caixa.'],
] as const

export default function RelatoriosPage() {
  const { state } = useDemo()
  const [mes, setMes] = useState('2026-07')
  function exportar(tipo: typeof cards[number][0]) {
    if (tipo === 'lancamentos') baixar(`lancamentos-${mes}`, [['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Veículo', 'Funcionário', 'Status', 'Origem'], ...state.lancamentos.filter(item => item.data.startsWith(mes)).map(item => [item.data, item.tipo, item.categoria, item.descricao, item.valor, state.veiculos.find(v => v.id === item.veiculoId)?.codigo ?? '', state.funcionarios.find(f => f.id === item.funcionarioId)?.nome ?? '', item.status, item.origem])])
    if (tipo === 'resultado') baixar(`resultado-veiculos-${mes}`, [['Veículo', 'Receita', 'Despesas', 'Lucro', 'Margem (%)', 'Km rodado', 'Km morto'], ...resultadoPorVeiculo(state, mes).map(item => [item.veiculo.codigo, item.receita, item.despesas, item.lucro, item.margem.toFixed(2), item.kmRodado, item.kmMorto])])
    if (tipo === 'despesas') baixar(`despesas-${mes}`, [['Data', 'Categoria', 'Descrição', 'Valor', 'Veículo'], ...state.lancamentos.filter(item => item.tipo === 'DESPESA' && item.data.startsWith(mes)).map(item => [item.data, item.categoria, item.descricao, item.valor, state.veiculos.find(v => v.id === item.veiculoId)?.codigo ?? ''])])
    if (tipo === 'quilometragem') baixar(`quilometragem-${mes}`, [['Data', 'Veículo', 'Km rodado', 'Km morto', 'Custo/km', 'Custo morto', 'Motivo'], ...state.quilometragens.filter(item => item.data.startsWith(mes)).map(item => [item.data, state.veiculos.find(v => v.id === item.veiculoId)?.codigo ?? '', item.kmRodado, item.kmMorto, item.custoPorKm, item.kmMorto * item.custoPorKm, item.motivo])])
    if (tipo === 'recebiveis') baixar(`recebiveis-${mes}`, [['Data', 'Descrição', 'Valor', 'Veículo', 'Origem'], ...state.lancamentos.filter(item => item.tipo === 'RECEITA' && item.status === 'A_RECEBER' && item.data.startsWith(mes)).map(item => [item.data, item.descricao, item.valor, state.veiculos.find(v => v.id === item.veiculoId)?.codigo ?? '', item.origem])])
  }
  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Análise e prestação de contas</span><h1>Relatórios</h1><p>Exporte bases prontas para conferência ou imprima as telas gerenciais.</p></div><div className="heading-actions"><label className="month-picker"><span>Competência</span><input type="month" value={mes} onChange={evento => setMes(evento.target.value)}/></label><button className="button button-ghost" onClick={() => window.print()}>Imprimir página</button></div></header>
    <section className="report-grid report-grid-v2">{cards.map(([tipo, titulo, descricao]) => <article className="panel" key={tipo}><span className="report-file">CSV</span><div><h2>{titulo}</h2><p>{descricao}</p></div><button className="button button-ghost" onClick={() => exportar(tipo)}>Exportar relatório</button></article>)}</section>
  </div>
}
