import { useEffect, useMemo, useState } from 'react'
import { LinkOp, LinkOs, LinkSocorrista, LinkViatura } from '../components/LinksDeDado'
import { Link, useSearchParams } from 'react-router-dom'
import { Carregando } from '../components/EstadoPagina'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { CabecalhoPagina, Painel } from '../components/ui/Pagina'
import { listarTodasAsOs, valorDaOs, type LinhaOs } from '../dados/porto/listaOs'
import { porCompetencia } from '../utils/modoDoPeriodo'
import { listarQuilometragens } from '../dados/quilometragem'
import { listarVeiculos } from '../dados/veiculos'
import type { Quilometragem, Veiculo } from '../types/modelos'
import { data, moeda, numero } from '../utils/formatadores'
import { usePeriodoGlobal } from '../utils/periodoGlobal'
import { ETIQUETAS_SITUACAO } from '../porto/situacaoOs'
import './desempenho.css'

/**
 * Desempenho de viaturas e socorristas no periodo.
 *
 * Kawa, 22/09/2026: "mostrar servicos por viatura" e "graficos de desempenho de
 * socorrista e de viaturas", numa tela propria. Tudo sai das mesmas OS da tela
 * de Ordens de servico (e do km lancado, para as viaturas): nada aqui e numero
 * novo, e so o mesmo dado agrupado por quem fez.
 *
 * Clicar numa barra abre os servicos daquela viatura ou socorrista embaixo.
 */

type Visao = 'viaturas' | 'socorristas'
type Medida = 'servicos' | 'faturamento' | 'km' | 'comissao'

interface Grupo {
  chave: string
  rotulo: string
  servicos: number
  faturamento: number
  comissao: number
  km: number
  semValor: number
  os: LinhaOs[]
  link?: string
}

const MEDIDAS: Record<Visao, [Medida, string][]> = {
  viaturas: [['servicos', 'Serviços'], ['faturamento', 'Faturamento'], ['km', 'Km rodado']],
  socorristas: [['servicos', 'Serviços'], ['faturamento', 'Produção'], ['comissao', 'Comissão']],
}

const formatar = (medida: Medida, valor: number) =>
  medida === 'servicos' ? `${valor} ${valor === 1 ? 'serviço' : 'serviços'}`
    : medida === 'km' ? `${numero(valor)} km` : moeda(valor)


function agrupar(oss: LinhaOs[], chave: (os: LinhaOs) => string | undefined, semDono: string): Map<string, Grupo> {
  const grupos = new Map<string, Grupo>()
  for (const os of oss) {
    const k = chave(os) || ''
    const g = grupos.get(k) ?? { chave: k || 'sem', rotulo: k || semDono, servicos: 0, faturamento: 0, comissao: 0, km: 0, semValor: 0, os: [] }
    g.servicos += 1
    g.faturamento += valorDaOs(os)
    g.comissao += os.comissao ?? 0
    if (os.semValor) g.semValor += 1
    g.os.push(os)
    grupos.set(k, g)
  }
  return grupos
}

