import { useEffect,useState } from 'react'
import { Link } from 'react-router-dom'
import { Campo } from './components/Campos'
import { CabecalhoPagina } from './components/ui/Pagina'
import { dashboardEmCache, lerDashboard } from './dados/dashboard'
import { IndicadoresDaOperacao, PainelDeGastos, PainelDeKm, PainelFaturamentoPorSocorrista,
  PainelFaturamentoPorViatura, ResultadoDoPeriodo } from './dashboard/PaineisDoResultado'
import type { Dashboard } from './types/modelos'
import { data } from './utils/formatadores'

/**
 * Visao geral: o painel principal do sistema.
 *
 * Segue a forma do painel Porto. O lucro domina, receitas e despesas
 * ficam ao lado; a barra diz o que a operacao ainda deve; os graficos dizem quem
 * trouxe o dinheiro e para onde ele foi. Km so aparece quando ha km registrado.
 */

/** Abre no mes corrente, que e o recorte mais pedido; a partir dai o periodo e livre. */
function mesCorrente(){const d=new Date(),mes=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  return {inicio:`${mes}-01`,fim:`${mes}-${String(new Date(d.getFullYear(),d.getMonth()+1,0).getDate()).padStart(2,'0')}`}}

export default function DashboardPage(){
  const [{inicio,fim},setPeriodo]=useState(mesCorrente)
  const [financeiro,setFinanceiro]=useState<Dashboard|null>(null)
  const [erro,setErro]=useState('')
  // Enquanto revalida, a tela fica de pe com os numeros de antes em vez de
  // piscar o esqueleto a cada troca de periodo.
  const [atualizando,setAtualizando]=useState(false)
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
    if(guardado){setFinanceiro(guardado.financeiro);setAtualizando(true)}
    else setFinanceiro(null)
    setErro('')
    lerDashboard(inicio,fim)
      .then(r=>{if(valeu)setFinanceiro(r.financeiro)})
      .catch(e=>{if(valeu)setErro(e.message)})
      .finally(()=>{if(valeu)setAtualizando(false)})
    return()=>{valeu=false}
  },[inicio,fim])

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
      <form className="destaque-periodo destaque-periodo-datas" onSubmit={e=>e.preventDefault()}>
        <Campo rotulo="De">
          <input aria-label="Data inicial" type="date" value={inicio} max={fim||undefined}
            onChange={e=>setPeriodo(p=>({...p,inicio:e.target.value}))}/>
        </Campo>
        <Campo rotulo="Até">
          <input aria-label="Data final" type="date" value={fim} min={inicio||undefined}
            onChange={e=>setPeriodo(p=>({...p,fim:e.target.value}))}/>
        </Campo>
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
