import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Campo, Selecao } from '../components/Campos'
import { ConfirmarExclusao } from '../components/ConfirmarExclusao'
import { Carregando, ErroPagina, Vazio } from '../components/EstadoPagina'
import { LinkSocorrista, LinkViatura } from '../components/LinksDeDado'
import { AcoesModal, Modal } from '../components/Modal'
import { CabecalhoPagina, Etiqueta, GradeIndicadores, Indicador, Painel } from '../components/ui/Pagina'
import {
  atualizarDocumento, criarDocumento, DIAS_DE_AVISO, diasParaVencer, excluirDocumento, listarDocumentos,
  situacaoDoDocumento, TIPOS_DA_VIATURA, TIPOS_DO_SOCORRISTA, type Documento,
} from '../dados/documentos'
import { listarMotoristas } from '../dados/motoristas'
import {
  DIAS_PARA_CORRIGIR, finalDaPlaca, listarVistorias, mesesDaVistoria, nomeDoMes, registrarVistoria, vistoriaDaViatura,
  type RegistroVistoria, type VistoriaDaViatura,
} from '../dados/vistorias'
import { listarVeiculos } from '../dados/veiculos'
import type { Motorista, Veiculo } from '../types/modelos'
import { data, hojeIso } from '../utils/formatadores'

/**
 * Documentos — validade do credenciamento das viaturas e dos socorristas
 * (Kawa, 24/09/2026). Documento vencido pode tirar do acionamento da Porto; a
 * tela avisa 30 dias antes. So a data fica guardada, nao o arquivo.
 */

type Filtro = 'atencao' | 'VENCIDO' | 'VENCE_LOGO' | 'EM_DIA' | 'todos'
const ROTULO: Record<Filtro, string> = {
  atencao: 'Pedem atenção', VENCIDO: 'Vencidos', VENCE_LOGO: `Vencem em ${DIAS_DE_AVISO} dias`, EM_DIA: 'Em dia', todos: 'Todos',
}

function prazoPorExtenso(dias: number) {
  if (dias < 0) return `vencido há ${-dias} ${dias === -1 ? 'dia' : 'dias'}`
  if (dias === 0) return 'vence hoje'
  return `vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`
}

