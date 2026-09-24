import { useState } from 'react'
import { baixarRelatorioPorto, relatorioOperacional } from '../dados/porto'
import { baixarExcel, baixarPdfMontado, folhasDoPdf, montarPdf } from '../dados/exportar'
import { ConfirmarAcao } from '../components/ConfirmarAcao'
import { hojeIso } from '../utils/formatadores'
import { Campo } from '../components/Campos'

/** "2026-09-23" deslocado em dias, sem fuso atrapalhar. */
function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Os periodos que o cliente mais pede, a um clique. */
function atalhos(hoje: string): { rotulo: string; inicio: string; fim: string }[] {
  const [ano, mes] = hoje.split('-').map(Number)
  const primeiro = (a: number, m: number) => `${a}-${String(m).padStart(2, '0')}-01`
  const inicioMes = primeiro(ano, mes)
  const inicioAnterior = mes === 1 ? primeiro(ano - 1, 12) : primeiro(ano, mes - 1)
  return [
    { rotulo: 'Hoje', inicio: hoje, fim: hoje },
    { rotulo: 'Ontem', inicio: somarDias(hoje, -1), fim: somarDias(hoje, -1) },
    { rotulo: 'Últimos 7 dias', inicio: somarDias(hoje, -6), fim: hoje },
    { rotulo: 'Este mês', inicio: inicioMes, fim: hoje },
    { rotulo: 'Mês passado', inicio: inicioAnterior, fim: somarDias(inicioMes, -1) },
  ]
}

function diasEntre(inicio: string, fim: string) {
  return Math.round((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86_400_000) + 1
}

export default function PortoRelatoriosPage() {
  const hoje = hojeIso()
  const [erro, setErro] = useState('')
  const [baixando, setBaixando] = useState('')
  const [inicio, setInicio] = useState(hoje)
  const [fim, setFim] = useState(hoje)
  const [pdfGrande, setPdfGrande] = useState<{ bytes: ArrayBuffer; nome: string; folhas: number; servicos: string } | null>(null)
  const periodoValido = Boolean(inicio && fim && inicio <= fim)
  const dias = periodoValido ? diasEntre(inicio, fim) : 0

  /**
   * Relatorio operacional (Kawa, 23/09/2026). O PDF e montado antes: se passar de
   * uma folha, a tela diz quantas e pergunta antes de baixar.
   */
  async function baixarOperacional(formato: 'excel' | 'pdf') {
    setErro(''); setBaixando('operacional-' + formato)
    try {
      const relatorio = await relatorioOperacional(inicio, fim)
      if (formato === 'excel') { await baixarExcel(relatorio); return }
      const bytes = await montarPdf(relatorio)
      const folhas = folhasDoPdf(bytes)
      if (folhas > 1) {
        setPdfGrande({ bytes, nome: relatorio.nomeArquivo, folhas,
          servicos: relatorio.resumo?.find(([r]) => r === 'Serviços')?.[1] ?? '' })
        return
      }
      baixarPdfMontado(bytes, relatorio.nomeArquivo)
    }
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
      <article className="relatorio-operacional">
        <h2>Relatório operacional</h2>
        <p>Controle dos serviços prestados: OS, data, especialidade, socorrista, viatura e situação, pela data do atendimento. Sem valores. As canceladas aparecem marcadas e contadas à parte.</p>
        <div className="atalhos-periodo" role="group" aria-label="Atalhos de período">
          {atalhos(hoje).map(a =>
            <button key={a.rotulo} type="button"
              className={`atalho-periodo${a.inicio === inicio && a.fim === fim ? ' esta-marcado' : ''}`}
              aria-pressed={a.inicio === inicio && a.fim === fim}
              onClick={() => { setInicio(a.inicio); setFim(a.fim) }}>{a.rotulo}</button>)}
        </div>
        <div className="heading-actions">
          <Campo rotulo="De">
            <input aria-label="Data inicial" type="date" value={inicio} max={fim || hoje} onChange={e => setInicio(e.target.value)}/>
          </Campo>
          <Campo rotulo="Até">
            <input aria-label="Data final" type="date" value={fim} min={inicio || undefined} max={hoje} onChange={e => setFim(e.target.value)}/>
          </Campo>
          <span className={`periodo-dias${periodoValido ? '' : ' invalido'}`}>
            {periodoValido ? `${dias} ${dias === 1 ? 'dia' : 'dias'}` : 'A data inicial passa da final'}
          </span>
        </div>
        <div className="heading-actions">
          <button className="button button-ghost" disabled={baixando !== '' || !periodoValido} onClick={() => void baixarOperacional('pdf')}>
            {baixando === 'operacional-pdf' ? 'Gerando PDF…' : 'Baixar PDF'}
          </button>
          <button className="button button-primary" disabled={baixando !== '' || !periodoValido} onClick={() => void baixarOperacional('excel')}>
            {baixando === 'operacional-excel' ? 'Gerando Excel…' : 'Baixar Excel'}
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

    {pdfGrande
      ? <ConfirmarAcao
          titulo="O PDF vai ter mais de uma folha"
          efeito={<>São {pdfGrande.servicos} serviços no período: o resumo fica na primeira folha e a lista continua nas seguintes, <strong>{pdfGrande.folhas} folhas</strong> no total.</>}
          avisos={['Para uma folha só, escolha um período menor. A DRE resume o mês inteiro em uma folha.']}
          textoConfirmar={`Baixar ${pdfGrande.folhas} folhas`}
          aoConfirmar={() => { baixarPdfMontado(pdfGrande.bytes, pdfGrande.nome); setPdfGrande(null) }}
          aoFechar={() => setPdfGrande(null)}
        />
      : null}
  </div>
}
