import type { CSSProperties } from 'react'
import { moeda, numero, percentual } from '../utils/formatadores'

/**
 * Graficos do dashboard. Sao desenhados com grid e divs, nao com uma biblioteca:
 * as formas que os dados pedem sao barras, e barra com rotulo de texto se comporta
 * melhor em HTML do que em SVG - o nome trunca, quebra e responde ao tamanho da
 * tela sem calculo manual de viewBox. Nenhuma dependencia nova.
 *
 * Todos leem de dados que /api/dashboard ja devolve. Nao existe serie temporal
 * na API, entao nao existe grafico de linha aqui: inventar um exigiria endpoint novo.
 */

/** Escala compartilhada: toda barra do mesmo grafico mede contra o maior valor. */
function escala(valores:number[]){
  const maior=Math.max(...valores.map(Math.abs),0)
  return maior>0?maior:1
}

function Vazio({texto}:{texto:string}){return <p className="grafico-vazio">{texto}</p>}

export type LinhaFaturamentoCusto={id:number;rotulo:string;faturamento:number;custo:number}

/**
 * Faturamento contra custo, na mesma escala, para veiculo e para socorrista. Duas
 * barras por linha: a distancia entre elas e o resultado, e o numero ao lado so
 * confirma o que a barra ja mostrou. Ordena pelo faturamento, porque a pergunta
 * de quem abre o dashboard e "quem mais trouxe dinheiro, e a que custo".
 */
export function FaturamentoECusto({descricao,linhas,vazio}:{descricao:string;linhas:LinhaFaturamentoCusto[];vazio:string}){
  if(!linhas.length)return <Vazio texto={vazio}/>
  const ordenadas=[...linhas].sort((a,b)=>b.faturamento-a.faturamento||b.custo-a.custo)
  const maior=escala(ordenadas.flatMap(l=>[l.faturamento,l.custo]))
  // Valor zero nao desenha barra nenhuma; valor pequeno ganha um minimo visivel.
  const largura=(v:number)=>`${v>0?Math.max(v/maior*100,1.5):0}%`
  return <div className="grafico grafico-par" role="img"
    aria-label={`${descricao}. ${ordenadas.map(l=>`${l.rotulo}: faturamento ${moeda(l.faturamento)}, custo ${moeda(l.custo)}, resultado ${moeda(l.faturamento-l.custo)}`).join('. ')}`}>
    <div className="par-legenda" aria-hidden="true">
      <span><i className="marca-faturamento"/>Faturamento</span>
      <span><i className="marca-custo"/>Custo</span>
      <span className="par-legenda-resultado">Resultado</span>
    </div>
    {ordenadas.map(l=>{
      const resultado=l.faturamento-l.custo
      return <div className="par-linha" key={l.id}>
        <span className="barra-rotulo" title={l.rotulo}>{l.rotulo}</span>
        <span className="par-trilhos">
          <span className="barra-trilho par-trilho"><span className="barra-preenche par-faturamento" style={{width:largura(l.faturamento)}}/></span>
          <span className="barra-trilho par-trilho"><span className="barra-preenche par-custo" style={{width:largura(l.custo)}}/></span>
        </span>
        <span className="par-valores"><span>{moeda(l.faturamento)}</span><span className="par-valor-custo">{moeda(l.custo)}</span></span>
        <strong className={`par-resultado ${resultado<0?'negative':'positive'}`}>{moeda(resultado)}</strong>
      </div>})}
    <p className="grafico-escala par-escala"><span/><span className="escala-eixo"><span>R$ 0</span><span>{moeda(maior)}</span></span><span/><span/></p>
  </div>
}

/**
 * Serviço prestado não é serviço pago: a Porto fecha a OP semanas depois. Esta
 * proporcao existe para deixar visivel quanto do periodo ainda esta esperando OP,
 * que hoje so aparece como dois numeros soltos.
 */
