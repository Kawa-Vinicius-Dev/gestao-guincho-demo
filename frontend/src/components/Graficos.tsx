import { useState, type CSSProperties } from 'react'
import { moeda, moedaCurta, numero, percentual } from '../utils/formatadores'

/**
 * Graficos do dashboard. Sao desenhados com grid e divs, nao com uma biblioteca:
 * as formas que os dados pedem sao barras, e barra com rotulo de texto se comporta
 * melhor em HTML do que em SVG - o nome trunca, quebra e responde ao tamanho da
 * tela sem calculo manual de viewBox. Nenhuma dependencia nova.
 *
 * Todos leem do mesmo resumo do dashboard. A trajetória usa a série diária que
 * o backend/RPC agrega sem criar outra chamada na página.
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

export type LinhaFaturamento={chave:string;rotulo:string;valor:number;quantidade:number;semVinculo:boolean}

/**
 * Quanto cada socorrista ou viatura faturou, uma barra por linha. A linha sem
 * vinculo fica por ultimo e em amarelo: o dinheiro existe, so falta dono — e e ela
 * que faz a soma das barras fechar com o faturamento do periodo. OS do painel
 * diario chega sem valor, conta como servico e nao soma dinheiro; por isso a
 * quantidade aparece ao lado do valor.
 */