export default function DocumentosPage() {
  const hoje = hojeIso()
  const [busca, setBusca] = useSearchParams()
  const filtro = (busca.get('filtro') ?? 'todos') as Filtro
  const [lista, setLista] = useState<Documento[] | null>(null)
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [motoristas, setMotoristas] = useState<Motorista[]>([])
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [editando, setEditando] = useState<Documento | 'novo' | null>(null)
  const [excluindo, setExcluindo] = useState<Documento | null>(null)
  const [vistorias, setVistorias] = useState<RegistroVistoria[]>([])
  const [registrando, setRegistrando] = useState<{ veiculo: Veiculo; vistoria: VistoriaDaViatura } | null>(null)

  const carregar = useCallback(() => {
    setErro('')
    listarDocumentos().then(setLista).catch(e => setErro((e as Error).message))
    listarVistorias().then(setVistorias).catch(() => setVistorias([]))
  }, [])
  useEffect(() => {
    carregar()
    listarVeiculos().then(v => setVeiculos(v.filter(x => x.ativo))).catch(() => setVeiculos([]))
    listarMotoristas().then(m => setMotoristas(m.filter(x => x.ativo))).catch(() => setMotoristas([]))
  }, [carregar])

  const contagem = useMemo(() => {
    const c = { VENCIDO: 0, VENCE_LOGO: 0, EM_DIA: 0 }
    for (const d of lista ?? []) c[situacaoDoDocumento(d.venceEm, hoje)]++
    return c
  }, [lista, hoje])
  const visiveis = useMemo(() => (lista ?? []).filter(d => {
    const s = situacaoDoDocumento(d.venceEm, hoje)
    return filtro === 'todos' || (filtro === 'atencao' ? s !== 'EM_DIA' : s === filtro)
  }), [lista, filtro, hoje])

  const situacoesVistoria = veiculos.map(v => ({ veiculo: v, vistoria: vistoriaDaViatura(v.placa, vistorias.filter(r => r.veiculoId === v.id), hoje) }))
  const vistoriasPendentes = situacoesVistoria.filter(s => s.vistoria.situacao === 'PENDENTE' || s.vistoria.situacao === 'REPROVADA').length

  if (erro && !lista) return <ErroPagina mensagem={erro} tentarNovamente={carregar} />
  if (!lista) return <Carregando />

  const link = (f: Filtro) => `/documentos?filtro=${f}`
  const escolher = (f: Filtro) => setBusca(f === 'todos' ? {} : { filtro: f }, { replace: true })

  return <div className="page-enter">
    <CabecalhoPagina modulo="Viaturas" titulo="Documentos"
      descricao="Validade do que a Porto exige das viaturas e dos socorristas. O sistema avisa 30 dias antes."
      acoes={<button type="button" className="button button-primary" onClick={() => setEditando('novo')}>Novo documento</button>} />

    {aviso ? <div className="success-notice" role="status">{aviso}</div> : null}
    {erro ? <div className="form-alert" role="alert">{erro}</div> : null}

    <GradeIndicadores>
      <Indicador rotulo="Vencidos" valor={contagem.VENCIDO} link={link('VENCIDO')}
        tom={contagem.VENCIDO ? 'alerta' : 'neutro'} apoio="Podem tirar do acionamento" />
      <Indicador rotulo={`Vencem em ${DIAS_DE_AVISO} dias`} valor={contagem.VENCE_LOGO} link={link('VENCE_LOGO')}
        tom={contagem.VENCE_LOGO ? 'atencao' : 'neutro'} apoio="Hora de renovar" />
      <Indicador rotulo="Em dia" valor={contagem.EM_DIA} link={link('EM_DIA')}
        tom={contagem.EM_DIA ? 'positivo' : 'neutro'} apoio={`${lista.length} documentos no total`} />
      <Indicador rotulo="Vistoria da Porto" valor={vistoriasPendentes} link="/documentos#vistorias"
        tom={vistoriasPendentes ? 'atencao' : 'neutro'} apoio="Pendente no mês ou reprovada" />
    </GradeIndicadores>

    <div id="vistorias">
      <Painel titulo="Vistoria periódica da Porto" etiqueta="Pelo final da placa">
        <p className="painel-apoio">
          Placa com final ímpar: janeiro, abril, julho e outubro. Final par: fevereiro, maio, agosto e novembro.
          Reprovada por falta de item, são {DIAS_PARA_CORRIGIR} dias corridos para corrigir e refazer, senão a Porto pode bloquear a viatura.
        </p>
        {!situacoesVistoria.length
          ? <Vazio titulo="Nenhuma viatura ativa" descricao="Cadastre as viaturas com a placa para o calendário aparecer." />
          : <div className="table-scroll"><table>
              <thead><tr><th>Viatura</th><th>Meses de vistoria</th><th>Situação</th><th aria-label="Ações"></th></tr></thead>
              <tbody>{situacoesVistoria.map(({ veiculo, vistoria }) => {
                const final = finalDaPlaca(veiculo.placa)
                const mesRef = vistoria.referencia ? nomeDoMes(Number(vistoria.referencia.slice(5, 7))) : ''
                const proximo = vistoria.proximoMes ? nomeDoMes(Number(vistoria.proximoMes.slice(5, 7))) : ''
                return <tr key={veiculo.id}>
                  <td><LinkViatura id={veiculo.id} sigla={veiculo.identificacao} />
                    <small className="celula-apoio">{veiculo.placa ? `Placa ${veiculo.placa}` : 'Sem placa cadastrada'}</small></td>
                  <td>{final === null ? '—' : mesesDaVistoria(final).map(nomeDoMes).map(m => m.slice(0, 3)).join(' · ')}
                    {final === null ? null : <small className="celula-apoio">final {final} · {final % 2 ? 'ímpar' : 'par'}</small>}</td>
                  <td>{vistoria.situacao === 'SEM_PLACA'
                      ? <span className="celula-apoio">Cadastre a placa da viatura</span>
                      : <>
                          <Etiqueta tom={vistoria.situacao === 'PENDENTE' ? 'atencao'
                            : vistoria.situacao === 'REPROVADA' ? 'alerta'
                            : vistoria.situacao === 'SEM_REGISTRO' ? 'neutro' : 'ok'}>
                            {vistoria.situacao === 'PENDENTE' ? `Fazer em ${mesRef}`
                              : vistoria.situacao === 'REPROVADA' ? 'Reprovada'
                              : vistoria.situacao === 'SEM_REGISTRO' ? `Sem registro em ${mesRef}`
                              : vistoria.situacao === 'FEITA' ? `Feita em ${data(vistoria.registro!.feitaEm)}` : 'Em dia'}
                          </Etiqueta>
                          <small className="celula-apoio">
                            {vistoria.situacao === 'REPROVADA' && vistoria.corrigirAte
                              ? `corrigir e refazer até ${data(vistoria.corrigirAte)}`
                              : vistoria.situacao === 'PENDENTE' ? `a seguinte em ${proximo}`
                              : `próxima em ${proximo}`}
                          </small>
                        </>}</td>
                  <td className="acoes-contestacao">
                    {vistoria.situacao === 'PENDENTE' || vistoria.situacao === 'REPROVADA' || vistoria.situacao === 'SEM_REGISTRO'
                      ? <button type="button" className={`button button-sm ${vistoria.situacao === 'SEM_REGISTRO' ? 'button-ghost' : 'button-primary'}`}
                          onClick={() => setRegistrando({ veiculo, vistoria })}>
                          {vistoria.situacao === 'REPROVADA' ? 'Refiz a vistoria' : 'Registrar vistoria'}
                        </button>
                      : null}
                  </td>
                </tr>
              })}</tbody>
            </table></div>}
      </Painel>
    </div>

    <Painel titulo="Documentos" aoLado={
      <div className="atalhos-periodo" role="group" aria-label="Filtrar documentos">
        {(['todos', 'atencao', 'VENCIDO', 'VENCE_LOGO', 'EM_DIA'] as Filtro[]).map(f =>
          <button key={f} type="button" aria-pressed={filtro === f}
            className={`atalho-periodo${filtro === f ? ' esta-marcado' : ''}`} onClick={() => escolher(f)}>{ROTULO[f]}</button>)}
      </div>}>
      {!visiveis.length
        ? <Vazio titulo={lista.length ? `Nenhum documento em "${ROTULO[filtro]}"` : 'Nenhum documento cadastrado'}
            descricao={lista.length ? 'Escolha outro filtro acima.'
              : 'Cadastre o CRLV e o seguro de cada viatura e a CNH de cada socorrista para o sistema avisar antes de vencer.'} />
        : <div className="table-scroll tabela-rolagem"><table>
            <thead><tr><th>Documento</th><th>De quem</th><th>Vence em</th><th>Situação</th><th>Observação</th><th aria-label="Ações"></th></tr></thead>
            <tbody>{visiveis.map(d => {
              const dias = diasParaVencer(d.venceEm, hoje)
              const s = situacaoDoDocumento(d.venceEm, hoje)
              return <tr key={d.id}>
                <td><strong>{d.tipo}</strong></td>
                <td>{d.veiculoId
                  ? <><LinkViatura id={d.veiculoId} sigla={d.veiculo} /><small className="celula-apoio">Viatura</small></>
                  : <><LinkSocorrista id={d.motoristaId} nome={d.motorista} /><small className="celula-apoio">Socorrista</small></>}</td>
                <td>{data(d.venceEm)}<small className="celula-apoio">{prazoPorExtenso(dias)}</small></td>
                <td><Etiqueta tom={s === 'VENCIDO' ? 'alerta' : s === 'VENCE_LOGO' ? 'atencao' : 'ok'}>
                  {s === 'VENCIDO' ? 'Vencido' : s === 'VENCE_LOGO' ? 'Renovar' : 'Em dia'}</Etiqueta></td>
                <td>{d.observacao ? <span className="celula-apoio" title={d.observacao}>{d.observacao}</span> : '—'}</td>
                <td className="acoes-contestacao">
                  <button type="button" className="button button-ghost button-sm" onClick={() => setEditando(d)}>Editar</button>
                  <button type="button" className="button button-ghost button-sm acao-recusar" onClick={() => setExcluindo(d)}>Excluir</button>
                </td>
              </tr>
            })}</tbody>
          </table></div>}
    </Painel>

    {editando
      ? <FormDocumento documento={editando === 'novo' ? null : editando} veiculos={veiculos} motoristas={motoristas}
          aoFechar={() => setEditando(null)}
          aoSalvar={mensagem => { setEditando(null); setAviso(mensagem); carregar() }} />
      : null}
    {registrando
      ? <FormVistoria veiculo={registrando.veiculo} vistoria={registrando.vistoria} hoje={hoje}
          aoFechar={() => setRegistrando(null)}
          aoSalvar={mensagem => { setRegistrando(null); setAviso(mensagem); carregar() }} />
      : null}
    {excluindo
      ? <ConfirmarExclusao coisa="documento" nome={`${excluindo.tipo} de ${excluindo.veiculo ?? excluindo.motorista ?? '—'}`}
          aviso="O sistema para de avisar o vencimento deste documento."
          resumo={[['Vence em', data(excluindo.venceEm)]]}
          aoConfirmar={async () => { await excluirDocumento(excluindo.id); setExcluindo(null); setAviso('Documento excluído.'); carregar() }}
          aoFechar={() => setExcluindo(null)} />
      : null}
  </div>
}