export function ProporcaoServicos({pagos,pendentes,valorPago,valorPendente}:
  {pagos:number;pendentes:number;valorPago:number;valorPendente:number}){
  const total=pagos+pendentes
  if(!total)return <Vazio texto="Nenhum serviço registrado neste período."/>
  const fatia=(n:number)=>n/total*100
  return <div className="grafico grafico-proporcao" role="img"
    aria-label={`${pagos} de ${total} serviços pagos, ${pendentes} aguardando ordem de pagamento.`}>
    <div className="proporcao-trilho">
      {pagos>0?<span className="proporcao-pago" style={{width:`${fatia(pagos)}%`}}/>:null}
      {pendentes>0?<span className="proporcao-pendente" style={{width:`${fatia(pendentes)}%`}}/>:null}
    </div>
    <dl className="proporcao-legenda">
      <div><dt><i className="marca-pago"/>Pagos</dt><dd>{pagos}<small>{moeda(valorPago)}</small></dd></div>
      <div><dt><i className="marca-pendente"/>Aguardando OP</dt><dd>{pendentes}<small>{moeda(valorPendente)}</small></dd></div>
    </dl>
  </div>
}

export type LinhaCategoria={id:number;rotulo:string;valor:number;participacao:number}
export type PontoDespesaAcumulada={data:string;valorDia:number;acumulado:number}

const CORES_GASTOS=['#c4324c','#1570ef','#46c7ee','#607d9b','#d59a32','#0b1d33']

type FatiaGasto={id:number|string;rotulo:string;valor:number;participacao:number;cor:string}

/** Cinco nomes continuam legiveis; o restante fecha a conta em "Outros". */
function fatiasDeGasto(linhas:LinhaCategoria[],total:number):FatiaGasto[]{
  const ordenadas=[...linhas].sort((a,b)=>b.valor-a.valor)
  const principais=ordenadas.slice(0,5)
  const restantes=ordenadas.slice(5)
  const base=total>0?total:ordenadas.reduce((soma,linha)=>soma+linha.valor,0)
  const fatias:FatiaGasto[]=principais.map((linha,indice)=>({
    ...linha,participacao:base?linha.valor/base*100:0,cor:CORES_GASTOS[indice],
  }))
  if(restantes.length){
    const valor=restantes.reduce((soma,linha)=>soma+linha.valor,0)
    fatias.push({id:'outros',rotulo:'Outros',valor,participacao:base?valor/base*100:0,
      cor:CORES_GASTOS[5]})
  }
  return fatias
}

/**
 * A rosca da a composicao num relance, mas nao carrega a leitura sozinha: a lista
 * ao lado mantem nome, valor e percentual exatos, em ordem de impacto.
 */
export function GastosPorCategoria({linhas,total}:{linhas:LinhaCategoria[];total:number}){
  if(!linhas.length)return <Vazio texto="Nenhuma despesa paga neste período."/>
  const fatias=fatiasDeGasto(linhas,total)
  let cursor=0
  const gradiente=fatias.map(fatia=>{
    const inicio=cursor
    cursor+=fatia.participacao
    return `${fatia.cor} ${inicio}% ${Math.min(cursor,100)}%`
  }).join(',')
  const estilo={'--gastos-gradiente':`conic-gradient(${gradiente})`} as CSSProperties
  return <div className="gastos-categoria">
    <div className="gastos-rosca" style={estilo} aria-hidden="true">
      <span><small>Total pago</small><strong>{moeda(total)}</strong></span>
    </div>
    <ol aria-label="Despesas por categoria">
      {fatias.map(fatia=><li key={fatia.id}>
        <i style={{backgroundColor:fatia.cor}} aria-hidden="true"/>
        <span title={fatia.rotulo}>{fatia.rotulo}</span>
        <strong>{moeda(fatia.valor)}</strong>
        <small>{percentual(fatia.participacao)}</small>
      </li>)}
    </ol>
  </div>
}

const diaUtc=(valor:string)=>{
  const [ano,mes,dia]=valor.split('-').map(Number)
  return Date.UTC(ano,mes-1,dia)
}
const dataCurta=(valor:string)=>{
  const [,mes,dia]=valor.split('-')
  return `${dia}/${mes}`
}

