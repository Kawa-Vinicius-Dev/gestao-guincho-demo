import { useEffect, useState, type FormEvent } from 'react'
import { criarPendenciaPorto, listarPendenciasPorto, resolverPendenciaPorto } from '../dados/porto'
import { Carregando, Vazio } from '../components/EstadoPagina'
import type { PendenciaPorto } from '../types/modelos'
import { moeda } from '../utils/formatadores'
import { FormularioPendencia } from './pendencias/FormularioPendencia'
import { data } from './ops/opcoes'

const tipo = (valor: PendenciaPorto['tipo']) =>
  valor === 'SERVICO_PENDENTE' ? 'Serviço pendente'
  : valor === 'SERVICO_DEVOLVIDO' ? 'Serviço devolvido'
  : valor === 'OS_SEM_SOCORRISTA' ? 'OS sem socorrista'
  : 'Recebimento de OP'

export default function PortoPendenciasPage() {
  const [itens, setItens] = useState<PendenciaPorto[]>([])
  const [erro, setErro] = useState('')
  const [aberta, setAberta] = useState(false)
  const [carregando, setCarregando] = useState(true)

  async function carregar() {
    try { setItens(await listarPendenciasPorto()) }
    catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }
  useEffect(() => { void carregar() }, [])

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const campos = new FormData(evento.currentTarget)
    try {
      await criarPendenciaPorto({
        numeroOs: campos.get('numeroOs'), motivo: campos.get('motivo'),
        valor: Number(campos.get('valor')), dataPendencia: campos.get('dataPendencia'),
        observacao: campos.get('observacao'), responsavel: campos.get('responsavel'),
        statusFinanceiro: campos.get('statusFinanceiro'),
        prazo: campos.get('prazo') || null,
        referenciaPorto: campos.get('referenciaPorto') || null,
      })
      setAberta(false)
      await carregar()
    } catch (e) { setErro((e as Error).message) }
  }

  async function resolver(id: number) {
    try { await resolverPendenciaPorto(id); await carregar() }
    catch (e) { setErro((e as Error).message) }
  }

  return <div className="page-enter">
    <header className="page-heading">
      <div>
        <span className="eyebrow">Porto Seguro</span>
        <h1>Pendências financeiras</h1>
        <p>Tratativas que continuam sendo executadas diretamente no portal da Porto.</p>
      </div>
      <button className="button button-primary" onClick={() => setAberta(true)}>Nova pendência</button>
    </header>

    {erro ? <div className="form-alert">{erro}</div> : null}

    <section className="panel">
      {carregando ? <Carregando/> : itens.length
        ? <div className="table-scroll">
            <table>
              <thead><tr>
                <th>Tipo</th><th>Referência</th><th>Motivo</th><th>Data</th><th>Valor</th>
                <th>Responsável</th><th>Prazo</th><th>Situação</th><th/>
              </tr></thead>
              <tbody>
                {itens.map((p, indice) => <tr key={`${p.tipo}-${p.referenciaId}-${indice}`}>
                  <td><strong>{tipo(p.tipo)}</strong></td>
                  <td>{p.referencia}</td>
                  <td>{p.motivo || '—'}</td>
                  <td>{data(p.data)}</td>
                  <td>{moeda(p.valor)}</td>
                  <td>{p.responsavel || '—'}</td>
                  <td>{data(p.prazo)}</td>
                  <td><span className="ledger-status ledger-pendente">{p.situacao}</span></td>
                  <td>
                    {p.id && p.tipo === 'SERVICO_PENDENTE'
                      ? <button className="table-action" onClick={() => void resolver(p.id as number)}>Resolver</button>
                      : null}
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        : <Vazio titulo="Nenhuma pendência" descricao="Não há pagamentos ou tratativas em aberto."/>}
    </section>

    {aberta ? <FormularioPendencia aoEnviar={salvar} aoFechar={() => setAberta(false)}/> : null}
  </div>
}
