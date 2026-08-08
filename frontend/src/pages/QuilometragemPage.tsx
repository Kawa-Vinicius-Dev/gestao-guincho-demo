import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../api/http'
import { Vazio } from '../components/EstadoPagina'
import type { Motorista, Quilometragem, Veiculo } from '../types/modelos'
import { data, moeda, numero } from '../utils/formatadores'

function mesAtual() {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
}

function hojeLocal() {
  const hoje = new Date()
  const deslocamento = hoje.getTimezoneOffset() * 60_000
  return new Date(hoje.getTime() - deslocamento).toISOString().slice(0, 10)
}

export default function QuilometragemPage() {
  const [registros, setRegistros] = useState<Quilometragem[]>([])
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [motoristas, setMotoristas] = useState<Motorista[]>([])
  const [mes, setMes] = useState(mesAtual)
  const [modal, setModal] = useState(false)
  const [mensagem, setMensagem] = useState('')

  async function carregar() {
    const [quilometragens, veiculosCadastrados, motoristasCadastrados] = await Promise.all([
      api<Quilometragem[]>('/api/quilometragens'),
      api<Veiculo[]>('/api/veiculos'),
      api<Motorista[]>('/api/motoristas'),
    ])
    setRegistros(quilometragens)
    setVeiculos(veiculosCadastrados)
    setMotoristas(motoristasCadastrados)
  }

  useEffect(() => {
    void carregar().catch(erro => setMensagem((erro as Error).message))
  }, [])

  const registrosDoMes = useMemo(() => registros
    .filter(item => item.data.startsWith(mes))
    .sort((a, b) => b.data.localeCompare(a.data)), [registros, mes])
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
    try {
      await api('/api/quilometragens', {
        method: 'POST',
        body: JSON.stringify({
          data: form.get('data'),
          veiculoId: Number(form.get('veiculoId')),
          motoristaId: form.get('motoristaId') ? Number(form.get('motoristaId')) : null,
          protocolo: form.get('protocolo') || null,
          hodometroInicial: Number(form.get('hodometroInicial')),
          hodometroFinal: Number(form.get('hodometroFinal')),
          quilometragemRemunerada: Number(form.get('quilometragemRemunerada')),
          confirmarExcesso: form.get('confirmarExcesso') === 'on',
          observacoes: form.get('observacoes') || null,
        }),
      })
      await carregar()
      setModal(false)
      setMensagem('Quilometragem registrada na base oficial.')
    } catch (erro) {
      setMensagem((erro as Error).message)
    }
  }

  return <div className="page-enter">
    <header className="page-heading"><div><span className="eyebrow">Eficiência operacional</span><h1>Km rodado e km morto</h1><p>Distâncias e custos registrados no banco oficial da operação.</p></div>
      <div className="heading-actions"><label className="month-picker"><span>Competência</span><input type="month" value={mes} onChange={evento => setMes(evento.target.value)}/></label><button className="button button-primary" onClick={() => setModal(true)}>+ Registrar quilometragem</button></div></header>
    {mensagem ? <div className="success-notice">{mensagem}</div> : null}

    <section className="km-definitions">
      <article><span className="km-symbol paid">KM</span><div><strong>Km rodado</strong><p>Diferença oficial entre os hodômetros final e inicial.</p></div></article>
      <article><span className="km-symbol dead">0</span><div><strong>Km morto</strong><p>O backend calcula a diferença entre a quilometragem total e a remunerada.</p></div></article>
    </section>

    <section className="km-overview">
      <div><span>Km rodado</span><strong>{numero(kmRodado)} km</strong><small>100% do percurso</small></div>
      <div className={percentual > 15 ? 'danger' : ''}><span>Km morto</span><strong>{numero(kmMorto)} km</strong><small>{percentual.toFixed(1)}% do percurso</small></div>
      <div><span>Custo improdutivo</span><strong>{moeda(custo)}</strong><small>Calculado pelo backend</small></div>
    </section>

    <section className="panel km-vehicles"><header className="panel-title"><div><span className="eyebrow">Comparativo</span><h2>Eficiência por veículo</h2></div></header>
      {comparativo.length ? <div className="km-comparison">{comparativo.map(item => {
        const taxa = item.km > 0 ? (item.morto / item.km) * 100 : 0
        return <article key={item.veiculo} className={taxa > 15 ? 'danger' : ''}><header><strong>{item.veiculo}</strong><strong>{taxa.toFixed(1)}%</strong></header><div className="km-scale"><span style={{ width: `${Math.min(100, taxa)}%` }}/></div><footer><span>{numero(item.morto)} km mortos</span><strong>{moeda(item.custo)}</strong></footer></article>
      })}</div> : <Vazio titulo="Nenhuma quilometragem" descricao="Não há registros no período selecionado."/>}
    </section>

    <section className="panel km-ledger"><header className="panel-title"><div><span className="eyebrow">Diário de bordo</span><h2>Registros do período</h2></div></header>
      {registrosDoMes.length ? <div className="table-scroll"><table><thead><tr><th>Data</th><th>Veículo</th><th>Funcionário</th><th>Hodômetros</th><th>Km rodado</th><th>Km remunerado</th><th>Km morto</th><th>Custo</th></tr></thead><tbody>
        {registrosDoMes.map(item => <tr key={item.id}><td>{data(item.data)}</td><td><strong>{item.veiculo}</strong></td><td>{item.motorista ?? '—'}</td><td>{numero(item.hodometroInicial)} → {numero(item.hodometroFinal)}</td><td>{numero(item.quilometragemTotal)} km</td><td>{numero(item.quilometragemRemunerada)} km</td><td><strong>{numero(item.kmMorto)} km</strong></td><td>{moeda(item.custoKmMorto)}</td></tr>)}
      </tbody></table></div> : <Vazio titulo="Sem registros no período" descricao="Selecione outra competência ou registre a primeira quilometragem."/>}
    </section>

    {modal ? <div className="modal-backdrop"><section className="modal modal-wide" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Diário de bordo</span><h2>Registrar quilometragem</h2></div><button aria-label="Fechar" onClick={() => setModal(false)}>×</button></header>
      <form onSubmit={salvar} className="form-grid three-columns">
        <label className="field"><span>Data</span><input name="data" type="date" defaultValue={hojeLocal()} required/></label>
        <label className="field"><span>Veículo</span><select name="veiculoId" required><option value="">Selecione</option>{veiculos.map(item => <option value={item.id} key={item.id}>{item.identificacao}{item.modelo ? ` · ${item.modelo}` : ''}</option>)}</select></label>
        <label className="field"><span>Funcionário</span><select name="motoristaId"><option value="">Não informado</option>{motoristas.map(item => <option value={item.id} key={item.id}>{item.nome}</option>)}</select></label>
        <label className="field"><span>Hodômetro inicial</span><input name="hodometroInicial" type="number" min="0" step=".01" required/></label>
        <label className="field"><span>Hodômetro final</span><input name="hodometroFinal" type="number" min="0" step=".01" required/></label>
        <label className="field"><span>Quilometragem remunerada</span><input name="quilometragemRemunerada" type="number" min="0" step=".01" required/></label>
        <label className="field"><span>Protocolo</span><input name="protocolo"/></label>
        <label className="field two-span"><span>Observações</span><textarea name="observacoes" rows={3}/></label>
        <label className="check-line field-wide"><input name="confirmarExcesso" type="checkbox"/><span>Confirmo eventual quilometragem remunerada acima do total.</span></label>
        <div className="modal-actions field-wide"><button type="button" className="button button-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary">Salvar registro</button></div>
      </form>
    </section></div> : null}
  </div>
}
