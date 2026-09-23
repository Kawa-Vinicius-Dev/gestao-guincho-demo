import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmarAcao, type PedidoConfirmacao } from '../../components/ConfirmarAcao'
import { Painel } from '../../components/ui/Pagina'
import { confirmarImportacaoPorto, criarPreviaConteudoPorto } from '../../dados/porto'
import { diasColados, LIMITE_DE_DIAS } from '../../dados/porto/diario'
import type { PreviaPorto } from '../../types/modelos'
import { data as dataBr } from '../../utils/formatadores'

/**
 * Importacao diaria: colar a consulta de servicos da Porto (o Diario).
 *
 * Kawa, 23/09/2026: o Diario Operacional ficava poluido com a colagem e o
 * calendario juntos. A colagem mora aqui, em Importar relatorios, ao lado da
 * importacao da OP; o Diario fica so com o calendario.
 *
 * Uma quinzena por vez (ate LIMITE_DE_DIAS dias): a consulta da Porto corta
 * intervalos maiores sem avisar. Os servicos entram sem valor; o valor vem na OP.
 */
export function ImportarDiario() {
  const [conteudo, setConteudo] = useState('')
  const [previa, setPrevia] = useState<PreviaPorto | null>(null)
  const [resumoColado, setResumoColado] = useState<{ inicio: string; fim: string; dias: number } | null>(null)
  const [erro, setErro] = useState(''), [mensagem, setMensagem] = useState('')
  const [carregando, setCarregando] = useState(false), [etapa, setEtapa] = useState('')
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)

  async function analisar() {
    if (!conteudo.trim()) return
    setCarregando(true); setEtapa('Lendo o Diário…'); setErro(''); setMensagem(''); setPrevia(null); setResumoColado(null)
    try {
      const colado = await diasColados(conteudo)
      if (colado.intervalo > LIMITE_DE_DIAS) {
        throw new Error(`A colagem cobre ${colado.intervalo} dias (${dataBr(colado.inicio)} a ${dataBr(colado.fim)}). `
          + `Cole no máximo ${LIMITE_DE_DIAS} dias por vez — uma quinzena: a consulta da Porto corta intervalos maiores sem avisar.`)
      }
      const lida = await criarPreviaConteudoPorto(conteudo)
      if (lida.tipo !== 'PAINEL_DIARIO') {
        throw new Error('Isto não é o Diário da Porto. Para importar uma OP, use a aba Ordem de pagamento.')
      }
      setPrevia(lida)
      setResumoColado({ inicio: colado.inicio, fim: colado.fim, dias: colado.dias.length })
    } catch (e) { setErro((e as Error).message) }
    finally { setEtapa(''); setCarregando(false) }
  }

  async function importar() {
    if (!previa) return
    setCarregando(true); setEtapa('Importando o Diário…'); setErro('')
    try {
      const r = await confirmarImportacaoPorto(previa)
      setMensagem(`${r.importados} ${r.importados === 1 ? 'serviço importado' : 'serviços importados'}`
        + `${r.ignorados ? ` · ${r.ignorados} já existiam` : ''}`
        + `${r.viaturasNovas?.length ? ` · ${r.viaturasNovas.length === 1 ? 'viatura nova cadastrada' : 'viaturas novas cadastradas'}: ${r.viaturasNovas.join(', ')}` : ''}`
        + '. Os valores entram quando a OP chegar.')
      // Gravou: o texto colado sai.
      setPrevia(null); setConteudo(''); setResumoColado(null)
    } catch (e) { setErro((e as Error).message) }
    finally { setEtapa(''); setCarregando(false) }
  }

  // Importar cria OS que passam a contar na producao e nas pendencias: pergunta antes.
  function pedirConfirmacao() {
    if (!previa || !resumoColado) return
    const novas = previa.linhas.filter(l => l.acao === 'IMPORTAR').length
    const existentes = previa.linhas.length - novas
    const semSocorrista = (previa.orfas ?? []).length
    setPedido({
      titulo: 'Importar o Diário?',
      efeito: <>Os serviços entram no sistema <strong>sem valor</strong>, aguardando a OP da Porto. Eles já contam na
        produção do socorrista e da viatura, e aparecem como pendentes de valor.</>,
      resumo: [
        ['Período colado', `${dataBr(resumoColado.inicio)} a ${dataBr(resumoColado.fim)}`],
        ['Dias', String(resumoColado.dias)],
        ['Serviços novos', String(novas)],
        ['Já existentes', String(existentes)],
      ],
      avisos: [
        semSocorrista
          ? <><strong>{semSocorrista}</strong> {semSocorrista === 1 ? 'serviço veio' : 'serviços vieram'} sem socorrista e {semSocorrista === 1 ? 'vai' : 'vão'} para o <strong>Auxiliar</strong>.</>
          : null,
      ],
      textoConfirmar: 'Sim, importar',
      aoConfirmar: importar,
    })
  }

  return <>
    <p className="importacao-explica">Cole a consulta de serviços da Porto, uma quinzena por vez (até {LIMITE_DE_DIAS} dias).
      Os serviços entram <strong>sem valor</strong>; o valor vem na OP. Veja os dias já importados no
      {' '}<Link to="/porto/diario">calendário do Diário</Link>.</p>
    {carregando ? <span role="status">{etapa}</span> : null}
    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
    {mensagem ? <div className="success-notice">{mensagem}</div> : null}
    <Painel etiqueta="Importação diária" titulo="Colar o Diário">
      <div className="porto-paste">
        <label className="field"><span>Consulta de serviços copiada da Porto</span>
          <textarea aria-label="Consulta de serviços copiada da Porto" rows={10} value={conteudo}
            onChange={e => { setConteudo(e.target.value); setPrevia(null); setMensagem('') }}
            placeholder="Cole aqui a consulta copiada com Ctrl+C"/>
        </label>
        <div className="porto-paste-actions">
          <button className="button button-ghost" type="button"
            onClick={() => { setConteudo(''); setPrevia(null); setResumoColado(null); setErro(''); setMensagem('') }}>Limpar</button>
          <button className="button button-primary" disabled={!conteudo.trim() || carregando} onClick={() => void analisar()}>
            {carregando ? 'Lendo…' : 'Analisar Diário'}
          </button>
        </div>
      </div>

      {previa && resumoColado ? <div className="porto-preview">
        <div className="porto-preview-summary">
          <span><strong>{resumoColado.dias}</strong> {resumoColado.dias === 1 ? 'dia' : 'dias'}</span>
          <span>de <strong>{dataBr(resumoColado.inicio)}</strong> a <strong>{dataBr(resumoColado.fim)}</strong></span>
          <span><strong>{previa.totalLinhas}</strong> serviços</span>
          <span><strong>{previa.linhas.filter(l => l.acao === 'IMPORTAR').length}</strong> novos</span>
        </div>
        {previa.erros.length ? <div className="form-alert"><strong>Confira a colagem.</strong> {previa.erros.join(' · ')}</div> : null}
        <div className="table-scroll porto-preview-table"><table>
          <thead><tr><th>OS</th><th>Especialidade</th><th>Viatura</th><th>Socorrista</th><th>Data</th><th>Situação</th></tr></thead>
          <tbody>{previa.linhas.map(l => <tr key={l.hashRegistro}>
            <td><strong>{l.dados.numero_os}</strong></td>
            <td>{l.dados.especialidade || '—'}</td>
            <td>{l.dados.sigla_viatura || '—'}</td>
            <td>{l.dados.socorrista || '—'}</td>
            <td>{dataBr(l.dados.data_atendimento)}</td>
            <td>{l.dados.situacao_porto || '—'}</td>
          </tr>)}</tbody>
        </table></div>
        <footer className="porto-confirm" aria-label="Ações da prévia">
          <button className="button button-primary" disabled={carregando || !previa.linhas.length} onClick={pedirConfirmacao}>
            Importar Diário
          </button>
        </footer>
      </div> : null}
    </Painel>

    {pedido ? <ConfirmarAcao {...pedido} aoFechar={() => setPedido(null)}/> : null}
  </>
}
