import { useState } from 'react'
import { useDemo } from '../demo/DemoContext'

const integracoes = [
  { sigla: 'XLS', titulo: 'Importação de Excel', descricao: 'Envio em lote de receitas, despesas, veículos e quilometragem.', status: 'Disponível na demo', ativo: true },
  { sigla: 'PS', titulo: 'Relatório Porto Seguro', descricao: 'Preparado para receber relatórios em PDF, CSV ou Excel.', status: 'Próxima etapa' },
  { sigla: 'BK', titulo: 'Integração bancária', descricao: 'Conciliação de recebimentos e pagamentos com o extrato.', status: 'Planejado' },
  { sigla: 'PDF', titulo: 'Exportação PDF e Excel', descricao: 'Relatórios gerenciais prontos para envio e arquivo.', status: 'CSV disponível' },
  { sigla: 'APP', titulo: 'Aplicativo para funcionários', descricao: 'Lançamento de combustível, despesas e km direto da estrada.', status: 'Planejado' },
]

export default function IntegracoesPage() {
  const { restaurarDemo } = useDemo()
  const [mensagem, setMensagem] = useState('')
  function restaurar() {
    restaurarDemo()
    setMensagem('Dados fictícios originais restaurados. A demonstração está pronta para recomeçar.')
  }
  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Evolução do produto</span><h1>Integrações futuras</h1><p>A base já está organizada para receber novas fontes sem quebrar o fluxo financeiro atual.</p></div></header>
    {mensagem ? <div className="success-notice">{mensagem}</div> : null}
    <section className="integration-grid">{integracoes.map(item => <article className="panel integration-card" key={item.titulo}><span className="integration-icon">{item.sigla}</span><div><h2>{item.titulo}</h2><p>{item.descricao}</p></div><span className={item.ativo ? 'integration-ready' : ''}>{item.status}</span></article>)}</section>
    <section className="demo-reset"><div><span className="eyebrow">Ambiente de apresentação</span><h2>Recomeçar a demonstração</h2><p>Restaura lançamentos, frota, funcionários, metas e importações fictícias para o estado original.</p></div><button className="button button-ghost" onClick={restaurar}>Restaurar dados da demo</button></section>
  </div>
}