function FormDocumento({ documento, veiculos, motoristas, aoFechar, aoSalvar }: {
  documento: Documento | null; veiculos: Veiculo[]; motoristas: Motorista[]
  aoFechar: () => void; aoSalvar: (mensagem: string) => void
}) {
  const [de, setDe] = useState<'viatura' | 'socorrista'>(documento?.motoristaId ? 'socorrista' : 'viatura')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const sugestoes = de === 'viatura' ? TIPOS_DA_VIATURA : TIPOS_DO_SOCORRISTA

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const dono = Number(f.get('dono')) || null
    if (!dono) { setErro(de === 'viatura' ? 'Escolha a viatura.' : 'Escolha o socorrista.'); return }
    const dados = {
      tipo: String(f.get('tipo') ?? ''), venceEm: String(f.get('venceEm') ?? ''), observacao: String(f.get('observacao') ?? ''),
      veiculoId: de === 'viatura' ? dono : null, motoristaId: de === 'socorrista' ? dono : null,
    }
    setSalvando(true); setErro('')
    try {
      if (documento) await atualizarDocumento(documento.id, dados)
      else await criarDocumento(dados)
      aoSalvar(documento ? `Documento ${dados.tipo} atualizado.` : `Documento ${dados.tipo} cadastrado.`)
    } catch (x) { setErro((x as Error).message) } finally { setSalvando(false) }
  }

  return <Modal etiqueta="Documento" titulo={documento ? 'Editar documento' : 'Novo documento'} aoFechar={aoFechar}>
    <form className="form-grid two-columns" onSubmit={salvar}>
      <div className="field field-wide">
        <span>De quem é</span>
        <div className="atalhos-periodo" role="radiogroup" aria-label="De quem é">
          {(['viatura', 'socorrista'] as const).map(o =>
            <button key={o} type="button" role="radio" aria-checked={de === o}
              className={`atalho-periodo${de === o ? ' esta-marcado' : ''}`} onClick={() => setDe(o)}>
              {o === 'viatura' ? 'Viatura' : 'Socorrista'}
            </button>)}
        </div>
      </div>
      {de === 'viatura'
        ? <Selecao key="viatura" rotulo="Viatura" name="dono" vazio="Escolha" required defaultValue={documento?.veiculoId ?? ''}
            opcoes={veiculos.map(v => ({ valor: v.id, texto: v.identificacao }))} />
        : <Selecao key="socorrista" rotulo="Socorrista" name="dono" vazio="Escolha" required defaultValue={documento?.motoristaId ?? ''}
            opcoes={motoristas.map(m => ({ valor: m.id, texto: m.nome }))} />}
      <Campo rotulo="Documento">
        <input name="tipo" list="tipos-de-documento" required defaultValue={documento?.tipo ?? ''} placeholder={sugestoes[0]} autoComplete="off" />
        <datalist id="tipos-de-documento">{sugestoes.map(t => <option key={t} value={t} />)}</datalist>
      </Campo>
      <Campo rotulo="Vence em"><input name="venceEm" type="date" required defaultValue={documento?.venceEm ?? ''} /></Campo>
      <Campo rotulo="Observação" className="field-wide">
        <input name="observacao" placeholder="Opcional: número, seguradora, onde está guardado" defaultValue={documento?.observacao ?? ''} autoComplete="off" />
      </Campo>
      {erro ? <div className="form-alert field-wide" role="alert">{erro}</div> : null}
      <AcoesModal aoCancelar={aoFechar}>
        <button className="button button-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar documento'}</button>
      </AcoesModal>
    </form>
  </Modal>
}

