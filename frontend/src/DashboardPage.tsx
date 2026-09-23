import { useEffect,useRef,useState } from 'react'
import { Link } from 'react-router-dom'
import { Carregando } from './components/EstadoPagina'
import { SeletorPeriodo } from './components/SeletorPeriodo'
import { CabecalhoPagina } from './components/ui/Pagina'
import { useAoVivo } from './dados/aoVivo'
import { dashboardEmCache, lerDashboard } from './dados/dashboard'
import { IndicadoresDaOperacao, PainelDeGastos, PainelDeKm, ResultadoDoPeriodo } from './dashboard/PaineisDoResultado'
import type { Dashboard, LancamentoFinanceiro } from './types/modelos'
import { listarTodasAsOs, type LinhaOs } from './dados/porto/listaOs'
import { lerExtrato } from './dados/extrato'
import { ServicosDoPeriodo } from './financeiro/dre/ServicosDoPeriodo'
import { DespesasDoPeriodo } from './financeiro/dre/DespesasDoPeriodo'
import { data } from './utils/formatadores'
import { usePeriodoGlobal } from './utils/periodoGlobal'
import { porCompetenciaDaOp } from './utils/modoDoPeriodo'

/**
 * Visao geral: o painel principal do sistema.
 *
 * Segue a forma do painel Porto. O lucro domina, receitas e despesas
 * ficam ao lado; a barra diz o que a operacao ainda deve; os graficos dizem quem
 * trouxe o dinheiro e para onde ele foi. Km so aparece quando ha km registrado.
 */


export default function DashboardPage(){
  // O periodo e o do sistema inteiro: trocar aqui troca nas outras telas.
  const [periodo,setPeriodo]=usePeriodoGlobal()
  const {inicio,fim}=periodo
  const [financeiro,setFinanceiro]=useState<Dashboard|null>(null)
  const [erro,setErro]=useState('')
  // Enquanto revalida, a tela fica de pe com os numeros de antes em vez de
  // piscar o esqueleto a cada troca de periodo.
  const [atualizando,setAtualizando]=useState(false)
  // Uma despesa, uma OP ou uma comissao mudou em qualquer lugar: a tela consulta
  // de novo, mantendo os numeros de agora ate os novos chegarem.
  const [versao,setVersao]=useState(0)
  // Servicos e despesas pela data em que aconteceram (Kawa, 23/09/2026: filtrando
  // um dia, "quero todos os servicos e todas as despesas nesse dia"). O resumo de
  // dinheiro continua pela OP. As listas seguem o filtro: periodo da OP pela
  // competencia; Mes e De-ate pela data do servico e do lancamento.
  const [servicos,setServicos]=useState<LinhaOs[]|null>(null)
  const [lancamentos,setLancamentos]=useState<LancamentoFinanceiro[]>([])
  useEffect(()=>{const {inicio,fim}=periodo;if(!inicio||!fim||inicio>fim)return
    let valeu=true;setServicos(null)
    Promise.all([listarTodasAsOs({inicio,fim,porCompetencia:porCompetenciaDaOp(periodo)}).then(p=>p.itens as LinhaOs[]|null).catch(()=>null),lerExtrato(inicio,fim).catch(()=>[] as LancamentoFinanceiro[])])
      .then(([s,l])=>{if(valeu){setServicos(s);setLancamentos(l)}})
    return()=>{valeu=false}},[periodo.inicio,periodo.fim,periodo.op,versao])
  useAoVivo(()=>setVersao(v=>v+1))
  const periodoCarregado=useRef('')
  const periodoValido=Boolean(inicio&&fim&&inicio<=fim)
  const avisoPeriodo=!inicio||!fim
    ? 'Informe a data inicial e a data final para consultar o período.'
    : inicio>fim?'A data inicial precisa ser anterior ou igual à data final.':''

  useEffect(()=>{
    if(!inicio||!fim||inicio>fim){
      setFinanceiro(null);setErro('');setAtualizando(false);return
    }
    let valeu=true
    const guardado=dashboardEmCache(inicio,fim)
    const mesmoPeriodo=periodoCarregado.current===`${inicio}|${fim}`
    periodoCarregado.current=`${inicio}|${fim}`
    if(guardado){setFinanceiro(guardado.financeiro);setAtualizando(true)}
    else if(mesmoPeriodo)setAtualizando(true)
    else setFinanceiro(null)
    setErro('')
    lerDashboard(inicio,fim)
      .then(r=>{if(valeu)setFinanceiro(r.financeiro)})
      .catch(e=>{if(valeu)setErro(e.message)})
      .finally(()=>{if(valeu)setAtualizando(false)})
    return()=>{valeu=false}
  },[inicio,fim,versao])


  const temKm=Boolean(financeiro&&(financeiro.kmRemunerado||financeiro.kmMorto))

  return <div className="page-enter dashboard-tech painel-visao">
    <CabecalhoPagina
      modulo="Financeiro"
      titulo="Visão geral"
      descricao="Lucro, receitas e despesas do período."
      contexto={periodoValido
        ? <>Período selecionado: <strong>{data(inicio)}</strong> → <strong>{data(fim)}</strong></>
        : undefined}
      acoes={<Link className="button button-primary" to="/despesas?novo=1">+ Registrar despesa</Link>}/>

    {avisoPeriodo
      ? <div className="form-alert" role="alert">{avisoPeriodo}</div>
      : erro
      ? <div className="form-alert" role="alert">
          Não foi possível carregar todos os indicadores oficiais. {erro}
        </div>
      : null}

    <section className="panel destaque" aria-label="Resultado do período">
      <form className="destaque-periodo destaque-periodo-sem-botao" onSubmit={e=>e.preventDefault()}>
        <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/>
      </form>

      {periodoValido&&financeiro
        ? <ResultadoDoPeriodo dados={financeiro} atualizando={atualizando}/>
        : periodoValido
        ? erro
          ? <div className="loading-card" role="alert">
              <span className="page-state-text">Não foi possível carregar os indicadores deste período.</span>
            </div>
          : <Carregando card />
        : null}
    </section>

    {periodoValido&&financeiro
      ? <>
          <IndicadoresDaOperacao dados={servicos&&!porCompetenciaDaOp(periodo)?{...financeiro,servicosDoPeriodo:servicos.length}:financeiro}/>

          {temKm
            ? <div className="grade-painel grade-8-4">
                <PainelDeGastos dados={financeiro} inicio={inicio} fim={fim}/>
                <PainelDeKm dados={financeiro}/>
              </div>
            : <PainelDeGastos dados={financeiro} inicio={inicio} fim={fim}/>}

          {/* No lugar do faturamento por socorrista e viatura (que ja esta no Painel
              Porto e em Desempenho): os servicos e as despesas do periodo, para a
              analise do dia. */}
          {periodo.inicio&&periodo.fim?<ServicosDoPeriodo inicio={periodo.inicio} fim={periodo.fim} porCompetencia={porCompetenciaDaOp(periodo)} servicos={servicos}/>:null}
          <DespesasDoPeriodo lancamentos={lancamentos}/>
        </>
      : null}

    <p className="calculation-note">
      <strong>Como calculamos:</strong> lucro = receitas − despesas pagas. Serviço da Porto
      conta no período da OP; comissão vira despesa quando é paga.
    </p>
  </div>
}
