import { useEffect,useRef,useState } from 'react'
import { Link } from 'react-router-dom'
import { SeletorPeriodo } from './components/SeletorPeriodo'
import { CabecalhoPagina } from './components/ui/Pagina'
import { useAoVivo } from './dados/aoVivo'
import { dashboardEmCache, lerDashboard } from './dados/dashboard'
import { IndicadoresDaOperacao, PainelDeGastos, PainelDeKm, PainelFaturamentoPorSocorrista,
  PainelFaturamentoPorViatura, ResultadoDoPeriodo } from './dashboard/PaineisDoResultado'
import type { Dashboard } from './types/modelos'
import { data } from './utils/formatadores'
import { usePeriodoGlobal } from './utils/periodoGlobal'

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
        ? <div className="loading-card" role="status">
            {erro?'Não foi possível carregar os indicadores deste período.':'Carregando indicadores financeiros oficiais…'}
          </div>
        : null}
    </section>

    {periodoValido&&financeiro
      ? <>
          <IndicadoresDaOperacao dados={financeiro}/>

          {temKm
            ? <div className="grade-painel grade-8-4">
                <PainelDeGastos dados={financeiro} inicio={inicio} fim={fim}/>
                <PainelDeKm dados={financeiro}/>
              </div>
            : <PainelDeGastos dados={financeiro} inicio={inicio} fim={fim}/>}

          <div className="painel-faturamento">
            <PainelFaturamentoPorSocorrista dados={financeiro}/>
            <PainelFaturamentoPorViatura dados={financeiro}/>
          </div>
        </>
      : null}

    <p className="calculation-note">
      <strong>Como calculamos:</strong> lucro = receitas − despesas pagas. Serviço da Porto
      conta no período da OP; comissão vira despesa quando é paga.
    </p>
  </div>
}
