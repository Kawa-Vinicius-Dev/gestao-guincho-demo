import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Campo, Selecao } from '../components/Campos'
import { ConfirmarAcao } from '../components/ConfirmarAcao'
import { ConfirmarExclusao } from '../components/ConfirmarExclusao'
import { Carregando, ErroPagina, Vazio } from '../components/EstadoPagina'
import { LinkSocorrista, LinkViatura } from '../components/LinksDeDado'
import { AcoesModal, Modal } from '../components/Modal'
import { CabecalhoPagina, Etiqueta, GradeIndicadores, Indicador, Painel } from '../components/ui/Pagina'
import {
  atualizarPlano, criarPlano, excluirDano, excluirPlano, ITENS_SUGERIDOS, KM_DE_AVISO, kmAtualDasViaturas,
  listarDanos, listarManutencao, marcarDano, registrarDano, registrarTroca, situacaoDoPlano,
  type Dano, type PlanoManutencao,
} from '../dados/manutencao'
import { listarVeiculos } from '../dados/veiculos'
import type { Veiculo } from '../types/modelos'
import { data, hojeIso } from '../utils/formatadores'
import { nomesCurtos } from '../utils/nomes'

/**
 * Manutencao — troca por quilometragem e danos da viatura (Kawa, 24/09/2026).
 *
 * O km atual vem sozinho do odometro dos turnos; aqui so se diz de quantos em
 * quantos km cada item e trocado. O dano que o socorrista marca no checklist
 * aparece aberto ate alguem resolver.
 */

const km = (n: number) => `${new Intl.NumberFormat('pt-BR').format(Math.round(n))} km`

type Edicao = { tipo: 'plano'; plano: PlanoManutencao | null } | { tipo: 'troca'; plano: PlanoManutencao }
  | { tipo: 'dano' } | { tipo: 'resolver'; dano: Dano } | { tipo: 'excluirPlano'; plano: PlanoManutencao }
  | { tipo: 'excluirDano'; dano: Dano } | { tipo: 'reabrir'; dano: Dano }

