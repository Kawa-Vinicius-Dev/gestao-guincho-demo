import { moeda } from '../utils/formatadores'

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