/** Linha em degraus: o gasto sobe no dia em que foi pago, sem sugerir movimento entre datas. */
export function DespesaAcumulada({pontos,inicio,fim}:{pontos:PontoDespesaAcumulada[];inicio:string;fim:string}){
  if(!pontos.length)return <Vazio texto="A trajetória aparece quando houver despesas pagas."/>
  const ordenados=[...pontos].sort((a,b)=>a.data.localeCompare(b.data))
  const largura=640,altura=196,margemX=12,topo=12,base=164
  const primeiro=diaUtc(inicio),ultimo=diaUtc(fim)
  const intervalo=Math.max(ultimo-primeiro,1)
  const total=Math.max(ordenados.at(-1)?.acumulado??0,1)
  const x=(data:string)=>margemX+(diaUtc(data)-primeiro)/intervalo*(largura-margemX*2)
  const y=(valor:number)=>topo+(1-valor/total)*(base-topo)
  let caminho=`M ${margemX} ${base}`
  for(const ponto of ordenados)caminho+=` H ${x(ponto.data)} V ${y(ponto.acumulado)}`
  caminho+=` H ${largura-margemX}`
  const area=`${caminho} V ${base} H ${margemX} Z`
  const maiorDia=ordenados.reduce((maior,ponto)=>ponto.valorDia>maior.valorDia?ponto:maior,ordenados[0])
  const descricao=ordenados.map(ponto=>
    `${dataCurta(ponto.data)}: ${moeda(ponto.valorDia)} no dia, ${moeda(ponto.acumulado)} acumulados`).join('. ')
  return <div className="gastos-trajetoria">
    <div className="trajetoria-resumo">
      <span>Gasto acumulado</span><strong>{moeda(ordenados.at(-1)?.acumulado??0)}</strong>
    </div>
    <svg viewBox={`0 0 ${largura} ${altura}`} role="img"
      aria-label={`Despesas acumuladas entre ${dataCurta(inicio)} e ${dataCurta(fim)}. ${descricao}`}>
      {[0,.25,.5,.75,1].map(fatia=>
        <line key={fatia} className="trajetoria-grade" x1={margemX} x2={largura-margemX}
          y1={topo+(base-topo)*fatia} y2={topo+(base-topo)*fatia}/>)}
      <path className="trajetoria-area" d={area}/>
      <path className="trajetoria-linha" d={caminho}/>
      {ordenados.length<=45?ordenados.map(ponto=><circle key={ponto.data}
        className="trajetoria-ponto" cx={x(ponto.data)} cy={y(ponto.acumulado)} r="3.5"/>):null}
    </svg>
    <div className="trajetoria-eixo" aria-hidden="true"><span>{dataCurta(inicio)}</span><span>{dataCurta(fim)}</span></div>
    <p>Maior saída em {dataCurta(maiorDia.data)}: <strong>{moeda(maiorDia.valorDia)}</strong></p>
  </div>
}

/**
 * Km rodado repartido entre remunerado e morto.
 *
 * Mesma forma da proporcao de servicos: uma barra unica repartida diz "quanto do
 * meu rodado nao foi pago" mais rapido do que dois numeros lado a lado, porque a
 * comparacao ja esta desenhada. O custo do km morto vem junto, que e a parte que
 * vira dinheiro na conta do mes.
 */
export function ProporcaoKm({remunerado,morto,custoMorto}:
  {remunerado:number;morto:number;custoMorto:number}){
  const total=remunerado+morto
  if(!total)return <Vazio texto="Nenhuma quilometragem registrada neste período."/>
  const fatia=(n:number)=>n/total*100
  return <div className="grafico grafico-proporcao" role="img"
    aria-label={`${numero(morto)} km improdutivos de ${numero(total)} km rodados.`}>
    <div className="proporcao-trilho">
      {remunerado>0?<span className="proporcao-pago" style={{width:`${fatia(remunerado)}%`}}/>:null}
      {morto>0?<span className="proporcao-morto" style={{width:`${fatia(morto)}%`}}/>:null}
    </div>
    <dl className="proporcao-legenda">
      <div>
        <dt><i className="marca-pago"/>Remunerado</dt>
        <dd>{numero(remunerado)} km<small>{percentual(fatia(remunerado))} do rodado</small></dd>
      </div>
      <div>
        <dt><i className="marca-morto"/>Km morto</dt>
        <dd>{numero(morto)} km<small>{moeda(custoMorto)} de custo</small></dd>
      </div>
    </dl>
  </div>
}