export default function DesempenhoPage() {
  const [periodo, setPeriodo] = usePeriodoGlobal()
  const [oss, setOss] = useState<LinhaOs[] | null>(null)
  const [kms, setKms] = useState<Quilometragem[]>([])
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [erro, setErro] = useState('')
  // Desempenho e aba de Viaturas (?visao=viaturas) e de Socorristas (?visao=socorristas):
  // a URL escolhe a visao, e o seletor proprio so aparece sem ela.
  const [busca] = useSearchParams()
  const visaoDaUrl = busca.get('visao') === 'socorristas' ? 'socorristas' : busca.get('visao') === 'viaturas' ? 'viaturas' : null
  const [visaoEscolhida, setVisao] = useState<Visao>('viaturas')
  const visao: Visao = visaoDaUrl ?? visaoEscolhida
  const [medida, setMedida] = useState<Medida>('servicos')
  const [aberto, setAberto] = useState<string | null>(null)

  useEffect(() => {
    if (!periodo.inicio || !periodo.fim || periodo.inicio > periodo.fim) return
    setOss(null); setErro(''); setAberto(null)
    Promise.all([
      listarTodasAsOs({ inicio: periodo.inicio, fim: periodo.fim, porCompetencia: porCompetencia(periodo) }),
      listarQuilometragens({ inicio: periodo.inicio, fim: periodo.fim }).catch(() => []),
      listarVeiculos().catch(() => []),
    ]).then(([p, k, v]) => { setOss(p.itens); setKms(k); setVeiculos(v) })
      .catch((e: Error) => setErro(e.message))
  }, [periodo.inicio, periodo.fim, periodo.op])

  const grupos = useMemo<Grupo[]>(() => {
    if (!oss) return []
    if (visao === 'socorristas') {
      return [...agrupar(oss, os => os.motorista, 'Sem socorrista').values()].map(g => {
        const id = g.os[0]?.motoristaId
        return id ? { ...g, link: `/equipe/${id}` } : g
      })
    }
    const porSigla = agrupar(oss, os => os.viatura?.toUpperCase(), 'Sem viatura')
    // O km e lancado por veiculo; a OS traz a sigla da Porto. A ponte e o cadastro.
    for (const v of veiculos) {
      const km = kms.filter(k => k.veiculoId === v.id).reduce((t, k) => t + (k.quilometragemTotal || 0), 0)
      if (!km) continue
      const sigla = (v.siglaPorto || v.identificacao).toUpperCase()
      const g = porSigla.get(sigla) ?? { chave: sigla, rotulo: sigla, servicos: 0, faturamento: 0, comissao: 0, km: 0, semValor: 0, os: [] }
      g.km += km
      porSigla.set(sigla, g)
    }
    return [...porSigla.values()]
  }, [oss, kms, veiculos, visao])

  const medidaValida = MEDIDAS[visao].some(([m]) => m === medida) ? medida : 'servicos'
  const ordenados = [...grupos].sort((a, b) => b[medidaValida] - a[medidaValida] || a.rotulo.localeCompare(b.rotulo))
  const maior = Math.max(...ordenados.map(g => g[medidaValida]), 1)
  // A soma de todas as linhas, sempre embaixo (Kawa, 23/09/2026).
  const soma = (m: Medida) => ordenados.reduce((t, g) => t + g[m], 0)
  const grupoAberto = ordenados.find(g => g.chave === aberto) ?? null

  function trocarVisao(nova: Visao) { setVisao(nova); setAberto(null) }

  return <div className="page-enter pagina-desempenho">
    <CabecalhoPagina modulo="Operação" titulo="Desempenho"
      descricao="Serviços, faturamento e km de cada viatura, e serviços, produção e comissão de cada socorrista, no período."/>

    <Painel className="painel-filtros">
      <form className="ledger-filters" onSubmit={e => e.preventDefault()}>
        <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/>
      </form>
    </Painel>

    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}

    <Painel semRespiro>
      <div className="desempenho-controles">
        {visaoDaUrl ? null : <div className="segmented" role="group" aria-label="Ver por">
          {(['viaturas', 'socorristas'] as Visao[]).map(v => <button key={v} type="button" aria-pressed={visao === v}
            className={visao === v ? 'active' : undefined} onClick={() => trocarVisao(v)}>
            {v === 'viaturas' ? 'Viaturas' : 'Socorristas'}</button>)}
        </div>}
        <div className="segmented" role="group" aria-label="Medida">
          {MEDIDAS[visao].map(([m, rotulo]) => <button key={m} type="button" aria-pressed={medidaValida === m}
            className={medidaValida === m ? 'active' : undefined} onClick={() => setMedida(m)}>{rotulo}</button>)}
        </div>
      </div>

      {!oss && !erro ? <Carregando/> : null}
      {oss && !ordenados.length ? <p className="empty-inline">Nenhum serviço neste período.</p> : null}
      {ordenados.length ? <ul className="desempenho-barras" aria-label={`${visao === 'viaturas' ? 'Viaturas' : 'Socorristas'} por ${MEDIDAS[visao].find(([m]) => m === medidaValida)?.[1].toLowerCase()}`}>
        {ordenados.map(g => {
          const valor = g[medidaValida]
          const detalhe = medidaValida === 'servicos' ? moeda(g.faturamento) : formatar('servicos', g.servicos)
          return <li key={g.chave} className={g.chave === 'sem' ? 'sem-vinculo' : undefined}>
            <button type="button" className={aberto === g.chave ? 'desempenho-linha aberta' : 'desempenho-linha'}
              aria-expanded={aberto === g.chave} onClick={() => setAberto(a => a === g.chave ? null : g.chave)}
              title={`${g.rotulo}: ${formatar(medidaValida, valor)} · ${formatar('servicos', g.servicos)}`}>
              <span className="desempenho-rotulo">{g.rotulo}</span>
              <span className="faturamento-grupo-trilho" aria-hidden="true">
                <span style={{ width: `${valor > 0 ? Math.max(valor / maior * 100, 1.5) : 0}%` }}/></span>
              <strong>{formatar(medidaValida, valor)}</strong>
              <small>{detalhe}{g.semValor ? ` · ${g.semValor} sem valor` : ''}</small>
            </button>
          </li>
        })}
        <li className="desempenho-total">
          <span className="desempenho-rotulo">Total</span><span/>
          <strong>{formatar(medidaValida, soma(medidaValida))}</strong>
          <small>{medidaValida === 'servicos' ? moeda(soma('faturamento')) : formatar('servicos', soma('servicos'))}</small>
        </li>
      </ul> : null}
    </Painel>

    {grupoAberto ? <Painel etiqueta={visao === 'viaturas' ? 'Viatura' : 'Socorrista'}
      titulo={`Serviços de ${grupoAberto.rotulo}`} semRespiro
      aoLado={grupoAberto.link ? <Link className="button button-ghost" to={grupoAberto.link}>Abrir ficha e comissão</Link> : undefined}>
      {grupoAberto.os.length ? <div className="table-scroll"><table className="tabela-os">
        <thead><tr><th>OS</th><th>Atendimento</th><th>Especialidade</th>
          <th>{visao === 'viaturas' ? 'Socorrista' : 'Viatura'}</th><th>OP</th><th>Situação</th><th className="th-numero">Valor</th></tr></thead>
        <tbody>{grupoAberto.os.map(os => <tr key={os.id}>
          <td className="col-os"><strong><LinkOs numero={os.numero}/></strong></td>
          <td className="col-data">{os.dataAtendimento ? data(os.dataAtendimento) : '—'}</td>
          <td className="col-especialidade" title={os.especialidade || undefined}>{os.especialidade || '—'}</td>
          <td>{visao === 'viaturas' ? <LinkSocorrista id={os.motoristaId} nome={os.motorista}/> : <LinkViatura sigla={os.viatura} chip/>}</td>
          <td className="col-op">{os.numeroOp ? <span className="os-op"><LinkOp numero={os.numeroOp}/></span> : <small className="os-sem">Aguardando OP</small>}</td>
          <td><span className={`vehicle-status ${ETIQUETAS_SITUACAO[os.situacao].classe}`}>{ETIQUETAS_SITUACAO[os.situacao].texto}</span></td>
          <td className="col-valor">{os.semValor ? <small>Sem valor</small> : moeda(valorDaOs(os))}</td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-inline">Só há km lançado para esta viatura no período, sem serviço.</p>}
    </Painel> : null}
  </div>
}
