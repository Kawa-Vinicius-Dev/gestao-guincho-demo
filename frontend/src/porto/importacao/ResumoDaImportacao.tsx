import { Link } from 'react-router-dom'
import type { ConfirmacaoPorto } from '../../types/modelos'
import { data, moeda } from '../../utils/formatadores'

/**
 * O que a importacao mudou, com o caminho para o que pede acao (Kawa,
 * 23/09/2026): "43 OS novas, 12 conferidas com a OP, 3 sem socorrista -> ver
 * pendencias". Antes era uma frase so, e o proximo passo ficava por conta de
 * quem lia. Cada linha so aparece quando ha o que contar.
 */
export function ResumoDaImportacao({ r, numeroOp, diario = false }: {
  r: ConfirmacaoPorto; numeroOp?: string
  /** Veio da tela do Diario: as OS entram sem valor e aparecem no calendario. */
  diario?: boolean
}) {
  const daOp = r.tipo === 'OS_VINCULADAS' || r.tipo === 'SERVICOS_GERAIS'
  const novos = r.novos ?? r.importados
  const linhas: { texto: string; link?: string; acao?: string; atencao?: boolean }[] = [
    // OP: quantas vieram nela, e quantas eram novas x ja estavam no Diario.
    ...(numeroOp ? [
      { texto: `${r.importados} OS nesta OP`, link: `/porto/ordens-servico?op=${encodeURIComponent(numeroOp)}`, acao: 'ver as OS da OP' },
      ...(novos && r.atualizados ? [{ texto: `${novos} ${novos === 1 ? 'nova' : 'novas'}` }] : []),
      ...(r.atualizados ? [{ texto: `${r.atualizados} já ${r.atualizados === 1 ? 'estava' : 'estavam'} no Diário e ${r.atualizados === 1 ? 'foi conferida' : 'foram conferidas'} com a OP` }] : []),
    ] : diario
      ? [{ texto: `${novos} ${novos === 1 ? 'OS nova' : 'OS novas'}`, link: '/porto/diario', acao: 'ver no calendário' }]
      : [{ texto: `${r.importados} ${r.importados === 1 ? 'registro importado' : 'registros importados'}` }]),
    ...(r.ignorados ? [{ texto: `${r.ignorados} já ${r.ignorados === 1 ? 'existia' : 'existiam'} e ${r.ignorados === 1 ? 'ficou' : 'ficaram'} como ${r.ignorados === 1 ? 'estava' : 'estavam'}` }] : []),
    ...(r.osSemSocorrista?.length ? [{ texto: `${r.osSemSocorrista.length} sem socorrista`, link: '/porto/pendencias?filtro=SOCORRISTA', acao: 'resolver nas pendências', atencao: true }] : []),
    ...(r.naoEncontradas?.length ? [{ texto: `${r.naoEncontradas.length} do Diário não ${r.naoEncontradas.length === 1 ? 'veio' : 'vieram'} nesta OP`, link: '/porto/ordens-servico?situacao=AGUARDANDO_PROXIMA_OP&competencia=1', acao: 'ver as que aguardam a próxima OP', atencao: true }] : []),
    ...(r.divergentes?.length ? [{ texto: `${r.divergentes.length} com valor diferente do informado`, link: '/porto/ordens-servico?situacao=DIVERGENTE&competencia=1', acao: 'conferir', atencao: true }] : []),
    ...(r.viaturasNovas?.length ? [{ texto: `${r.viaturasNovas.length === 1 ? 'Viatura nova cadastrada' : 'Viaturas novas cadastradas'}: ${r.viaturasNovas.join(', ')}`, link: '/veiculos', acao: 'completar o cadastro' }] : []),
  ]
  return <section className="resumo-importacao" role="status" aria-label="Resumo da importação">
    <header>
      <strong>Importação concluída</strong>
      {daOp ? <span>{r.receitasCriadas} {r.receitasCriadas === 1 ? 'receita criada' : 'receitas criadas'}{r.receitasAtualizadas ? ` · ${r.receitasAtualizadas} ${r.receitasAtualizadas === 1 ? 'atualizada' : 'atualizadas'}` : ''} · {moeda(r.valorTotalRecebido)} recebidos{r.quinzena ? ` · período ${r.quinzena}` : ''}{r.dataPagamento ? ` · pagamento em ${data(r.dataPagamento)}` : ''}</span>
        : diario ? <span>Os valores entram quando a OP chegar.</span> : null}
    </header>
    <ul>{linhas.map(l => <li key={l.texto} className={l.atencao ? 'atencao' : undefined}>
      <span>{l.texto}</span>
      {l.link ? <Link to={l.link}>{l.acao} →</Link> : null}
    </li>)}</ul>
  </section>
}
