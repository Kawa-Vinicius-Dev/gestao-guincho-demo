import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { LinkSocorrista, LinkViatura } from '../components/LinksDeDado'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { usePeriodoGlobal } from '../utils/periodoGlobal'
import { atualizarQuilometragem, excluirQuilometragem, listarQuilometragens } from '../dados/quilometragem'
import { ConfirmarExclusao } from '../components/ConfirmarExclusao'
import { useAuth } from '../auth/AuthContext'
import { listarMotoristas } from '../dados/motoristas'
import { listarVeiculos } from '../dados/veiculos'
import { CampoNumero } from '../components/CamposMascarados'
import { Carregando, Vazio } from '../components/EstadoPagina'
import type { Motorista, Quilometragem, Veiculo } from '../types/modelos'
import { data, moeda, numero } from '../utils/formatadores'
import { Selecao } from '../components/Campos'
import { Modal } from '../components/Modal'

function hojeLocal() {
  const hoje = new Date()
  const deslocamento = hoje.getTimezoneOffset() * 60_000
  return new Date(hoje.getTime() - deslocamento).toISOString().slice(0, 10)
}

export default function QuilometragemPage() {
  const [registros, setRegistros] = useState<Quilometragem[]>([])
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [motoristas, setMotoristas] = useState<Motorista[]>([])
  const [carregando, setCarregando] = useState(true)
  const [periodo, setPeriodo] = usePeriodoGlobal()
  const [modal, setModal] = useState(false)
  const admin = useAuth().usuario?.perfil === 'ADMINISTRADOR'
  const [editando, setEditando] = useState<Quilometragem | null>(null)
  const [excluindo, setExcluindo] = useState<Quilometragem | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')

  async function carregar() {
    const [quilometragens, veiculosCadastrados, motoristasCadastrados] = await Promise.all([
      listarQuilometragens(periodo.inicio && periodo.fim && periodo.inicio <= periodo.fim ? { inicio: periodo.inicio, fim: periodo.fim } : undefined),
      listarVeiculos(),
      listarMotoristas(),
    ])
    setRegistros(quilometragens)
    setVeiculos(veiculosCadastrados)
    setMotoristas(motoristasCadastrados)
  }

  useEffect(() => {
    void carregar()
      .catch(falha => setErro((falha as Error).message))
      .finally(() => setCarregando(false))
  }, [periodo.inicio, periodo.fim])

  const registrosDoMes = useMemo(() => registros
    .filter(item => item.data >= periodo.inicio && item.data <= periodo.fim)
    .sort((a, b) => b.data.localeCompare(a.data)), [registros, periodo.inicio, periodo.fim])
  const kmRodado = registrosDoMes.reduce((total, item) => total + item.quilometragemTotal, 0)
  const kmMorto = registrosDoMes.reduce((total, item) => total + item.kmMorto, 0)
  const custo = registrosDoMes.reduce((total, item) => total + item.custoKmMorto, 0)
  const percentual = kmRodado > 0 ? (kmMorto / kmRodado) * 100 : 0
  const comparativo = Object.values(registrosDoMes.reduce<Record<string, { veiculo: string; km: number; morto: number; custo: number }>>((grupos, item) => {
    const grupo = grupos[item.veiculo] ?? { veiculo: item.veiculo, km: 0, morto: 0, custo: 0 }
    grupo.km += item.quilometragemTotal
    grupo.morto += item.kmMorto
    grupo.custo += item.custoKmMorto
    grupos[item.veiculo] = grupo
    return grupos
  }, {}))

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const form = new FormData(evento.currentTarget)
    setErro('')
    try {
      const veiculoEscolhido=veiculos.find(v=>v.id===Number(form.get('veiculoId')))
      const dados = {
        data: String(form.get('data')),
        veiculoId: Number(form.get('veiculoId')),
        motoristaId: form.get('motoristaId') ? Number(form.get('motoristaId')) : null,
        protocolo: String(form.get('protocolo')||'')||null,
        hodometroInicial: Number(form.get('hodometroInicial')),
        hodometroFinal: Number(form.get('hodometroFinal')),
        quilometragemRemunerada: Number(form.get('quilometragemRemunerada')),
        // O custo do km e congelado no registro, como o backend fazia.
        custoPorKm: veiculoEscolhido?.custoPorKm ?? 0,
        confirmarExcesso: form.get('confirmarExcesso') === 'on',
        observacoes: String(form.get('observacoes')||'')||null,
      }
      // Registro novo so nasce da aprovacao do turno (Kawa, 24/09/2026): aqui so se corrige.
      if (!editando) return
      // O custo do km fica o do registro; so muda se a viatura mudou.
      await atualizarQuilometragem(editando.id, { ...dados, custoPorKm: dados.veiculoId === editando.veiculoId ? editando.custoPorKm : dados.custoPorKm })
      await carregar()
      setModal(false)
      setMensagem('Quilometragem atualizada.')
      setEditando(null)
    } catch (erro) {
      setErro((erro as Error).message)
    }
  }

  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Eficiência operacional</span><h1>Quilometragem</h1><p>Km rodado, km em serviço e km morto de cada viatura no período. Cada linha nasce da aprovação do turno do socorrista.</p></div></header>
    <section className="panel painel-filtros"><form className="ledger-filters" onSubmit={e=>e.preventDefault()}><SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/></form></section>
    {erro && !modal ? <div className="form-alert" role="alert">{erro}</div> : null}
    {mensagem ? <div className="success-notice">{mensagem}</div> : null}

    <section className="km-definitions">
      <article><span className="km-symbol paid">KM</span><div><strong>Km rodado</strong><p>Diferença oficial entre os hodômetros final e inicial.</p></div></article>
      <article><span className="km-symbol dead">0</span><div><strong>Km morto</strong><p>O km rodado menos o km em serviço que o socorrista lançou.</p></div></article>
    </section>

    <section className="km-overview">
      <div><span>Km rodado</span><strong>{numero(kmRodado)} km</strong><small>100% do percurso</small></div>
      <div className={percentual > 15 ? 'danger' : ''}><span>Km morto</span><strong>{numero(kmMorto)} km</strong><small>{percentual.toFixed(1)}% do percurso</small></div>
      <div><span>Custo improdutivo</span><strong>{moeda(custo)}</strong><small>Km morto × custo por km</small></div>
    </section>

    <section className="panel km-vehicles"><header className="panel-title"><div><span className="eyebrow">Comparativo</span><h2>Eficiência por veículo</h2></div></header>
      {carregando ? <Carregando/> : comparativo.length ? <div className="km-comparison">{comparativo.map(item => {
        const taxa = item.km > 0 ? (item.morto / item.km) * 100 : 0
        return <article key={item.veiculo} className={taxa > 15 ? 'danger' : ''}><header><strong><LinkViatura sigla={item.veiculo}/></strong><strong>{taxa.toFixed(1)}%</strong></header><div className="km-scale"><span style={{ width: `${Math.min(100, taxa)}%` }}/></div><footer><span>{numero(item.morto)} km mortos</span><strong>{moeda(item.custo)}</strong></footer></article>
      })}</div> : <Vazio titulo="Nenhuma quilometragem" descricao="Não há registros no período selecionado."/>}
    </section>

    <section className="panel km-ledger"><header className="panel-title"><div><span className="eyebrow">Diário de bordo</span><h2>Registros do período</h2></div></header>
      {carregando ? <Carregando/> : registrosDoMes.length ? <div className="table-scroll"><table><thead><tr><th>Data</th><th>Veículo</th><th>Socorrista</th><th>Hodômetros</th><th>Km rodado</th><th>Km em serviço</th><th>Km morto</th><th>Custo</th>{admin ? <th/> : null}</tr></thead><tbody>
        {registrosDoMes.map(item => <tr key={item.id}><td>{data(item.data)}</td><td><strong><LinkViatura id={item.veiculoId} sigla={item.veiculo}/></strong></td><td><LinkSocorrista id={item.motoristaId} nome={item.motorista}/></td><td>{numero(item.hodometroInicial)} → {numero(item.hodometroFinal)}</td><td>{numero(item.quilometragemTotal)} km</td><td>{numero(item.quilometragemRemunerada)} km</td><td><strong>{numero(item.kmMorto)} km</strong></td><td>{moeda(item.custoKmMorto)}</td>{admin ? <td><span className="acoes-da-linha"><button className="table-action" onClick={() => { setEditando(item); setModal(true) }}>Editar</button><button className="table-action table-action-danger" onClick={() => setExcluindo(item)}>Excluir</button></span></td> : null}</tr>)}
      </tbody></table></div> : <Vazio titulo="Sem registros no período" descricao="Selecione outra competência ou registre a primeira quilometragem."/>}
    </section>

    {modal ? <Modal etiqueta="Diário de bordo" titulo={editando ? 'Editar quilometragem' : 'Registrar quilometragem'} largo aoFechar={() => { setModal(false); setEditando(null); setErro('') }}>
      {erro ? <div className="form-alert" role="alert">{erro}</div> : null}
      <form onSubmit={salvar} className="form-grid three-columns">
        <label className="field"><span>Data</span><input name="data" type="date" defaultValue={editando?.data ?? hojeLocal()} required/></label>
        <Selecao rotulo="Veículo" name="veiculoId" required vazio="Selecione" defaultValue={editando?.veiculoId ?? ''}
          opcoes={veiculos.map(item => ({valor:item.id, texto:`${item.identificacao}${item.modelo ? ` · ${item.modelo}` : ''}`}))}/>
        <Selecao rotulo="Socorrista" name="motoristaId" vazio="Não informado" defaultValue={editando?.motoristaId ?? ''}
          opcoes={motoristas.map(item => ({valor:item.id, texto:item.nome}))}/>
        <CampoNumero rotulo="Hodômetro inicial" name="hodometroInicial" min={0} defaultValue={editando ? String(editando.hodometroInicial) : undefined} required/>
        <CampoNumero rotulo="Hodômetro final" name="hodometroFinal" min={0} defaultValue={editando ? String(editando.hodometroFinal) : undefined} required/>
        <CampoNumero rotulo="Quilometragem remunerada" name="quilometragemRemunerada" min={0} defaultValue={editando ? String(editando.quilometragemRemunerada) : undefined} required/>
        <label className="field"><span>Protocolo</span><input name="protocolo" defaultValue={editando?.protocolo} autoCapitalize="characters" autoCorrect="off" spellCheck={false}/></label>
        <label className="field two-span"><span>Observações</span><textarea name="observacoes" rows={3} defaultValue={editando?.observacoes}/></label>
        <label className="check-line field-wide"><input name="confirmarExcesso" type="checkbox"/><span>Confirmo eventual quilometragem remunerada acima do total.</span></label>
        <div className="modal-actions field-wide"><button type="button" className="button button-ghost" onClick={() => { setModal(false); setEditando(null) }}>Cancelar</button><button className="button button-primary">{editando ? 'Salvar alterações' : 'Salvar registro'}</button></div>
      </form>
    </Modal> : null}
    {excluindo ? <ConfirmarExclusao coisa="registro de km" nome={`${excluindo.veiculo} ${data(excluindo.data)}`}
      aviso="O registro sai da lista e dos totais de km."
      resumo={[['Data', data(excluindo.data)], ['Viatura', excluindo.veiculo], ['Km rodado', `${numero(excluindo.quilometragemTotal)} km`]]}
      aoConfirmar={async () => { await excluirQuilometragem(excluindo.id); setMensagem('Registro de km excluído.'); await carregar() }}
      aoFechar={() => setExcluindo(null)}/> : null}
  </div>
}
