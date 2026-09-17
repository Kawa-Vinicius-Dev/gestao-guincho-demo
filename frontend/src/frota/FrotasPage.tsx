import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { usePeriodoGlobal } from '../utils/periodoGlobal'
import { lerIndicadores } from '../dados/dashboard'
import { listarOs } from '../dados/porto/listaOs'
import { lerExtrato } from '../dados/extrato'
import { atualizarVeiculo, criarVeiculo, excluirVeiculo, listarVeiculos } from '../dados/veiculos'
import { ConfirmarExclusao } from '../components/ConfirmarExclusao'
import { Carregando, Vazio } from '../components/EstadoPagina'
import type { Dashboard, LancamentoFinanceiro, Veiculo } from '../types/modelos'
import { data, moeda, numero } from '../utils/formatadores'
import { CampoValor } from '../components/CampoValor'
import { CampoPlaca } from '../components/CamposMascarados'
import { Modal } from '../components/Modal'
import { ehAuxiliar } from '../utils/auxiliar'


export default function FrotasPage(){
  const [periodo,setPeriodo]=usePeriodoGlobal(),[veiculos,setVeiculos]=useState<Veiculo[]>([]),[financeiro,setFinanceiro]=useState<Dashboard|null>(null)
  // Clicar na viatura num painel abre esta tela ja nela: ?veiculo=id ou ?sigla=L168.
  const [busca]=useSearchParams()
  const pedido=useRef({id:Number(busca.get('veiculo'))||0,sigla:(busca.get('sigla')??'').toUpperCase()})
  const [lancamentos,setLancamentos]=useState<LancamentoFinanceiro[]>([]),[selecionado,setSelecionado]=useState(0),[modal,setModal]=useState(false),[mensagem,setMensagem]=useState(''),[erro,setErro]=useState('')
  const [excluindo,setExcluindo]=useState<Veiculo|null>(null)
  const [editando,setEditando]=useState<Veiculo|null>(null),[salvando,setSalvando]=useState(false)
  // Primeira carga mostra o esqueleto; trocar de competencia mantem a tela.
  const [carregando,setCarregando]=useState(true)
  // O que esta viatura rodou nesta competencia e a Porto ainda nao pagou.
  const veiculoDaSigla=veiculos.find(v=>v.id===selecionado)
  const [aguardando,setAguardando]=useState<{total:number;previsto:number;semValor:number}|null>(null)
  useEffect(()=>{const sigla=(veiculoDaSigla?.siglaPorto||veiculoDaSigla?.identificacao||'').toUpperCase()
    if(!sigla||!periodo.inicio||!periodo.fim){setAguardando(null);return}
    let valeu=true
    listarOs({inicio:periodo.inicio,fim:periodo.fim,sigla,situacao:'AGUARDANDO',porCompetencia:true},0,1)
      .then(p=>{if(valeu)setAguardando({total:p.total,previsto:p.valorPrevisto,semValor:p.semValor})})
      .catch(()=>{if(valeu)setAguardando(null)})
    return()=>{valeu=false}},[veiculoDaSigla,periodo.inicio,periodo.fim])

  const carregar=useCallback(async()=>{const {inicio,fim}=periodo;if(!inicio||!fim||inicio>fim)return;try{const [v,d,l]=await Promise.all([listarVeiculos(),lerIndicadores(inicio,fim),lerExtrato(inicio,fim)]);setVeiculos(v);setFinanceiro(d);setLancamentos(l);setSelecionado(atual=>{const p=pedido.current;pedido.current={id:0,sigla:''}
      const escolhido=v.find(x=>x.id===p.id||(p.sigla&&[x.siglaPorto,x.identificacao].some(s=>s?.toUpperCase()===p.sigla)))
      return escolhido?escolhido.id:v.some(x=>x.id===atual)?atual:(v[0]?.id??0)})}catch(e){setErro((e as Error).message)}},[periodo])
  useEffect(()=>{void carregar().finally(()=>setCarregando(false))},[carregar])
  const veiculo=veiculoDaSigla
  const resultado=financeiro?.resultadoPorVeiculo.find(r=>r.veiculoId===selecionado)
  const receitas=resultado?.receitas??0,despesas=resultado?.despesas??0,lucro=resultado?.resultado??0,margem=receitas?lucro/receitas*100:0
  const historico=useMemo(()=>lancamentos.filter(l=>l.veiculoId===selecionado),[lancamentos,selecionado])
  const gastoFrota=financeiro?.resultadoPorVeiculo.reduce((s,r)=>s+r.despesas,0)??0
  const margens=financeiro?.resultadoPorVeiculo.filter(r=>r.receitas>0).map(r=>r.resultado/r.receitas*100)??[]

  async function salvar(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);setSalvando(true);setMensagem('');setErro('')
    const dados={identificacao:String(f.get('identificacao')),placa:String(f.get('placa')||'').trim()||null,modelo:String(f.get('modelo')||''),custoPorKm:Number(f.get('custoPorKm')),siglaPorto:String(f.get('siglaPorto')||'').trim()||null}
    try{
      if(editando)await atualizarVeiculo(editando.id,dados)
      else await criarVeiculo(dados)
      setModal(false);setEditando(null);setMensagem('Veículo salvo no cadastro real.');await carregar()
    }catch(x){setErro((x as Error).message)}finally{setSalvando(false)}}

  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Ativos operacionais</span><h1>Veículos e custos</h1><p>Receitas, despesas e eficiência calculadas a partir dos vínculos reais do PostgreSQL.</p></div><div className="heading-actions"><div className="periodo-no-cabecalho"><SeletorPeriodo periodo={periodo} aoMudar={setPeriodo}/></div><button className="button button-primary" onClick={()=>setModal(true)}>+ Cadastrar veículo</button></div></header>
    {erro&&!modal?<div className="form-alert" role="alert">{erro}</div>:null}{mensagem?<div className="success-notice">{mensagem}</div>:null}
    {carregando?<Carregando/>:<>
    <section className="fleet-summary"><div><span>Gasto total dos veículos</span><strong>{moeda(gastoFrota)}</strong><small>Despesas pagas vinculadas</small></div><div><span>Veículos disponíveis</span><strong>{veiculos.filter(v=>v.ativo).length}/{veiculos.length}</strong><small>Cadastro oficial</small></div><div><span>Melhor margem</span><strong>{Math.max(...margens,0).toFixed(1)}%</strong><small>Entre veículos com receita</small></div></section>
    {veiculos.length?<section className="fleet-layout"><aside className="fleet-list" aria-label="Lista de veículos">{veiculos.map(v=>{const r=financeiro?.resultadoPorVeiculo.find(item=>item.veiculoId===v.id),saldo=r?.resultado??0;return <button key={v.id} className={v.id===selecionado?'active':''} onClick={()=>setSelecionado(v.id)}><span className="vehicle-monogram">{v.identificacao}</span><span><strong>{v.modelo||v.identificacao}</strong><small>{ehAuxiliar(v.identificacao)?'Viatura auxiliar':v.placa??'Placa pendente'} · {v.ativo?'Ativo':'Inativo'}</small></span><span><strong className={saldo>=0?'positive':'negative'}>{moeda(saldo)}</strong><small>Resultado real</small></span></button>})}</aside>
      {veiculo?<div className="fleet-detail"><article className="vehicle-hero"><div><span className="eyebrow">{ehAuxiliar(veiculo.identificacao)?'Viatura auxiliar':veiculo.placa??'Placa pendente'}</span><h2>{veiculo.identificacao} · {ehAuxiliar(veiculo.identificacao)?'Recebe as OS que chegam sem viatura':veiculo.modelo||'Modelo não informado'}</h2><p>Custo operacional informado: {moeda(veiculo.custoPorKm)} por km.</p>
        <p>{veiculo.siglaPorto?<>Aparece como <strong>{veiculo.siglaPorto}</strong> no painel da Porto.</>:<>Sem sigla da Porto — serviços desta viatura não se vinculam sozinhos.</>}</p></div>
      <div><span className={`vehicle-status ${veiculo.ativo?'status-saudavel':'status-monitorar'}`}>{veiculo.ativo?'Ativo':'Inativo'}</span><button className="table-action" onClick={()=>{setEditando(veiculo);setModal(true)}}>Editar</button>{ehAuxiliar(veiculo.identificacao)?null:<button className="table-action table-action-danger" onClick={()=>setExcluindo(veiculo)}>Excluir</button>}</div></article>
        <div className="vehicle-metrics"><article><span>Receita recebida</span><strong>{moeda(receitas)}</strong><small>Vínculo financeiro real</small></article><article><span>Despesas pagas</span><strong>{moeda(despesas)}</strong><small>Custos aprovados</small></article><article className="focus"><span>Resultado</span><strong>{moeda(lucro)}</strong><small>{margem.toFixed(1)}% de margem</small></article>{aguardando&&aguardando.total?<article><span>Aguardando OP</span><strong>{aguardando.total}</strong><small><Link to={`/porto/ordens-servico?situacao=AGUARDANDO&competencia=1&sigla=${encodeURIComponent((veiculo?.siglaPorto||veiculo?.identificacao||'').toUpperCase())}`}>{moeda(aguardando.previsto)} previstos{aguardando.semValor?` · ${aguardando.semValor} sem valor`:''}</Link></small></article>:null}<article><span>Km morto</span><strong>{numero(resultado?.kmMorto??0)} km</strong><small>{moeda(resultado?.custoKmMorto??0)} improdutivos</small></article></div>
        <article className="panel vehicle-history"><header className="panel-title"><div><span className="eyebrow">Auditoria individual</span><h2>Histórico financeiro</h2></div></header>{historico.length?<div className="table-scroll"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Situação</th><th>Valor</th></tr></thead><tbody>{historico.map(item=><tr key={item.id}><td>{data(item.data)}</td><td><strong>{item.descricao}</strong></td><td>{item.categoria}</td><td>{item.realizado?'Realizado':'Previsto'}</td><td className={item.tipo==='RECEITA'?'positive':'negative'}>{item.tipo==='RECEITA'?'+':'−'} {moeda(item.valor)}</td></tr>)}</tbody></table></div>:<p className="empty-inline">Nenhum movimento vinculado ao veículo nesta competência.</p>}</article>
      </div>:null}</section>:<Vazio titulo="Nenhum veículo" descricao="Cadastre o primeiro veículo para acompanhar seus resultados reais."/>}
    </>}
    {modal?<Modal etiqueta="Cadastro oficial" titulo={editando?'Editar veículo':'Novo veículo'} aoFechar={()=>{setModal(false);setEditando(null);setErro('')}}>{erro?<div className="form-alert" role="alert">{erro}</div>:null}<form onSubmit={salvar} className="form-grid two-columns"><label className="field"><span>Identificador</span><input name="identificacao" defaultValue={editando?.identificacao??''} required autoCapitalize="characters" autoCorrect="off" spellCheck={false}/></label><CampoPlaca rotulo="Placa" name="placa" defaultValue={editando?.placa}/><label className="field field-wide"><span>Modelo</span><input name="modelo" defaultValue={editando?.modelo??''} autoCapitalize="words" autoComplete="off"/></label><CampoValor rotulo="Custo por km" name="custoPorKm" defaultValue={editando?.custoPorKm} exigirPositivo={false} required
          ajuda="Quanto este veículo custa por quilômetro rodado. É o que transforma km morto em dinheiro no dashboard."/>
        <label className="field"><span>Sigla na Porto</span><input name="siglaPorto" defaultValue={editando?.siglaPorto??''} placeholder="Sigla da viatura" autoCapitalize="characters" autoCorrect="off" spellCheck={false}/><small>Como a Porto chama esta viatura no painel do dia. É o que liga o serviço importado a este veículo.</small></label>
        <div className="modal-actions field-wide"><button type="button" className="button button-ghost" onClick={()=>{setModal(false);setEditando(null)}}>Cancelar</button><button className="button button-primary" disabled={salvando}>{salvando?'Salvando…':'Salvar veículo'}</button></div></form></Modal>:null}
    {excluindo?<ConfirmarExclusao coisa="viatura" nome={excluindo.identificacao}
      aviso="A viatura sai do cadastro. Se já tiver despesa, km ou receita ligada, o sistema não deixa excluir."
      resumo={[['Viatura',excluindo.identificacao],['Placa',excluindo.placa??'Pendente']]}
      aoConfirmar={async()=>{await excluirVeiculo(excluindo.id);setMensagem(`Viatura ${excluindo.identificacao} excluída.`);await carregar()}}
      aoFechar={()=>setExcluindo(null)}/>:null}
  </div>
}