export default function ManutencaoPage() {
  const hoje = hojeIso()
  const [busca, setBusca] = useSearchParams()
  const verDanos = busca.get('danos') === 'resolvidos' ? 'resolvidos' : 'abertos'
  const [planos, setPlanos] = useState<PlanoManutencao[] | null>(null)
  const [danos, setDanos] = useState<Dano[] | null>(null)
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [kms, setKms] = useState<Map<number, number>>(new Map())
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [edicao, setEdicao] = useState<Edicao | null>(null)

  const carregar = useCallback(() => {
    setErro('')
    Promise.all([listarManutencao(), listarDanos()])
      .then(([p, d]) => { setPlanos(p); setDanos(d) })
      .catch(e => setErro((e as Error).message))
  }, [])
  useEffect(() => {
    carregar()
    listarVeiculos().then(v => setVeiculos(v.filter(x => x.ativo))).catch(() => setVeiculos([]))
    kmAtualDasViaturas().then(setKms).catch(() => setKms(new Map()))
  }, [carregar])

  const contagem = useMemo(() => {
    const c = { VENCIDA: 0, PROXIMA: 0, EM_DIA: 0 }
    for (const p of planos ?? []) c[situacaoDoPlano(p)]++
    return c
  }, [planos])
  const abertos = (danos ?? []).filter(d => !d.resolvidoEm)
  const danosVisiveis = verDanos === 'abertos' ? abertos : (danos ?? []).filter(d => d.resolvidoEm)
  const curtos = useMemo(() => nomesCurtos((danos ?? []).map(d => d.motorista ?? undefined)), [danos])

  if (erro && !planos) return <ErroPagina mensagem={erro} tentarNovamente={carregar} />
  if (!planos || !danos) return <Carregando />

  const concluir = (mensagem: string) => { setEdicao(null); setAviso(mensagem); carregar() }

  return <div className="page-enter">
    <CabecalhoPagina modulo="Viaturas" titulo="Manutenção"
      descricao="Troca por quilometragem, contada pelo odômetro dos turnos, e os danos vistos nas viaturas."
      acoes={<>
        <button type="button" className="button button-ghost" onClick={() => setEdicao({ tipo: 'dano' })}>Registrar dano</button>
        <button type="button" className="button button-primary" onClick={() => setEdicao({ tipo: 'plano', plano: null })}>Novo item</button>
      </>} />

    {aviso ? <div className="success-notice" role="status">{aviso}</div> : null}
    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}

    <GradeIndicadores>
      <Indicador rotulo="Troca vencida" valor={contagem.VENCIDA} link="/manutencao#planos"
        tom={contagem.VENCIDA ? 'alerta' : 'neutro'} apoio="Passou do km da troca" />
      <Indicador rotulo={`Troca em ${km(KM_DE_AVISO)}`} valor={contagem.PROXIMA} link="/manutencao#planos"
        tom={contagem.PROXIMA ? 'atencao' : 'neutro'} apoio="Agendar a oficina" />
      <Indicador rotulo="Danos em aberto" valor={abertos.length} link="/manutencao#danos"
        tom={abertos.length ? 'atencao' : 'neutro'} apoio="Vistos no checklist ou lançados à mão" />
    </GradeIndicadores>

    <div id="planos">
      <Painel titulo="Troca por quilometragem" etiqueta={`${planos.length} ${planos.length === 1 ? 'item' : 'itens'}`}>
        {!planos.length
          ? <Vazio titulo="Nenhum item de manutenção"
              descricao="Cadastre, por viatura, de quantos em quantos km troca o óleo, os pneus e a revisão. O sistema avisa 1.000 km antes." />
          : <div className="table-scroll"><table>
              <thead><tr><th>Viatura</th><th>Item</th><th>Última troca</th><th>Rodado desde então</th><th className="th-numero">Faltam</th><th>Situação</th><th aria-label="Ações"></th></tr></thead>
              <tbody>{planos.map(p => {
                const s = situacaoDoPlano(p)
                const rodado = p.intervaloKm - p.faltamKm
                const uso = Math.min(Math.max(rodado / p.intervaloKm, 0), 1)
                return <tr key={p.id}>
                  <td><LinkViatura id={p.veiculoId} sigla={p.viatura} /></td>
                  <td><strong>{p.item}</strong><small className="celula-apoio">a cada {km(p.intervaloKm)}</small></td>
                  <td>{km(p.ultimoKm)}<small className="celula-apoio">{p.ultimaData ? data(p.ultimaData) : 'data não informada'}</small></td>
                  <td className="celula-uso">
                    <div className={`barra-uso uso-${s.toLowerCase()}`} role="img"
                      aria-label={`${Math.round(uso * 100)}% do intervalo rodado`}><span style={{ width: `${uso * 100}%` }} /></div>
                    <small className="celula-apoio">{p.kmAtual === null ? 'sem odômetro apontado' : `${km(Math.max(rodado, 0))} · agora ${km(p.kmAtual)}`}</small>
                  </td>
                  <td className="col-numero"><strong>{p.faltamKm <= 0 ? `passou ${km(-p.faltamKm)}` : km(p.faltamKm)}</strong></td>
                  <td><Etiqueta tom={s === 'VENCIDA' ? 'alerta' : s === 'PROXIMA' ? 'atencao' : 'ok'}>
                    {s === 'VENCIDA' ? 'Vencida' : s === 'PROXIMA' ? 'Agendar' : 'Em dia'}</Etiqueta></td>
                  <td className="acoes-contestacao">
                    <button type="button" className={`button button-sm ${s === 'EM_DIA' ? 'button-ghost' : 'button-primary'}`}
                      onClick={() => setEdicao({ tipo: 'troca', plano: p })}>Registrar troca</button>
                    <button type="button" className="button button-ghost button-sm" onClick={() => setEdicao({ tipo: 'plano', plano: p })}>Editar</button>
                    <button type="button" className="button button-ghost button-sm acao-recusar" onClick={() => setEdicao({ tipo: 'excluirPlano', plano: p })}>Excluir</button>
                  </td>
                </tr>
              })}</tbody>
            </table></div>}
      </Painel>
    </div>

    <div id="danos">
      <Painel titulo="Danos" aoLado={
        <div className="atalhos-periodo" role="group" aria-label="Filtrar danos">
          {(['abertos', 'resolvidos'] as const).map(f =>
            <button key={f} type="button" aria-pressed={verDanos === f}
              className={`atalho-periodo${verDanos === f ? ' esta-marcado' : ''}`}
              onClick={() => setBusca(f === 'abertos' ? {} : { danos: f }, { replace: true })}>
              {f === 'abertos' ? `Em aberto (${abertos.length})` : 'Resolvidos'}
            </button>)}
        </div>}>
        {!danosVisiveis.length
          ? <Vazio titulo={verDanos === 'abertos' ? 'Nenhum dano em aberto' : 'Nenhum dano resolvido ainda'}
              descricao="Quando o socorrista marca um dano no checklist do turno, ele aparece aqui sozinho." />
          : <div className="table-scroll"><table>
              <thead><tr><th>Viatura</th><th>Dano</th><th>Visto em</th><th>Quem viu</th><th>Situação</th><th aria-label="Ações"></th></tr></thead>
              <tbody>{danosVisiveis.map(d => <tr key={d.id}>
                <td><LinkViatura id={d.veiculoId} sigla={d.viatura} /></td>
                <td><strong>{d.descricao}</strong>{d.observacao ? <small className="celula-apoio" title={d.observacao}>{d.observacao}</small> : null}</td>
                <td>{data(d.vistoEm)}<small className="celula-apoio">{d.turnoId ? 'no checklist do turno' : 'lançado à mão'}</small></td>
                <td>{d.motorista
                  ? <LinkSocorrista id={d.motoristaId} nome={d.motorista}>{curtos.get(d.motorista) ?? d.motorista}</LinkSocorrista> : '—'}</td>
                <td><Etiqueta tom={d.resolvidoEm ? 'ok' : 'atencao'}>{d.resolvidoEm ? `Resolvido em ${data(d.resolvidoEm)}` : 'Em aberto'}</Etiqueta></td>
                <td className="acoes-contestacao">
                  {d.resolvidoEm
                    ? <button type="button" className="button button-ghost button-sm" onClick={() => setEdicao({ tipo: 'reabrir', dano: d })}>Reabrir</button>
                    : <button type="button" className="button button-primary button-sm" onClick={() => setEdicao({ tipo: 'resolver', dano: d })}>Resolvido</button>}
                  <button type="button" className="button button-ghost button-sm acao-recusar" onClick={() => setEdicao({ tipo: 'excluirDano', dano: d })}>Excluir</button>
                </td>
              </tr>)}</tbody>
            </table></div>}
      </Painel>
    </div>

    {edicao?.tipo === 'plano'
      ? <FormPlano plano={edicao.plano} veiculos={veiculos} kms={kms} aoFechar={() => setEdicao(null)} aoSalvar={concluir} /> : null}
    {edicao?.tipo === 'troca'
      ? <FormTroca plano={edicao.plano} hoje={hoje} aoFechar={() => setEdicao(null)} aoSalvar={concluir} /> : null}
    {edicao?.tipo === 'dano'
      ? <FormDano veiculos={veiculos} hoje={hoje} aoFechar={() => setEdicao(null)} aoSalvar={concluir} /> : null}
    {edicao?.tipo === 'resolver'
      ? <FormResolver dano={edicao.dano} hoje={hoje} aoFechar={() => setEdicao(null)} aoSalvar={concluir} /> : null}
    {edicao?.tipo === 'reabrir'
      ? <ConfirmarAcao titulo="Reabrir este dano?" efeito="O dano volta para a lista de danos em aberto."
          resumo={[['Viatura', edicao.dano.viatura ?? '—'], ['Dano', edicao.dano.descricao]]} textoConfirmar="Reabrir"
          aoConfirmar={async () => { await marcarDano(edicao.dano.id, null); concluir('Dano reaberto.') }}
          aoFechar={() => setEdicao(null)} /> : null}
    {edicao?.tipo === 'excluirPlano'
      ? <ConfirmarExclusao coisa="item de manutenção" nome={`${edicao.plano.item} da ${edicao.plano.viatura}`}
          aviso="O sistema para de avisar a troca deste item."
          aoConfirmar={async () => { await excluirPlano(edicao.plano.id); concluir('Item excluído.') }}
          aoFechar={() => setEdicao(null)} /> : null}
    {edicao?.tipo === 'excluirDano'
      ? <ConfirmarExclusao coisa="dano" nome={edicao.dano.descricao}
          aviso="O registro do dano sai do histórico da viatura. Para só marcar como consertado, use Resolvido."
          resumo={[['Viatura', edicao.dano.viatura ?? '—'], ['Visto em', data(edicao.dano.vistoEm)]]}
          aoConfirmar={async () => { await excluirDano(edicao.dano.id); concluir('Dano excluído.') }}
          aoFechar={() => setEdicao(null)} /> : null}
  </div>
}

