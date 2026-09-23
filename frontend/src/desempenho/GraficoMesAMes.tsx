import { useEffect, useRef, useState } from 'react'

/**
 * Colunas agrupadas do Desempenho mes a mes: os meses no eixo, uma coluna por
 * viatura (ou socorrista) em cada mes. Mostra de uma vez a evolucao de cada um e
 * quem fez mais em cada mes (pedido do cliente, 23/09/2026).
 *
 * Cor: presa a entidade (ordem alfabetica da chave), nunca ao ranking, para a
 * mesma viatura ter a mesma cor quando o periodo muda. Paleta categorica de
 * referencia, validada nos dois temas (validate_palette: PASS); no tema claro tres
 * cores ficam abaixo de 3:1 contra o fundo, e a legenda, o tooltip e a tabela logo
 * abaixo carregam a identidade. Mais de 8 series: as menores viram "Outros".
 */
export interface SerieMensal { chave: string; rotulo: string; valores: number[]; semDono?: boolean }

const MAX_SERIES = 8
// Altura fixa e largura medida no painel: o texto fica sempre em 11px, sem
// crescer junto com a tela.
const H = 260, M = { topo: 12, dir: 8, base: 30, esq: 64 }

function passo(maximo: number) {
  if (maximo <= 0) return 1
  const bruto = maximo / 4
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  return [1, 2, 2.5, 5, 10].map(f => f * potencia).find(p => p >= bruto) ?? bruto
}

export function GraficoMesAMes({ meses, series, formatar, formatarEixo = formatar, descricao }: {
  meses: string[]; series: SerieMensal[]; formatar: (v: number) => string
  /** O eixo leva o valor curto (R$ 12 mil); a dica, o valor inteiro. */
  formatarEixo?: (v: number) => string; descricao: string
}) {
  const [foco, setFoco] = useState<{ serie: number; mes: number } | null>(null)
  const area = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(720)
  useEffect(() => {
    const el = area.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const medir = () => setW(Math.max(320, Math.round(el.clientWidth)))
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  // Mais de 8 series: as maiores ficam, o resto soma em "Outros".
  const ordenadas = [...series].sort((a, b) => Number(Boolean(a.semDono)) - Number(Boolean(b.semDono))
    || b.valores.reduce((t, v) => t + v, 0) - a.valores.reduce((t, v) => t + v, 0))
  const comDono = ordenadas.filter(s => !s.semDono)
  const visiveis = comDono.length > MAX_SERIES - 1
    ? [...comDono.slice(0, MAX_SERIES - 1), {
        chave: '__outros', rotulo: 'Outros', semDono: true,
        valores: meses.map((_, i) => comDono.slice(MAX_SERIES - 1).reduce((t, s) => t + (s.valores[i] ?? 0), 0)),
      }]
    : comDono
  const todas = [...visiveis, ...ordenadas.filter(s => s.semDono)]
  // Cor pela chave em ordem alfabetica: a viatura nao muda de cor com o ranking.
  const slot = new Map(visiveis.filter(s => !s.semDono).map(s => s.chave).sort().map((k, i) => [k, i + 1]))
  const cor = (s: SerieMensal) => s.semDono ? 'var(--serie-neutra)' : `var(--serie-${slot.get(s.chave) ?? 1})`

  const maximo = Math.max(0, ...todas.flatMap(s => s.valores))
  const intervalo = passo(maximo)
  const topo = Math.max(intervalo, Math.ceil(maximo / intervalo) * intervalo)
  const ticks = Array.from({ length: Math.round(topo / intervalo) + 1 }, (_, i) => i * intervalo)
  const larguraPlot = W - M.esq - M.dir, alturaPlot = H - M.topo - M.base
  const larguraMes = larguraPlot / Math.max(meses.length, 1)
  const folga = larguraMes * 0.18
  const larguraBarra = Math.min(48, Math.max(4, (larguraMes - folga * 2 - (todas.length - 1) * 2) / Math.max(todas.length, 1)))
  // Com a coluna limitada, o grupo fica centrado no mes.
  const recuo = (larguraMes - todas.length * larguraBarra - (todas.length - 1) * 2) / 2
  const y = (v: number) => M.topo + alturaPlot - (v / topo) * alturaPlot
  const x = (mes: number, serie: number) => M.esq + mes * larguraMes + recuo + serie * (larguraBarra + 2)

  // Coluna com o topo arredondado (4px) e a base reta, presa na linha de base.
  const coluna = (x0: number, v: number) => {
    const y0 = y(v), base = y(0), r = Math.min(4, larguraBarra / 2, base - y0)
    if (base - y0 <= 0) return ''
    return `M${x0},${base}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + larguraBarra - r}Q${x0 + larguraBarra},${y0} ${x0 + larguraBarra},${y0 + r}V${base}Z`
  }

  const ativo = foco ? { s: todas[foco.serie]!, v: todas[foco.serie]!.valores[foco.mes] ?? 0 } : null

  return <figure className="grafico-mes-a-mes">
    {todas.length > 1 ? <ul className="grafico-mes-legenda" aria-label="Legenda">
      {todas.map(s => <li key={s.chave}><i style={{ background: cor(s) }} aria-hidden="true"/>{s.rotulo}</li>)}
    </ul> : null}
    <div className="grafico-mes-area" ref={area}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={descricao} onMouseLeave={() => setFoco(null)}>
        {ticks.map(t => <g key={t}>
          <line x1={M.esq} x2={W - M.dir} y1={y(t)} y2={y(t)} className={t === 0 ? 'eixo-base' : 'eixo-grade'}/>
          <text x={M.esq - 8} y={y(t)} dy="0.32em" textAnchor="end" className="eixo-texto">{formatarEixo(t)}</text>
        </g>)}
        {meses.map((mes, i) => <text key={mes} x={M.esq + i * larguraMes + larguraMes / 2} y={H - 8}
          textAnchor="middle" className="eixo-texto">{mes}</text>)}
        {meses.map((_, i) => todas.map((s, j) => <path key={`${s.chave}-${i}`} d={coluna(x(i, j), s.valores[i] ?? 0)}
          fill={cor(s)} opacity={foco && (foco.serie !== j || foco.mes !== i) ? 0.35 : 1}/>))}
        {/* Alvo de hover maior que a coluna: a faixa inteira dela. */}
        {meses.map((_, i) => todas.map((s, j) => <rect key={`alvo-${s.chave}-${i}`} x={x(i, j) - 1} y={M.topo}
          width={larguraBarra + 2} height={alturaPlot} fill="transparent"
          onMouseEnter={() => setFoco({ serie: j, mes: i })}>
          <title>{`${s.rotulo} · ${meses[i]}: ${formatar(s.valores[i] ?? 0)}`}</title>
        </rect>))}
      </svg>
      {ativo && foco ? <div className="grafico-mes-dica" role="status"
        style={{ left: `${(x(foco.mes, foco.serie) + larguraBarra / 2) / W * 100}%`, top: `${y(ativo.v) / H * 100}%` }}>
        <span><i style={{ background: cor(ativo.s) }} aria-hidden="true"/>{ativo.s.rotulo}</span>
        <strong>{formatar(ativo.v)}</strong><small>{meses[foco.mes]}</small>
      </div> : null}
    </div>
  </figure>
}
