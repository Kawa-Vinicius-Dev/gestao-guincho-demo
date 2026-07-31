import { useEffect, useState } from 'react'
import { avaliarImportacaoPorto, cancelarImportacaoPorto, confirmarImportacaoPorto, criarPreviaPorto, listarOrdensPagamentoPorto } from '../api/porto'
import type { OrdemPagamentoPorto, PreviaPorto } from '../types/modelos'

const rotulos={PREVISAO_RECEBER:'Previsão a receber',OS_VINCULADAS:'OS vinculadas à OP',SERVICOS_DEVOLVIDOS:'Serviços devolvidos'}

export default function PortoImportacoesPage(){
  const [arquivo,setArquivo]=useState<File|null>(null),[previa,setPrevia]=useState<PreviaPorto|null>(null)
  const [ops,setOps]=useState<OrdemPagamentoPorto[]>([]),[opId,setOpId]=useState(''),[mensagem,setMensagem]=useState(''),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(false)
  const [confirmarDivergencias,setConfirmarDivergencias]=useState(false),[inputKey,setInputKey]=useState(0)
  useEffect(()=>{listarOrdensPagamentoPorto().then(setOps).catch(e=>setErro(e.message))},[])
  async function analisar(){if(!arquivo)return;setCarregando(true);setErro('');setOpId('');setConfirmarDivergencias(false);try{setPrevia(await criarPreviaPorto(arquivo))}catch(e){setErro((e as Error).message)}finally{setCarregando(false)}}
  async function selecionarOp(valor:string){setOpId(valor);setConfirmarDivergencias(false);if(!previa||!valor)return;setCarregando(true);setErro('');try{setPrevia(await avaliarImportacaoPorto(previa.id,Number(valor)))}catch(e){setErro((e as Error).message)}finally{setCarregando(false)}}
  async function confirmar(){if(!previa||previa.requerOrdemPagamento&&!opId)return;setCarregando(true);setErro('');try{const r=await confirmarImportacaoPorto(previa.id,opId?Number(opId):undefined,confirmarDivergencias);setMensagem(`${r.importados} ${r.importados===1?'registro importado':'registros importados'}${r.ignorados?` · ${r.ignorados} ignorados por duplicidade`:''}.`);setPrevia(null);setArquivo(null);setInputKey(x=>x+1)}catch(e){setErro((e as Error).message)}finally{setCarregando(false)}}
  async function cancelar(){if(!previa)return;setCarregando(true);setErro('');try{await cancelarImportacaoPorto(previa.id);setMensagem('Prévia cancelada. Corrija e reenvie o arquivo quando estiver pronto.');setPrevia(null);setArquivo(null);setOpId('');setInputKey(x=>x+1)}catch(e){setErro((e as Error).message)}finally{setCarregando(false)}}
  const temErros=Boolean(previa?.erros.length||previa?.linhas.some(l=>l.acao==='ERRO'))
  const temDivergencias=Boolean(previa?.linhas.some(l=>l.acao==='DIVERGENCIA'))
  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Módulo Porto</span><h1>Importar relatórios</h1><p>Envie um CSV, confira a prévia e confirme somente depois da validação.</p></div></header>
    {erro?<div className="form-alert">{erro}</div>:null}{mensagem?<div className="success-notice">{mensagem}</div>:null}
    <section className="panel porto-import-card"><div className="porto-upload"><label className="field"><span>Arquivo CSV</span><input key={inputKey} aria-label="Arquivo CSV" type="file" accept=".csv,text/csv" onChange={e=>{setArquivo(e.target.files?.[0]??null);setPrevia(null);setMensagem('')}}/></label>
      <button className="button button-primary" disabled={!arquivo||carregando} onClick={analisar}>{carregando?'Analisando…':'Analisar CSV'}</button></div>
      {previa?<div className="porto-preview"><header className="panel-title"><div><span className="eyebrow">Prévia detectada</span><h2>{rotulos[previa.tipo]}</h2></div><span className="import-pill">{previa.totalLinhas} linhas</span></header>
        {temErros?<div className="form-alert"><strong>Corrija e reenvie o arquivo.</strong> {previa.erros.join(' · ')}</div>:null}
        <div className="table-scroll"><table><thead><tr><th>Ordem</th><th>Especialidade / Nome</th><th>Valor</th><th>Data</th><th>Ação</th></tr></thead><tbody>{previa.linhas.map(l=><tr key={l.hashRegistro}><td><strong>{l.dados.numero_op||l.dados.numero_os}</strong></td><td>{l.dados.especialidade||l.dados.nome_codigo||'—'}</td><td>{l.dados.valor_total}</td><td>{l.dados.data_pagamento||l.dados.data_atendimento}</td><td>{l.mensagem||l.acao}</td></tr>)}</tbody></table></div>
        <footer className="porto-confirm">{previa.requerOrdemPagamento?<label className="field"><span>Ordem de pagamento</span><select aria-label="Ordem de pagamento" value={opId} onChange={e=>void selecionarOp(e.target.value)} required><option value="">Selecione a OP</option>{ops.map(op=><option key={op.id} value={op.id}>{op.numero}</option>)}</select></label>:null}
          {temDivergencias?<label className="porto-divergence"><input type="checkbox" aria-label="Confirmo a reassociação" checked={confirmarDivergencias} onChange={e=>setConfirmarDivergencias(e.target.checked)}/><span>Confirmo a reassociação das OS indicadas.</span></label>:null}
          <button type="button" className="button button-ghost" disabled={carregando} onClick={cancelar}>Cancelar prévia</button>
          <button className="button button-primary" disabled={carregando||temErros||temDivergencias&&!confirmarDivergencias||previa.requerOrdemPagamento&&!opId||previa.linhas.length===0} onClick={confirmar}>Confirmar importação</button></footer></div>:null}
    </section></div>
}