export function FaturamentoPorGrupo({descricao,linhas,vazio}:{descricao:string;linhas:LinhaFaturamento[];vazio:string}){
  if(!linhas.length)return <Vazio texto={vazio}/>
  const ordenadas=[...linhas].sort((a,b)=>Number(a.semVinculo)-Number(b.semVinculo)||b.valor-a.valor)
  const maior=escala(ordenadas.map(l=>l.valor))
  const largura=(v:number)=>`${v>0?Math.max(v/maior*100,1.5):0}%`
  return <ul className="faturamento-grupo" aria-label={descricao}>
    {ordenadas.map(l=><li key={l.chave} className={l.semVinculo?'sem-vinculo':undefined}>
      <span className="faturamento-grupo-rotulo" title={l.rotulo}>{l.rotulo}</span>
      <span className="faturamento-grupo-trilho" aria-hidden="true"><span style={{width:largura(l.valor)}}/></span>
      <strong>{moeda(l.valor)}</strong>
      <small>{l.quantidade} {l.quantidade===1?'serviço':'serviços'}</small>
    </li>)}
  </ul>
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

/** Linha em degraus: o gasto sobe no dia consolidado pelo resumo, sem inventar movimento entre datas. */
export function DespesaAcumulada({pontos,inicio,fim}:{pontos:PontoDespesaAcumulada[];inicio:string;fim:string}){
  if(!pontos.length)return <Vazio texto="A trajetória aparece quando houver despesas pagas."/>
  const largura=640,altura=196,margemX=12,topo=12,base=164
  const primeiro=diaUtc(inicio),ultimo=diaUtc(fim)
  if(!Number.isFinite(primeiro)||!Number.isFinite(ultimo)||ultimo<primeiro){
    return <Vazio texto="Informe um período válido para ver a trajetória."/>
  }
  const ordenados=[...pontos]
    .filter(ponto=>{
      const data=diaUtc(ponto.data)
      return Number.isFinite(data)&&data>=primeiro&&data<=ultimo
        &&Number.isFinite(ponto.valorDia)&&Number.isFinite(ponto.acumulado)
    })
    .sort((a,b)=>a.data.localeCompare(b.data))
  if(!ordenados.length)return <Vazio texto="A trajetória aparece quando houver despesas pagas."/>
  const intervalo=Math.max(ultimo-primeiro,1)
  const total=Math.max(ordenados.at(-1)?.acumulado??0,1)
  const x=(data:string)=>{
    const posicao=Math.min(Math.max((diaUtc(data)-primeiro)/intervalo,0),1)
    return margemX+posicao*(largura-margemX*2)
  }
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
    <p>Maior gasto em {dataCurta(maiorDia.data)}: <strong>{moeda(maiorDia.valorDia)}</strong></p>
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

export type PontoProducao = {
  inicio: string; produzido: number; recebido: number; programado: number; servicos: number
}

/**
 * Producao contra recebimentos, no tempo.
 *
 * As tres series respondem a distancia entre trabalhar e receber: a producao
 * acontece no atendimento, o programado e a promessa da Porto, e o recebido e o
 * dinheiro na conta — quase sempre semanas depois. Um grafico que forcasse as
 * tres na mesma data esconderia justamente esse intervalo.
 *
 * Barras para a producao e linhas para dinheiro: a producao e uma contagem de
 * periodo fechado, que barra representa melhor; recebimento e programacao sao
 * trajetorias, que linha representa melhor. O tooltip segue o ponteiro porque a
 * pergunta ali e sempre "quanto foi neste periodo", e le-la exige os tres
 * numeros juntos.
 */
export function ProducaoXRecebimentos({ pontos, rotulo }: {
  pontos: PontoProducao[]
  rotulo: (inicio: string) => string
}) {
  const [ativo, setAtivo] = useState<number | null>(null)
  if (!pontos.length) return <Vazio texto="A evolução aparece quando houver serviços no período."/>

  const largura = 720, altura = 272, topo = 20, base = 214, margem = 58
  const teto = escala(pontos.flatMap(p => [p.produzido, p.recebido, p.programado]))
  const passo = (largura - margem * 2) / Math.max(pontos.length, 1)
  const x = (i: number) => margem + passo * i + passo / 2
  const y = (v: number) => base - (v / teto) * (base - topo)
  const linha = (campo: 'recebido' | 'programado') => pontos
    .map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p[campo]).toFixed(1)}`).join(' ')
  const area = `${linha('recebido')} L ${x(pontos.length - 1).toFixed(1)} ${base} L ${x(0).toFixed(1)} ${base} Z`

  const temRecebido = pontos.some(p => p.recebido > 0)
  const temProgramado = pontos.some(p => p.programado > 0)
  const ponto = ativo === null ? null : pontos[ativo]

  return <div className="producao-chart">
    <div className="chart-legend">
      <span><i className="legend-produzido"/>Produzido</span>
      {temRecebido ? <span><i className="legend-recebido"/>Recebido</span> : null}
      {temProgramado ? <span><i className="legend-programado"/>Programado</span> : null}
    </div>
    <div className="producao-plot" onMouseLeave={() => setAtivo(null)}>
      <svg viewBox={`0 0 ${largura} ${altura}`} role="img"
        aria-label={`Produção e recebimentos por período. ${pontos.map(p =>
          `${rotulo(p.inicio)}: produzido ${moeda(p.produzido)}, recebido ${moeda(p.recebido)}`).join('. ')}`}>
        {[0, .25, .5, .75, 1].map(f => <g key={f}>
          <line className="producao-grade" x1={margem} x2={largura - margem}
            y1={topo + (base - topo) * f} y2={topo + (base - topo) * f}/>
          <text className="producao-escala" x={margem - 10} y={topo + (base - topo) * f + 4}
            textAnchor="end">{moedaCurta(teto * (1 - f))}</text>
        </g>)}

        {pontos.map((p, i) => <rect key={`b${p.inicio}`} className="producao-barra"
          x={x(i) - Math.min(passo * .32, 16)} width={Math.min(passo * .64, 32)}
          y={y(p.produzido)} height={Math.max(base - y(p.produzido), p.produzido > 0 ? 2 : 0)}/>)}

        <defs>
          <linearGradient id="recebidoGradiente" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(8,122,85,.16)"/>
            <stop offset="100%" stopColor="rgba(8,122,85,0)"/>
          </linearGradient>
        </defs>
        {temRecebido ? <path className="producao-area" d={area}/> : null}
        {temProgramado ? <path className="producao-linha-programado" d={linha('programado')}/> : null}
        {temRecebido ? <path className="producao-linha-recebido" d={linha('recebido')}/> : null}
        {temRecebido ? pontos.map((p, i) => p.recebido > 0
          ? <circle key={`r${p.inicio}`} className="producao-ponto" cx={x(i)} cy={y(p.recebido)} r="4"/>
          : null) : null}

        {/* Faixa invisivel por periodo: o alvo do ponteiro e a coluna inteira,
            nao a barra — mirar numa barra de 2px de altura seria impossivel. */}
        {pontos.map((p, i) => <rect key={`h${p.inicio}`} className="producao-alvo"
          x={margem + passo * i} y={topo} width={passo} height={base - topo}
          onMouseEnter={() => setAtivo(i)}/>)}

        {ativo !== null
          ? <line className="producao-guia" x1={x(ativo)} x2={x(ativo)} y1={topo} y2={base}/>
          : null}

        {pontos.map((p, i) => pontos.length <= 16 || i % Math.ceil(pontos.length / 12) === 0
          ? <text key={`x${p.inicio}`} className="producao-eixo" x={x(i)} y={altura - 18}
              textAnchor="middle">{rotulo(p.inicio)}</text>
          : null)}
      </svg>

      {ponto ? <div className="producao-tooltip" style={{ left: `${(x(ativo!) / largura) * 100}%` }}>
        <strong>{rotulo(ponto.inicio)}</strong>
        <span><i className="legend-produzido"/>Produzido<b>{moeda(ponto.produzido)}</b></span>
        <span><i className="legend-recebido"/>Recebido<b>{moeda(ponto.recebido)}</b></span>
        <span><i className="legend-programado"/>Programado<b>{moeda(ponto.programado)}</b></span>
        <small>{ponto.servicos} {ponto.servicos === 1 ? 'serviço' : 'serviços'}</small>
      </div> : null}
    </div>
  </div>
}

/**
 * Produção e recebimento acumulados no período.
 *
 * O recebimento da Porto não entra aos poucos: entra de uma vez, quando a OP
 * fecha. Por período, isso vira um pico solto no fim e uma linha no chão antes
 * dele — parece quebrado, com os números certos. Acumulado, a história aparece:
 * a produção sobe semana a semana, o recebido dá um degrau quando a OP paga, e o
 * espaço entre as duas linhas é exatamente o que ainda falta entrar.
 *
 * O desenho segue a referência que o Kawã escolheu (Stripe): linha fina, grade
 * quase invisível, dois rótulos no eixo e o detalhe no ponteiro.
 */
export function EvolucaoAcumulada({ pontos, rotulo }: {
  pontos: PontoProducao[]
  rotulo: (inicio: string) => string
}) {
  const [ativo, setAtivo] = useState<number | null>(null)
  if (!pontos.length) return <Vazio texto="A evolução aparece quando houver serviços no período."/>

  let produzido = 0, recebido = 0
  const acumulado = pontos.map(p => {
    produzido += p.produzido
    recebido += p.recebido
    return { ...p, produzidoAcumulado: produzido, recebidoAcumulado: recebido }
  })

  const largura = 760, altura = 230, topo = 16, base = 196, lado = 8
  const teto = Math.max(produzido, recebido, 1)
  const x = (i: number) => lado + (acumulado.length === 1 ? (largura - lado * 2) / 2
    : (i / (acumulado.length - 1)) * (largura - lado * 2))
  const y = (v: number) => base - (v / teto) * (base - topo)
  const caminho = (campo: 'produzidoAcumulado' | 'recebidoAcumulado') => acumulado
    .map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p[campo]).toFixed(1)}`).join(' ')

  // A faixa entre as duas linhas: produção por cima, recebido voltando por baixo.
  const volta = [...acumulado].reverse()
    .map((p, i) => `L ${x(acumulado.length - 1 - i).toFixed(1)} ${y(p.recebidoAcumulado).toFixed(1)}`).join(' ')
  const faixa = `${caminho('produzidoAcumulado')} ${volta} Z`

  const ponto = ativo === null ? null : acumulado[ativo]
  const passo = (largura - lado * 2) / Math.max(acumulado.length - 1, 1)

  return <div className="acumulado-chart">
    <div className="acumulado-plot" onMouseLeave={() => setAtivo(null)}>
      <svg viewBox={`0 0 ${largura} ${altura}`} role="img" preserveAspectRatio="none"
        aria-label={`Produção acumulada ${moeda(produzido)} e recebido acumulado ${moeda(recebido)} no período.`}>
        <line className="acumulado-base" x1={lado} x2={largura - lado} y1={base} y2={base}/>
        <path className="acumulado-faixa" d={faixa}/>
        <path className="acumulado-linha-produzido" d={caminho('produzidoAcumulado')}/>
        <path className="acumulado-linha-recebido" d={caminho('recebidoAcumulado')}/>
        {acumulado.map((p, i) => <rect key={p.inicio} className="acumulado-alvo"
          x={x(i) - passo / 2} y={0} width={passo} height={altura}
          onMouseEnter={() => setAtivo(i)}/>)}
        {ponto ? <>
          <line className="acumulado-guia" x1={x(ativo!)} x2={x(ativo!)} y1={topo} y2={base}/>
          <circle className="acumulado-ponto-produzido" cx={x(ativo!)} cy={y(ponto.produzidoAcumulado)} r="4"/>
          <circle className="acumulado-ponto-recebido" cx={x(ativo!)} cy={y(ponto.recebidoAcumulado)} r="4"/>
        </> : null}
      </svg>

      {ponto ? <div className="acumulado-tooltip"
        style={{ left: `${Math.min(Math.max((x(ativo!) / largura) * 100, 14), 86)}%` }}>
        <strong>Até {rotulo(ponto.inicio)}</strong>
        <span><i className="marca-produzido"/>Produzido<b>{moeda(ponto.produzidoAcumulado)}</b></span>
        <span><i className="marca-recebido"/>Recebido<b>{moeda(ponto.recebidoAcumulado)}</b></span>
        <span className="acumulado-tooltip-falta">A receber<b>{moeda(ponto.produzidoAcumulado - ponto.recebidoAcumulado)}</b></span>
      </div> : null}
    </div>
    <div className="acumulado-eixo" aria-hidden="true">
      <span>{rotulo(acumulado[0].inicio)}</span>
      <span>{rotulo(acumulado[acumulado.length - 1].inicio)}</span>
    </div>
  </div>
}