function useEnvio(aoSalvar: (mensagem: string) => void) {
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  async function enviar(fazer: () => Promise<string>) {
    setSalvando(true); setErro('')
    try { aoSalvar(await fazer()) } catch (x) { setErro((x as Error).message) } finally { setSalvando(false) }
  }
  return { erro, salvando, enviar }
}

function FormPlano({ plano, veiculos, kms, aoFechar, aoSalvar }: {
  plano: PlanoManutencao | null; veiculos: Veiculo[]; kms: Map<number, number>
  aoFechar: () => void; aoSalvar: (m: string) => void
}) {
  const { erro, salvando, enviar } = useEnvio(aoSalvar)
  const [veiculoId, setVeiculoId] = useState<number | ''>(plano?.veiculoId ?? '')
  const kmAgora = veiculoId ? kms.get(veiculoId) : undefined

  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const dados = {
      veiculoId: Number(veiculoId), item: String(f.get('item') ?? ''),
      intervaloKm: Number(String(f.get('intervalo') ?? '').replace(/\D/g, '')),
      ultimoKm: Number(String(f.get('ultimoKm') ?? '').replace(/\D/g, '')), ultimaData: String(f.get('ultimaData') ?? '') || null,
    }
    void enviar(async () => {
      if (plano) await atualizarPlano(plano.id, dados); else await criarPlano(dados)
      return plano ? `${dados.item} atualizado.` : `${dados.item} cadastrado.`
    })
  }

  return <Modal etiqueta="Manutenção" titulo={plano ? 'Editar item' : 'Novo item de manutenção'} aoFechar={aoFechar}>
    <form className="form-grid two-columns" onSubmit={salvar}>
      <Selecao rotulo="Viatura" name="veiculo" vazio="Escolha" required value={veiculoId}
        onChange={e => setVeiculoId(e.target.value ? Number(e.target.value) : '')}
        opcoes={veiculos.map(v => ({ valor: v.id, texto: v.identificacao }))} />
      <Campo rotulo="Item">
        <input name="item" list="itens-de-manutencao" required defaultValue={plano?.item ?? ''} placeholder="Troca de óleo" autoComplete="off" />
        <datalist id="itens-de-manutencao">{ITENS_SUGERIDOS.map(i => <option key={i} value={i} />)}</datalist>
      </Campo>
      <Campo rotulo="A cada (km)"><input name="intervalo" inputMode="numeric" required defaultValue={plano?.intervaloKm ?? ''} placeholder="10000" /></Campo>
      <Campo rotulo="Km da última troca" ajuda={kmAgora !== undefined ? `Odômetro atual desta viatura: ${km(kmAgora)}.` : undefined}>
        <input name="ultimoKm" inputMode="numeric" required key={plano ? 'fixo' : String(kmAgora ?? '')}
          defaultValue={plano?.ultimoKm ?? kmAgora ?? ''} placeholder="148320" />
      </Campo>
      <Campo rotulo="Data da última troca" className="field-wide"><input name="ultimaData" type="date" defaultValue={plano?.ultimaData ?? ''} /></Campo>
      {erro ? <div className="form-alert field-wide" role="alert">{erro}</div> : null}
      <AcoesModal aoCancelar={aoFechar}>
        <button className="button button-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </AcoesModal>
    </form>
  </Modal>
}

