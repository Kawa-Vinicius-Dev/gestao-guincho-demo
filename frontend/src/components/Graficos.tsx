import type { ResultadoSocorrista,ResultadoVeiculo } from '../types/modelos'
import { moeda } from '../utils/formatadores'

/**
 * Graficos do dashboard. Sao desenhados com grid e divs, nao com uma biblioteca:
 * as tres formas que os dados pedem sao barras, e barra com rotulo de texto se
 * comporta melhor em HTML do que em SVG - o nome trunca, quebra e responde ao
 * tamanho da tela sem calculo manual de viewBox. Nenhuma dependencia nova.
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

/** Custo total por socorrista, do maior para o menor - a ordem e a informacao. */
export function CustoPorSocorrista({itens}:{itens:ResultadoSocorrista[]}){
  if(!itens.length)return <Vazio texto="Nenhum serviço pago com socorrista vinculado neste período."/>
  const ordenados=[...itens].sort((a,b)=>b.custoTotal-a.custoTotal)
  const maior=escala(ordenados.map(i=>i.custoTotal))
  return <div className="grafico grafico-barras" role="img"
    aria-label={`Custo por socorrista. ${ordenados.map(i=>`${i.socorrista}: ${moeda(i.custoTotal)}`).join('. ')}`}>
    {ordenados.map(item=>
      <div className="barra-linha" key={item.motoristaId}>
        <span className="barra-rotulo" title={item.socorrista}>{item.socorrista}</span>
        <span className="barra-trilho">
          <span className="barra-preenche" style={{width:`${Math.max(item.custoTotal/maior*100,1.5)}%`}}/>
        </span>
        <span className="barra-valor">{moeda(item.custoTotal)}</span>
      </div>)}
    <p className="grafico-escala"><span/><span className="escala-eixo"><span>R$ 0</span><span>{moeda(maior)}</span></span><span/></p>
  </div>
}

/**
 * Resultado por veiculo. Aqui o valor pode ser negativo, entao a barra sai de uma
 * linha zero no meio: prejuizo cresce para a esquerda, lucro para a direita.
 */
export function ResultadoPorVeiculo({itens}:{itens:ResultadoVeiculo[]}){
  if(!itens.length)return <Vazio texto="Nenhum resultado por veículo no período."/>
  const ordenados=[...itens].sort((a,b)=>b.resultado-a.resultado)
  const maior=escala(ordenados.map(i=>i.resultado))
  return <div className="grafico grafico-zero" role="img"
    aria-label={`Resultado por veículo. ${ordenados.map(i=>`${i.veiculo}: ${moeda(i.resultado)}`).join('. ')}`}>
    {ordenados.map(item=>{
      const proporcao=Math.max(Math.abs(item.resultado)/maior*50,item.resultado===0?0:.8)
      const negativo=item.resultado<0
      return <div className="barra-linha" key={item.veiculoId}>
        <span className="barra-rotulo" title={item.veiculo}>{item.veiculo}</span>
        <span className="barra-trilho barra-trilho-zero">
          <span className={`barra-preenche ${negativo?'barra-negativa':''}`}
            style={negativo?{right:'50%',width:`${proporcao}%`}:{left:'50%',width:`${proporcao}%`}}/>
        </span>
        <span className={`barra-valor ${negativo?'negative':'positive'}`}>{moeda(item.resultado)}</span>
      </div>})}
    <p className="grafico-escala"><span/><span className="escala-eixo"><span>−{moeda(maior)}</span><span>0</span><span>{moeda(maior)}</span></span><span/></p>
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
