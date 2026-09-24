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

  const carregar = useCallback(() => {
    setErro('')
    listarDocumentos().then(setLista).catch(e => setErro((e as Error).message))
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
    </GradeIndicadores>

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