function FormTroca({ plano, hoje, aoFechar, aoSalvar }: {
  plano: PlanoManutencao; hoje: string; aoFechar: () => void; aoSalvar: (m: string) => void
}) {
  const { erro, salvando, enviar } = useEnvio(aoSalvar)
  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const kmFeito = Number(String(f.get('km') ?? '').replace(/\D/g, ''))
    void enviar(async () => {
      await registrarTroca(plano.id, kmFeito, String(f.get('data') ?? hoje))
      return `${plano.item} da ${plano.viatura} registrado com ${km(kmFeito)}.`
    })
  }
  return <Modal etiqueta="Manutenção" titulo={`${plano.item} · ${plano.viatura}`} aoFechar={aoFechar}>
    <form className="form-grid two-columns" onSubmit={salvar}>
      <p className="painel-apoio field-wide">A contagem recomeça deste odômetro. A próxima troca fica para daqui a {km(plano.intervaloKm)}.</p>
      <Campo rotulo="Odômetro na troca"><input name="km" inputMode="numeric" required defaultValue={plano.kmAtual ?? plano.ultimoKm} /></Campo>
      <Campo rotulo="Data"><input name="data" type="date" required defaultValue={hoje} max={hoje} /></Campo>
      {erro ? <div className="form-alert field-wide" role="alert">{erro}</div> : null}
      <AcoesModal aoCancelar={aoFechar}>
        <button className="button button-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar troca'}</button>
      </AcoesModal>
    </form>
  </Modal>
}

