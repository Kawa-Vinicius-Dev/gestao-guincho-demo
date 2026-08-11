import { useEffect, useState } from 'react'
import { avaliarImportacaoPortoPorNumero, cancelarImportacaoPorto, confirmarImportacaoPortoPorNumero, confirmarImportacaoPortoSemOp, criarPreviaConteudoPorto, criarPreviaPorto, listarCalendarioPorto } from '../api/porto'
import type { CalendarioPorto, PreviaPorto } from '../types/modelos'
import { moeda } from '../utils/formatadores'

const rotulos={PREVISAO_RECEBER:'Previsão a receber',OS_VINCULADAS:'OS vinculadas à OP',SERVICOS_DEVOLVIDOS:'Serviços devolvidos',SERVICOS_GERAIS:'Serviços gerais da Porto',SERVICOS_AGUARDANDO_LANCAMENTO:'Serviços aguardando lançamento'}
const dataBr=(valor?:string)=>valor?new Date(`${valor}T12:00:00`).toLocaleDateString('pt-BR'):''

export default function PortoImportacoesPage(){
  const [arquivo,setArquivo]=useState<File|null>(null),[previa,setPrevia]=useState<PreviaPorto|null>(null)
  const [modo,setModo]=useState<'arquivo'|'colagem'>('arquivo'),[conteudo,setConteudo]=useState('')
  const [periodos,setPeriodos]=useState<CalendarioPorto[]>([]),[numeroOp,setNumeroOp]=useState(''),[periodoId,setPeriodoId]=useState('')
  const [mensagem,setMensagem]=useState(''),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(false),[validando,setValidando]=useState(false),[inputKey,setInputKey]=useState(0)
  const [chaveValidada,setChaveValidada]=useState('')
  const [confirmarDivergencias,setConfirmarDivergencias]=useState(false),[confirmarReassociacoes,setConfirmarReassociacoes]=useState(false)
  const [motivoDivergencia,setMotivoDivergencia]=useState(''),[justificativaDivergencia,setJustificativaDivergencia]=useState('')

  useEffect(()=>{listarCalendarioPorto().then(setPeriodos).catch(e=>setErro(e.message))},[])

  const numeroNormalizado=numeroOp.trim(),previaId=previa?.id,requerOrdemPagamento=Boolean(previa?.requerOrdemPagamento)
  const chaveAvaliacao=previaId&&requerOrdemPagamento&&numeroNormalizado&&periodoId?`${previaId}:${numeroNormalizado}:${periodoId}`:''
  useEffect(()=>{
    if(!chaveAvaliacao||!previaId){setValidando(false);setChaveValidada('');return}
    if(chaveValidada===chaveAvaliacao){setValidando(false);return}
    const controller=new AbortController(),temporizador=window.setTimeout(async()=>{
      setValidando(true);setErro('')
      try{
        const resposta=await avaliarImportacaoPortoPorNumero(previaId,{numeroOrdemPagamento:numeroNormalizado,calendarioPagamentoId:Number(periodoId)},controller.signal)
        if(!controller.signal.aborted){setPrevia(resposta);setChaveValidada(chaveAvaliacao)}
      }catch(e){if(!controller.signal.aborted)setErro((e as Error).message)}
      finally{if(!controller.signal.aborted)setValidando(false)}
    },150)
    return()=>{window.clearTimeout(temporizador);controller.abort()}
  },[chaveAvaliacao,chaveValidada,numeroNormalizado,periodoId,previaId])

  function limparConfirmacoes(){setConfirmarDivergencias(false);setConfirmarReassociacoes(false);setMotivoDivergencia('');setJustificativaDivergencia('')}
  async function analisar(){
    if(modo==='arquivo'&&!arquivo||modo==='colagem'&&!conteudo.trim())return
    setCarregando(true);setErro('');setNumeroOp('');setPeriodoId('');setChaveValidada('');limparConfirmacoes()
    try{setPrevia(modo==='arquivo'?await criarPreviaPorto(arquivo as File):await criarPreviaConteudoPorto(conteudo))}catch(e){setErro((e as Error).message)}finally{setCarregando(false)}
  }
  function alterarNumero(valor:string){setNumeroOp(valor);setChaveValidada('');limparConfirmacoes()}
  function alterarPeriodo(valor:string){setPeriodoId(valor);setChaveValidada('');limparConfirmacoes()}
  async function confirmar(){
    if(!previa||previa.requerOrdemPagamento&&(!numeroNormalizado||!periodoId||chaveValidada!==chaveAvaliacao))return
    setCarregando(true);setErro('')
    try{
      const r=previa.requerOrdemPagamento
        ?await confirmarImportacaoPortoPorNumero(previa.id,{numeroOrdemPagamento:numeroNormalizado,calendarioPagamentoId:Number(periodoId),confirmarDivergencias,confirmarReassociacoes,motivoDivergencia:motivoDivergencia||undefined,justificativaDivergencia:justificativaDivergencia.trim()||undefined})
        :await confirmarImportacaoPortoSemOp(previa.id,confirmarDivergencias)
      const financeiro=r.tipo==='OS_VINCULADAS'||r.tipo==='SERVICOS_GERAIS'?` · ${r.receitasCriadas} ${r.receitasCriadas===1?'receita criada':'receitas criadas'} · ${r.receitasAtualizadas} ${r.receitasAtualizadas===1?'receita atualizada':'receitas atualizadas'} · ${moeda(r.valorTotalRecebido)} recebidos${r.quinzena?` · período ${r.quinzena}`:''}${r.dataPagamento?` · pagamento em ${dataBr(r.dataPagamento)}`:''}`:''
      setMensagem(`${r.importados} ${r.importados===1?'registro importado':'registros importados'}${r.ignorados?` · ${r.ignorados} ignorados por duplicidade`:''}${financeiro}.`)
      setPrevia(null);setArquivo(null);setNumeroOp('');setPeriodoId('');setChaveValidada('');limparConfirmacoes();setInputKey(x=>x+1)
    }catch(e){setErro((e as Error).message)}finally{setCarregando(false)}
  }
  async function cancelar(){
    if(!previa)return;setCarregando(true);setErro('')
    try{await cancelarImportacaoPorto(previa.id);setMensagem('Prévia cancelada. Corrija e reenvie o arquivo quando estiver pronto.');setPrevia(null);setArquivo(null);setNumeroOp('');setPeriodoId('');setChaveValidada('');limparConfirmacoes();setInputKey(x=>x+1)}catch(e){setErro((e as Error).message)}finally{setCarregando(false)}
  }
  function limpar(){setConteudo('');setArquivo(null);setPrevia(null);setErro('');setMensagem('');setNumeroOp('');setPeriodoId('');setChaveValidada('');limparConfirmacoes();setInputKey(x=>x+1)}

  const temErros=Boolean(previa?.erros.length||previa?.linhas.some(l=>l.acao==='ERRO'))
  const analise=chaveValidada===chaveAvaliacao&&previa?.analiseOrdemPagamento?.numero===numeroNormalizado?previa.analiseOrdemPagamento:undefined
  const numerosReassociados=new Set(analise?.reassociacoes.map(item=>item.numeroOs)??[])
  const temDivergenciasDados=Boolean(analise&&previa?.linhas.some(l=>l.acao==='DIVERGENCIA'&&!numerosReassociados.has(l.dados.numero_os)))
  const temDivergenciaFinanceira=Boolean(analise?.existente&&analise.diferenca!==undefined&&Math.abs(analise.diferenca)>0.009)
  const temReassociacoes=Boolean(analise?.quantidadeReassociacoes)
  const divergenciaConfirmada=(!temDivergenciaFinanceira&&!temDivergenciasDados)||(confirmarDivergencias&&(!temDivergenciaFinanceira||Boolean(motivoDivergencia&&justificativaDivergencia.trim())))

  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Módulo Porto</span><h1>Importar relatórios</h1><p>Cole serviços ou envie CSV/TXT, confira a prévia e confirme somente depois da validação.</p></div></header>
    {erro?<div className="form-alert">{erro}</div>:null}{mensagem?<div className="success-notice">{mensagem}</div>:null}
    <section className="panel porto-import-card"><div className="segmented porto-import-modes" role="group" aria-label="Forma de importação"><button className={modo==='arquivo'?'active':''} onClick={()=>{setModo('arquivo');setPrevia(null)}}>Enviar arquivo</button><button className={modo==='colagem'?'active':''} onClick={()=>{setModo('colagem');setPrevia(null)}}>Colar serviços da Porto</button></div>
      {modo==='arquivo'?<div className="porto-upload"><label className="field"><span>Arquivo CSV ou TXT</span><input key={inputKey} aria-label="Arquivo CSV" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={e=>{setArquivo(e.target.files?.[0]??null);setPrevia(null);setMensagem('')}}/></label><button className="button button-primary" disabled={!arquivo||carregando} onClick={analisar}>{carregando?'Analisando…':'Analisar CSV'}</button></div>:<div className="porto-paste"><label className="field"><span>Conteúdo copiado da Porto</span><textarea aria-label="Conteúdo copiado da Porto" rows={10} value={conteudo} onChange={e=>{setConteudo(e.target.value);setPrevia(null);setMensagem('')}} placeholder="Cole aqui a tabela copiada com Ctrl+C"/></label><div className="porto-paste-actions"><button className="button button-ghost" type="button" onClick={limpar}>Limpar</button><button className="button button-primary" disabled={!conteudo.trim()||carregando} onClick={analisar}>{carregando?'Analisando…':'Analisar conteúdo'}</button></div></div>}
      {previa?<div className="porto-preview"><header className="panel-title"><div><span className="eyebrow">Prévia detectada</span><h2>{rotulos[previa.tipo]}</h2></div><span className="import-pill">{previa.totalLinhas} linhas</span></header>
        {previa.resumo?<div className="porto-preview-summary"><span><strong>{previa.resumo.linhasAnalisadas}</strong> linhas analisadas</span>{previa.tipo==='PREVISAO_RECEBER'?<span><strong>{previa.resumo.opsUnicas}</strong> OPs únicas</span>:null}<span><strong>{previa.resumo.registrosNovos}</strong> registros novos</span><span><strong>{previa.resumo.registrosExistentes}</strong> já existentes</span>{previa.tipo==='PREVISAO_RECEBER'?<span><strong>{previa.resumo.registrosAtualizados}</strong> {previa.resumo.registrosAtualizados===1?'registro atualizado':'registros atualizados'}</span>:null}<span><strong>{previa.resumo.duplicidades}</strong> duplicidades</span><span><strong>{previa.resumo.erros}</strong> erros</span><span><strong>{moeda(previa.resumo.valorTotal)}</strong> valor total</span></div>:null}
        {temErros?<div className="form-alert"><strong>Corrija e reenvie o arquivo.</strong> {previa.erros.join(' · ')}</div>:null}
        <footer className="porto-confirm porto-confirm-sticky" aria-label="Ações da prévia">
          <div className="porto-confirm-totals"><span><strong>{previa.totalLinhas}</strong> registros</span><span><strong>{moeda(previa.resumo?.valorTotal??0)}</strong> valor total</span></div>
          {previa.requerOrdemPagamento?<label className="field"><span>Número da OP</span><input aria-label="Número da OP" value={numeroOp} onChange={e=>alterarNumero(e.target.value)} required placeholder="Ex.: 06422281"/></label>:null}
          {previa.requerOrdemPagamento?<label className="field"><span>Período financeiro</span><select aria-label="Período financeiro" value={periodoId} onChange={e=>alterarPeriodo(e.target.value)} required><option value="">Selecione o período</option>{periodos.filter(p=>p.ativo||String(p.id)===periodoId).map(p=><option key={p.id} value={p.id}>{p.descricao} · {dataBr(p.competenciaInicio)} a {dataBr(p.competenciaFim)}</option>)}</select></label>:null}
          {validando?<span role="status">Validando número da OP e período…</span>:null}
          {analise&&!analise.existente?<div className="success-notice">A OP {analise.numero} será criada automaticamente.</div>:null}
          {temDivergenciaFinanceira?<div className="form-alert"><strong>Divergência financeira encontrada.</strong><span> Valor atual da OP: {moeda(analise?.valorAtual??0)} · Soma do arquivo: {moeda(analise?.somaArquivo??0)} · Diferença encontrada: {moeda(analise?.diferenca??0)}</span><label className="porto-divergence"><input type="checkbox" aria-label="Confirmo a atualização do valor" checked={confirmarDivergencias} onChange={e=>setConfirmarDivergencias(e.target.checked)}/><span>Confirmo a atualização do valor da OP.</span></label><label className="field"><span>Motivo da divergência</span><select aria-label="Motivo da divergência" value={motivoDivergencia} onChange={e=>setMotivoDivergencia(e.target.value)}><option value="">Selecione o motivo</option><option value="DIVERGENCIA_VALOR">Divergência de valor</option><option value="DESCONTO">Desconto</option><option value="AJUSTE_PORTO">Ajuste Porto</option><option value="OUTRO">Outro</option></select></label><label className="field"><span>Justificativa da divergência</span><textarea aria-label="Justificativa da divergência" value={justificativaDivergencia} onChange={e=>setJustificativaDivergencia(e.target.value)} rows={2}/></label></div>:null}
          {temReassociacoes?<div className="form-alert"><strong>{analise?.quantidadeReassociacoes} {analise?.quantidadeReassociacoes===1?'OS será movida':'OS serão movidas'} · {moeda(analise?.valorReassociacoes??0)}</strong><div className="table-scroll"><table><thead><tr><th>OS</th><th>OP atual</th><th>Nova OP</th><th>Valor</th></tr></thead><tbody>{analise?.reassociacoes.map(item=><tr key={item.numeroOs}><td>{item.numeroOs}</td><td>{item.opAtual}</td><td>{item.novaOp}</td><td>{moeda(item.valor)}</td></tr>)}</tbody></table></div><label className="porto-divergence"><input type="checkbox" aria-label="Confirmo a reassociação" checked={confirmarReassociacoes} onChange={e=>setConfirmarReassociacoes(e.target.checked)}/><span>Confirmo a reassociação das OS indicadas.</span></label></div>:null}
          {temDivergenciasDados&&!temDivergenciaFinanceira?<label className="porto-divergence"><input type="checkbox" aria-label="Confirmo a atualização dos dados" checked={confirmarDivergencias} onChange={e=>setConfirmarDivergencias(e.target.checked)}/><span>Confirmo a atualização dos dados divergentes.</span></label>:null}
          <button type="button" className="button button-ghost" disabled={carregando} onClick={cancelar}>Cancelar prévia</button>
          <button className="button button-primary" disabled={carregando||validando||temErros||!divergenciaConfirmada||temReassociacoes&&!confirmarReassociacoes||previa.requerOrdemPagamento&&(!numeroNormalizado||!periodoId||!analise)||previa.linhas.length===0} onClick={confirmar}>Confirmar importação</button>
        </footer>
        <div className="table-scroll porto-preview-table"><table><thead><tr><th>Ordem</th><th>Especialidade / Nome</th><th>Valor</th><th>Data</th><th>Ação</th></tr></thead><tbody>{previa.linhas.map(l=><tr key={l.hashRegistro}><td><strong>{l.dados.numero_op||l.dados.numero_os}</strong></td><td>{l.dados.especialidade||l.dados.nome_codigo||'—'}</td><td>{l.dados.valor_total}</td><td>{l.dados.data_pagamento||l.dados.data_atendimento}</td><td>{l.mensagem||l.acao}</td></tr>)}</tbody></table></div>
      </div>:null}
    </section>
  </div>
}