function FormVistoria({ veiculo, vistoria, hoje, aoFechar, aoSalvar }: {
  veiculo: Veiculo; vistoria: VistoriaDaViatura; hoje: string
  aoFechar: () => void; aoSalvar: (mensagem: string) => void
}) {
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState<'APROVADA' | 'REPROVADA'>('APROVADA')
  const referencia = vistoria.referencia ?? hoje.slice(0, 8) + '01'
  const mes = nomeDoMes(Number(referencia.slice(5, 7)))

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setSalvando(true); setErro('')
    try {
      await registrarVistoria({ veiculoId: veiculo.id, referencia, feitaEm: String(f.get('feitaEm') ?? hoje), resultado,
        observacao: String(f.get('observacao') ?? '') })
      aoSalvar(resultado === 'APROVADA'
        ? `Vistoria de ${mes} da ${veiculo.identificacao} registrada como aprovada.`
        : `Vistoria de ${mes} da ${veiculo.identificacao} reprovada: ${DIAS_PARA_CORRIGIR} dias para corrigir e refazer.`)
    } catch (x) { setErro((x as Error).message) } finally { setSalvando(false) }
  }

  return <Modal etiqueta="Vistoria da Porto" titulo={`${veiculo.identificacao} · vistoria de ${mes}`} aoFechar={aoFechar}>
    <form className="form-grid two-columns" onSubmit={salvar}>
      <div className="field field-wide">
        <span>Resultado</span>
        <div className="atalhos-periodo" role="radiogroup" aria-label="Resultado">
          {(['APROVADA', 'REPROVADA'] as const).map(r =>
            <button key={r} type="button" role="radio" aria-checked={resultado === r}
              className={`atalho-periodo${resultado === r ? ' esta-marcado' : ''}`} onClick={() => setResultado(r)}>
              {r === 'APROVADA' ? 'Aprovada' : 'Reprovada'}
            </button>)}
        </div>
      </div>
      <Campo rotulo="Feita em"><input name="feitaEm" type="date" required defaultValue={hoje} max={hoje} /></Campo>
      <Campo rotulo="Observação">
        <input name="observacao" autoComplete="off"
          placeholder={resultado === 'REPROVADA' ? 'O que a Porto pediu para corrigir' : 'Opcional'} />
      </Campo>
      {resultado === 'REPROVADA'
        ? <p className="painel-apoio field-wide">A viatura fica marcada como reprovada, com {DIAS_PARA_CORRIGIR} dias corridos para corrigir. Quando refizer, registre de novo aqui.</p>
        : null}
      {erro ? <div className="form-alert field-wide" role="alert">{erro}</div> : null}
      <AcoesModal aoCancelar={aoFechar}>
        <button className="button button-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar vistoria'}</button>
      </AcoesModal>
    </form>
  </Modal>
}
