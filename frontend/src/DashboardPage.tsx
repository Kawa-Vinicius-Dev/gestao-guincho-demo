import { useEffect,useRef,useState } from 'react'
import { Link } from 'react-router-dom'
import { Campo, Selecao } from './components/Campos'
import { CabecalhoPagina } from './components/ui/Pagina'
import { useAoVivo } from './dados/aoVivo'
import { dashboardEmCache, lerDashboard } from './dados/dashboard'
import { listarPeriodosDeOp } from './dados/porto'
import { IndicadoresDaOperacao, PainelDeGastos, PainelDeKm, PainelFaturamentoPorSocorrista,
  PainelFaturamentoPorViatura, ResultadoDoPeriodo } from './dashboard/PaineisDoResultado'
import type { Dashboard, OrdemPagamentoPorto } from './types/modelos'
import { data } from './utils/formatadores'
import { gravarFiltro, lerFiltro } from './utils/filtroLembrado'
import { rotuloOp } from './utils/periodos'

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
/**
 * O periodo escolhido sobrevive a ida e volta para outra tela.
 *
 * Quem abria um semestre aqui, ia registrar uma despesa e voltava, reencontrava
 * o mes corrente e refazia as duas datas a cada consulta — a tela remonta a cada
 * navegacao e o estado nascia do zero. O mes corrente continua sendo o padrao;
 * so a primeira visita da sessao e que o usa.
 */
type Periodo={inicio:string,fim:string,op?:string}
const periodoInicial=():Periodo=>lerFiltro<Periodo>('visao-geral',mesCorrente())

export default function DashboardPage(){
  const [{inicio,fim,op:opEscolhida=''},setPeriodo]=useState(periodoInicial)
  const [ops,setOps]=useState<OrdemPagamentoPorto[]>([])
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

  // Grava fora dos handlers das datas: assim nenhum caminho novo de troca de
  // periodo esquece de lembrar o que escolheu. Data pela metade nao vai para o
  // armazenamento — voltar para uma tela com "de" vazio e pior do que voltar
  // para o mes corrente.
  useEffect(()=>{if(inicio&&fim)gravarFiltro('visao-geral',{inicio,fim,op:opEscolhida})},[inicio,fim,opEscolhida])

  // Mesmo atalho do painel Porto: escolher a OP preenche as datas com o periodo
  // dela; mexer numa data volta para "Periodo personalizado". A lista e
  // conveniencia — se nao carregar, as datas continuam valendo.
  useEffect(()=>{listarPeriodosDeOp().then(setOps).catch(()=>setOps([]))},[])
  function escolherOp(id:string){
    const op=ops.find(o=>String(o.id)===id)
    if(!op){setPeriodo(p=>({...p,op:''}));return}
    setPeriodo({
      op:id,
      inicio:op.periodoInicio||op.dataPagamentoProgramada||inicio,
      fim:op.periodoFim||op.dataPagamentoProgramada||fim,
    })
  }

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
        <Selecao rotulo="Ordem de pagamento" vazio="Período personalizado" value={opEscolhida}
          onChange={e=>escolherOp(e.target.value)}
          opcoes={ops.map(o=>({valor:String(o.id),texto:rotuloOp(o)}))}/>
        <Campo rotulo="De">
          <input aria-label="Data inicial" type="date" value={inicio} max={fim||undefined}
            onChange={e=>setPeriodo(p=>({...p,op:'',inicio:e.target.value}))}/>
        </Campo>
        <Campo rotulo="Até">
          <input aria-label="Data final" type="date" value={fim} min={inicio||undefined}
            onChange={e=>setPeriodo(p=>({...p,op:'',fim:e.target.value}))}/>
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
