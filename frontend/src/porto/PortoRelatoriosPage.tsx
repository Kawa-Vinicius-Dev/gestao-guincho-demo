import { useState } from 'react'
import { baixarRelatorioDiarioPorto, baixarRelatorioPorto } from '../dados/porto'
import { hojeIso } from '../utils/formatadores'
import { Campo } from '../components/Campos'

export default function PortoRelatoriosPage() {
  const [erro, setErro] = useState('')
  const [baixando, setBaixando] = useState('')
  const [dia, setDia] = useState(hojeIso())

  /** O fechamento do dia da operacao: o que a equipe atendeu naquela data. */
  async function baixarDoDia(formato: 'excel' | 'pdf') {
    setErro(''); setBaixando('diario-' + formato)
    try { await baixarRelatorioDiarioPorto(dia, formato) }
    catch (e) { setErro((e as Error).message) } finally { setBaixando('') }
  }

  async function baixar(formato: 'excel' | 'pdf') {
    setErro(''); setBaixando(formato)
    try { await baixarRelatorioPorto(formato) }
    catch (e) { setErro((e as Error).message) } finally { setBaixando('') }
  }

  return <div className="page-enter">
    <header className="page-heading">
      <div>
        <span className="eyebrow">Porto Seguro</span>
        <h1>Relatórios Porto</h1>
        <p>Exportações gerenciais sem expor dados pessoais desnecessários.</p>
      </div>
    </header>

    {erro ? <div className="form-alert">{erro}</div> : null}

    <section className="panel report-actions">
      <article>
        <h2>Serviços prestados no dia</h2>
        <p>O fechamento da operação: serviços do dia com viatura, socorrista e valor, somados por socorrista e por especialidade. Serviço ainda sem preço aparece como "a precificar", não como R$ 0,00.</p>
        <div className="heading-actions">
          <Campo rotulo="Dia">
            <input type="date" value={dia} onChange={e => setDia(e.target.value)} max={hojeIso()}/>
          </Campo>
          <button className="button button-ghost" disabled={baixando !== '' || !dia} onClick={() => void baixarDoDia('pdf')}>
            {baixando === 'diario-pdf' ? 'Gerando PDF…' : 'Baixar PDF do dia'}
          </button>
          <button className="button button-primary" disabled={baixando !== '' || !dia} onClick={() => void baixarDoDia('excel')}>
            {baixando === 'diario-excel' ? 'Gerando Excel…' : 'Baixar Excel do dia'}
          </button>
        </div>
      </article>
      <article>
        <h2>Ordens de pagamento</h2>
        <p>Todas as OPs com período, serviços, valor e conciliação.</p>
        <div className="heading-actions">
          <button className="button button-ghost" disabled={baixando !== ''} onClick={() => void baixar('pdf')}>
            {baixando === 'pdf' ? 'Gerando PDF…' : 'Baixar PDF'}
          </button>
          <button className="button button-primary" disabled={baixando !== ''} onClick={() => void baixar('excel')}>
            {baixando === 'excel' ? 'Gerando Excel…' : 'Baixar Excel'}
          </button>
        </div>
      </article>
      <article>
        <h2>Relatório por OP</h2>
        <p>Abra uma ordem de pagamento e exporte sua composição individual em sete abas.</p>
      </article>
    </section>
  </div>
}