function FormDano({ veiculos, hoje, aoFechar, aoSalvar }: {
  veiculos: Veiculo[]; hoje: string; aoFechar: () => void; aoSalvar: (m: string) => void
}) {
  const { erro, salvando, enviar } = useEnvio(aoSalvar)
  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const veiculoId = Number(f.get('veiculo'))
    void enviar(async () => {
      await registrarDano(veiculoId, String(f.get('descricao') ?? ''), String(f.get('visto') ?? hoje))
      return 'Dano registrado.'
    })
  }
  return <Modal etiqueta="Manutenção" titulo="Registrar dano" aoFechar={aoFechar}>
    <form className="form-grid two-columns" onSubmit={salvar}>
      <Selecao rotulo="Viatura" name="veiculo" vazio="Escolha" required opcoes={veiculos.map(v => ({ valor: v.id, texto: v.identificacao }))} />
      <Campo rotulo="Visto em"><input name="visto" type="date" required defaultValue={hoje} max={hoje} /></Campo>
      <Campo rotulo="Dano" className="field-wide"><input name="descricao" required placeholder="Ex.: retrovisor direito quebrado" autoComplete="off" /></Campo>
      {erro ? <div className="form-alert field-wide" role="alert">{erro}</div> : null}
      <AcoesModal aoCancelar={aoFechar}>
        <button className="button button-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Registrar dano'}</button>
      </AcoesModal>
    </form>
  </Modal>
}

function FormResolver({ dano, hoje, aoFechar, aoSalvar }: {
  dano: Dano; hoje: string; aoFechar: () => void; aoSalvar: (m: string) => void
}) {
  const { erro, salvando, enviar } = useEnvio(aoSalvar)
  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    void enviar(async () => {
      await marcarDano(dano.id, String(f.get('data') ?? hoje), String(f.get('observacao') ?? '').trim() || null)
      return `Dano da ${dano.viatura ?? 'viatura'} marcado como resolvido.`
    })
  }
  return <Modal etiqueta="Manutenção" titulo={`Resolvido: ${dano.descricao}`} aoFechar={aoFechar}>
    <form className="form-grid two-columns" onSubmit={salvar}>
      <Campo rotulo="Resolvido em"><input name="data" type="date" required defaultValue={hoje} max={hoje} /></Campo>
      <Campo rotulo="Observação"><input name="observacao" placeholder="Opcional: oficina, peça, valor" autoComplete="off" /></Campo>
      {erro ? <div className="form-alert field-wide" role="alert">{erro}</div> : null}
      <AcoesModal aoCancelar={aoFechar}>
        <button className="button button-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Marcar como resolvido'}</button>
      </AcoesModal>
    </form>
  </Modal>
}
