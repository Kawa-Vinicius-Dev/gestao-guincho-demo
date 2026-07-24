import { useState } from 'react'
import { useDemo } from '../demo/DemoContext'
import { dataHora, moeda } from '../utils/formatadores'

const colunas = ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Veículo', 'Funcionário', 'Km rodado', 'Km morto', 'Origem']
const previa = [
  { data: '24/07/2026', tipo: 'Receita', categoria: 'Porto Seguro', descricao: 'Lote importado Porto Seguro', valor: 2860, veiculo: 'G-01' },
  { data: '24/07/2026', tipo: 'Despesa', categoria: 'Combustível', descricao: 'Abastecimento importado', valor: 890, veiculo: 'G-02' },
  { data: '24/07/2026', tipo: 'Despesa', categoria: 'Pedágio', descricao: 'Pedágios importados', valor: 185, veiculo: 'G-03' },
]

function baixarModelo() {
  const conteudo = `${colunas.join(';')}\n24/07/2026;Receita;Serviços via Porto Seguro;Atendimento exemplo;1250;G-01;Anderson Ribeiro;86;12;Excel`
  const url = URL.createObjectURL(new Blob([`\ufeff${conteudo}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'modelo_importacao_gestao_guincho.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export default function ImportacoesPage() {
  const { state, importarExemplo } = useDemo()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [etapa, setEtapa] = useState<'selecao' | 'previa' | 'concluido'>('selecao')
  const [mensagem, setMensagem] = useState('')
  const nome = arquivo?.name ?? 'lancamentos_julho_2026.xlsx'

  function analisar() {
    setEtapa('previa')
    setMensagem('Arquivo validado. Confira as três linhas reconhecidas antes de importar.')
  }
  function importar() {
    const linhas = importarExemplo(nome)
    setEtapa('concluido')
    setMensagem(`${linhas} lançamentos importados. O dashboard, a DRE e os veículos já foram atualizados.`)
  }

  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Entrada em lote</span><h1>Importar planilha</h1><p>Simule o envio de Excel ou CSV e confira os lançamentos antes de adicioná-los ao financeiro.</p></div><button className="button button-ghost" onClick={baixarModelo}>Baixar planilha modelo</button></header>
    {mensagem ? <div className={etapa === 'concluido' ? 'success-notice' : 'import-notice'}>{mensagem}</div> : null}
    <section className="import-v2-layout">
      <div>
        <article className={`import-dropzone ${arquivo ? 'has-file' : ''}`}>
          <span className="sheet-icon">XLS</span><h2>{arquivo ? arquivo.name : 'Selecione a planilha de lançamentos'}</h2>
          <p>Formatos aceitos: .xlsx, .xls ou .csv · até 10 MB</p>
          <label className="button button-primary"><input type="file" accept=".xlsx,.xls,.csv" onChange={evento => { setArquivo(evento.target.files?.[0] ?? null); setEtapa('selecao'); setMensagem('') }}/>{arquivo ? 'Trocar arquivo' : 'Escolher arquivo'}</label>
          {!arquivo ? <button className="example-link" onClick={analisar}>Usar arquivo de exemplo da demo</button> : <button className="button button-ghost" onClick={analisar}>Validar e visualizar</button>}
        </article>
        <article className="panel accepted-columns"><header className="panel-title"><div><span className="eyebrow">Estrutura aceita</span><h2>Colunas da planilha</h2></div></header>
          <div>{colunas.map((coluna, indice) => <span key={coluna}><i>{String(indice + 1).padStart(2, '0')}</i>{coluna}</span>)}</div>
          <p>A origem pode ser Manual, Banco, Porto Seguro, Outra seguradora ou Excel. Combustível e manutenção devem conter um veículo válido.</p>
        </article>
      </div>
      <div>
        {etapa === 'selecao' ? <article className="panel import-empty"><span>↗</span><h2>A prévia aparecerá aqui</h2><p>Escolha um arquivo ou use o exemplo para demonstrar o fluxo de importação.</p></article> :
          <article className="panel import-preview-v2"><header className="panel-title"><div><span className="eyebrow">{etapa === 'concluido' ? 'Importação concluída' : 'Prévia do arquivo'}</span><h2>{nome}</h2></div><span className={`import-pill ${etapa}`}>{etapa === 'concluido' ? 'Importado' : '3 linhas válidas'}</span></header>
            <div className="table-scroll"><table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Veículo</th><th>Valor</th></tr></thead><tbody>{previa.map(item => <tr key={item.descricao}><td>{item.data}</td><td><span className={item.tipo === 'Receita' ? 'movement-in' : 'movement-out'}>{item.tipo}</span></td><td><strong>{item.descricao}</strong><small>{item.categoria}</small></td><td>{item.veiculo}</td><td className={item.tipo === 'Receita' ? 'positive' : 'negative'}>{moeda(item.valor)}</td></tr>)}</tbody></table></div>
            <footer><span><strong>3</strong><small>linhas prontas</small></span><span><strong>{moeda(2860)}</strong><small>receitas</small></span><span><strong>{moeda(1075)}</strong><small>despesas</small></span>
              {etapa !== 'concluido' ? <button className="button button-primary" onClick={importar}>Importar lançamentos</button> : <button className="button button-ghost" onClick={() => { setEtapa('selecao'); setArquivo(null); setMensagem('') }}>Importar outro arquivo</button>}</footer>
          </article>}
        <article className="panel import-history-v2"><header className="panel-title"><div><span className="eyebrow">Rastreabilidade</span><h2>Histórico de importações</h2></div></header>
          {state.importacoes.map(item => <div key={item.id}><span className="sheet-mini">XLS</span><span><strong>{item.arquivo}</strong><small>{dataHora(item.data)} · {item.linhas} linhas</small></span><span className="ledger-status ledger-recebido">{item.status === 'SIMULADO' ? 'Demo' : 'Importado'}</span></div>)}
        </article>
      </div>
    </section>
  </div>
}
