import { useEffect, useRef, useState } from 'react'
import { avaliarImportacaoPorto, cancelarImportacaoPorto, confirmarImportacaoPorto, criarPreviaConteudoPorto, criarPreviaPorto } from '../dados/porto'
import { listarMotoristas } from '../dados/motoristas'
import type { Motorista, PreviaPorto } from '../types/modelos'
import { moeda } from '../utils/formatadores'
import { Campo, Selecao } from '../components/Campos'
import { MOTIVOS_COMPOSICAO } from './ops/opcoes'
import { CampoArquivo } from '../components/CampoArquivo'
import { ConfirmarAcao, type PedidoConfirmacao } from '../components/ConfirmarAcao'

const rotulos={PREVISAO_RECEBER:'Previsão a receber',OS_VINCULADAS:'OS vinculadas à OP',SERVICOS_DEVOLVIDOS:'Serviços devolvidos',SERVICOS_GERAIS:'Serviços gerais da Porto',SERVICOS_AGUARDANDO_LANCAMENTO:'Serviços aguardando lançamento',PAINEL_DIARIO:'Painel do dia (todas as seguradoras)'}
const dataBr=(valor?:string)=>valor?new Date(`${valor}T12:00:00`).toLocaleDateString('pt-BR'):''

/**
 * Numeros de OS num aviso.
 *
 * Eram uma tabela de uma coluna dentro de uma caixa rolavel — 13 numeros
 * ocupavam a tela inteira e escondiam o resto do formulario. Sao codigos
 * curtos: em linha, cabem em duas linhas e continuam selecionaveis para copiar.
 */
function NumerosDeOs({numeros}:{numeros:string[]}){
  return <ul className="porto-os-lista">
    {numeros.map(n=><li key={n}>{n}</li>)}
  </ul>
}

export default function PortoImportacoesPage(){
  const [arquivo,setArquivo]=useState<File|null>(null),[previa,setPrevia]=useState<PreviaPorto|null>(null)
  const [modo,setModo]=useState<'arquivo'|'colagem'>('arquivo'),[conteudo,setConteudo]=useState('')
  const [motoristas,setMotoristas]=useState<Motorista[]>([]),[numeroOp,setNumeroOp]=useState('')
  const [semSocorrista,setSemSocorrista]=useState<string[]>([])
  const [mensagem,setMensagem]=useState(''),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(false),[etapa,setEtapa]=useState(''),[validando,setValidando]=useState(false),[inputKey,setInputKey]=useState(0)
  const [chaveValidada,setChaveValidada]=useState('')
  const [confirmarDivergencias,setConfirmarDivergencias]=useState(false),[confirmarReassociacoes,setConfirmarReassociacoes]=useState(false)
  const [motivoDivergencia,setMotivoDivergencia]=useState(''),[justificativaDivergencia,setJustificativaDivergencia]=useState('')
  const [falhaAoConfirmar,setFalhaAoConfirmar]=useState(false)
  const confirmacaoEmCurso=useRef(false)

  useEffect(()=>{listarMotoristas().then(setMotoristas).catch((e:Error)=>setErro(e.message))},[])

  /**
   * Quem atendeu cada OS orfa.
   *
   * OS sem socorrista e comissao que ninguem recebe, com o servico ja contado no
   * faturamento — por isso a escolha acontece aqui, com o arquivo na frente, e
   * nao depois numa lista de pendencias. So as orfas aparecem: as que o QRA
   * resolveu passam direto.
   */
  function escolherSocorrista(hashRegistro:string,motoristaId:string){
    setPrevia(atual=>atual?{...atual,linhas:atual.linhas.map(l=>l.hashRegistro===hashRegistro
      ?{...l,dados:{...l.dados,motorista_id:motoristaId}}:l)}:atual)
  }
  // Uma escolha muda o dono (e a comissao) de varias OS de uma vez: pergunta antes.
  function aplicarSocorristaEmTodas(motoristaId:string){
    if(!motoristaId)return
    const pessoa=motoristas.find(m=>String(m.id)===motoristaId)
    setPedido({
      titulo:`Aplicar ${pessoa?.nome??'este socorrista'} a todas?`,
      efeito:<>As <strong>{orfas.length}</strong> {orfas.length===1?'OS que veio':'OS que vieram'} sem socorrista {orfas.length===1?'fica':'ficam'} com <strong>{pessoa?.nome}</strong>, e a comissão delas vai para essa pessoa quando a importação for confirmada.</>,
      resumo:[['Socorrista',pessoa?.nome??''],['Ordens de serviço',String(orfas.length)]],
      textoConfirmar:'Aplicar a todas',
      aoConfirmar:()=>aplicarEmTodas(motoristaId),
    })
  }
  function aplicarEmTodas(motoristaId:string){
    setPrevia(atual=>atual?{...atual,linhas:atual.linhas.map(l=>orfas.some(o=>o.hashRegistro===l.hashRegistro)
      ?{...l,dados:{...l.dados,motorista_id:motoristaId}}:l)}:atual)
  }

  const numeroNormalizado=numeroOp.trim(),previaId=previa?.id,requerOrdemPagamento=Boolean(previa?.requerOrdemPagamento)
  const chaveAvaliacao=previaId&&requerOrdemPagamento&&numeroNormalizado?`${previaId}:${numeroNormalizado}`:''
  useEffect(()=>{
    if(!chaveAvaliacao||!previaId){setValidando(false);setChaveValidada('');return}
    if(chaveValidada===chaveAvaliacao){setValidando(false);return}
    const controller=new AbortController(),temporizador=window.setTimeout(async()=>{
      setValidando(true);setErro('')
      try{
        const resposta=await avaliarImportacaoPorto(previa as PreviaPorto,{numeroOrdemPagamento:numeroNormalizado},controller.signal)
        if(!controller.signal.aborted){setPrevia(resposta);setChaveValidada(chaveAvaliacao)}
      }catch(e){if(!controller.signal.aborted)setErro((e as Error).message)}
      finally{if(!controller.signal.aborted)setValidando(false)}
      // 600ms, nao 150: cada avaliacao rebaixa o arquivo inteiro do Storage e
      // reprocessa todas as linhas no servidor. Com 150ms — menos que o intervalo
      // entre teclas de quem digita — um numero de OP de 8 digitos disparava oito
      // releituras do arquivo, e a tela ficava "validando" o tempo todo.
    },600)
    return()=>{window.clearTimeout(temporizador);controller.abort()}
  },[chaveAvaliacao,chaveValidada,numeroNormalizado,previaId])

  function limparAvisos(){setMensagem('');setErro('');setSemSocorrista([])}
  function limparConfirmacoes(){setConfirmarDivergencias(false);setConfirmarReassociacoes(false);setMotivoDivergencia('');setJustificativaDivergencia('')}
  async function analisar(){
    if(modo==='arquivo'&&!arquivo||modo==='colagem'&&!conteudo.trim())return
    setCarregando(true);setEtapa('Analisando arquivo…');limparAvisos();setFalhaAoConfirmar(false);setNumeroOp('');setChaveValidada('');limparConfirmacoes()
    try{setPrevia(modo==='arquivo'?await criarPreviaPorto(arquivo as File):await criarPreviaConteudoPorto(conteudo))}catch(e){setErro((e as Error).message)}finally{setEtapa('');setCarregando(false)}
  }
  function alterarNumero(valor:string){setNumeroOp(valor);setChaveValidada('');limparConfirmacoes()}
  async function confirmar(){setSemSocorrista([])
    if(confirmacaoEmCurso.current||!previa||previa.requerOrdemPagamento&&(!numeroNormalizado||chaveValidada!==chaveAvaliacao))return
    confirmacaoEmCurso.current=true
    setCarregando(true);setEtapa('Confirmando importação…');setErro('');setFalhaAoConfirmar(false)
    try{
      const r=previa.requerOrdemPagamento
        ?await confirmarImportacaoPorto(previa,{numeroOrdemPagamento:numeroNormalizado,confirmarDivergencias,confirmarReassociacoes,motivoDivergencia:motivoDivergencia||undefined,justificativaDivergencia:justificativaDivergencia.trim()||undefined})
        :await confirmarImportacaoPorto(previa,{confirmarDivergencias})
      const financeiro=r.tipo==='OS_VINCULADAS'||r.tipo==='SERVICOS_GERAIS'?` · ${r.receitasCriadas} ${r.receitasCriadas===1?'receita criada':'receitas criadas'} · ${r.receitasAtualizadas} ${r.receitasAtualizadas===1?'receita atualizada':'receitas atualizadas'} · ${moeda(r.valorTotalRecebido)} recebidos${r.quinzena?` · período ${r.quinzena}`:''}${r.dataPagamento?` · pagamento em ${dataBr(r.dataPagamento)}`:''}`:''
      setMensagem(`${r.importados} ${r.importados===1?'registro importado':'registros importados'}${r.ignorados?` · ${r.ignorados} ignorados por duplicidade`:''}${financeiro}${r.viaturasNovas?.length?` · ${r.viaturasNovas.length===1?'viatura nova cadastrada':'viaturas novas cadastradas'}: ${r.viaturasNovas.join(', ')}`:''}.`)
      setSemSocorrista(r.osSemSocorrista??[])
      setPrevia(null);setArquivo(null);setNumeroOp('');setChaveValidada('');limparConfirmacoes();setInputKey(x=>x+1)
    }catch(e){setErro((e as Error).message);setFalhaAoConfirmar(true)}finally{confirmacaoEmCurso.current=false;setEtapa('');setCarregando(false)}
  }
  const [pedido,setPedido]=useState<PedidoConfirmacao|null>(null)
  // Importar grava receita, comissao e OS: antes, a janela diz o que vai entrar.
  function pedirConfirmacao(){
    if(!previa)return
    const novas=previa.linhas.filter(l=>l.acao==='IMPORTAR').length
    const atualizadas=previa.linhas.filter(l=>l.acao==='ATUALIZAR'||l.acao==='DIVERGENCIA').length
    const semDono=(previa.orfas??[]).filter(o=>!previa.linhas.some(l=>l.hashRegistro===o.hashRegistro&&l.dados.motorista_id)).length
    const valor=previa.resumo?.valorTotal??analise?.somaArquivo??0
    setPedido({
      titulo:'Confirmar importação?',
      efeito:previa.requerOrdemPagamento
        ?<>As ordens de serviço entram pagas na <strong>OP {numeroNormalizado}</strong>, viram receita e a comissão dos socorristas é lançada em despesas.</>
        :<>As ordens de serviço entram no sistema aguardando a OP da Porto.</>,
      resumo:[
        ...(previa.requerOrdemPagamento?[['OP',numeroNormalizado] as [string,string]]:[]),
        ['OS novas',String(novas)],
        ['OS atualizadas',String(atualizadas)],
        ['Valor',moeda(valor)],
      ],
      avisos:[
        semDono?<><strong>{semDono}</strong> {semDono===1?'OS vai':'OS vão'} para o socorrista <strong>Auxiliar</strong> e {semDono===1?'gera':'geram'} comissão para ele.</>:null,
        temReassociacoes?'Há OS que mudam de OP.':null,
      ],
      textoConfirmar:'Sim, importar',
      aoConfirmar:confirmar,
    })
  }
  async function cancelar(){
    if(!previa)return;setCarregando(true);limparAvisos();setFalhaAoConfirmar(false)
    try{await cancelarImportacaoPorto(previa.id);setMensagem('Prévia cancelada. Corrija e reenvie o arquivo quando estiver pronto.');setPrevia(null);setArquivo(null);setNumeroOp('');setChaveValidada('');limparConfirmacoes();setInputKey(x=>x+1)}catch(e){setErro((e as Error).message)}finally{setCarregando(false)}
  }
  function limpar(){setConteudo('');setArquivo(null);setPrevia(null);limparAvisos();setFalhaAoConfirmar(false);setNumeroOp('');setChaveValidada('');limparConfirmacoes();setInputKey(x=>x+1)}

  const temErros=Boolean(previa?.erros.length||previa?.linhas.some(l=>l.acao==='ERRO'))
  // Orfa deixa de ser orfa assim que alguem e escolhido para ela.
  const orfas=(previa?.orfas??[]).filter(o=>!previa?.linhas.some(
    l=>l.hashRegistro===o.hashRegistro&&l.dados.motorista_id))
  const analise=chaveValidada===chaveAvaliacao&&previa?.analiseOrdemPagamento?.numero===numeroNormalizado?previa.analiseOrdemPagamento:undefined
  const numerosReassociados=new Set(analise?.reassociacoes.map(item=>item.numeroOs)??[])
  const temDivergenciasDados=Boolean(analise&&previa?.linhas.some(l=>l.acao==='DIVERGENCIA'&&!numerosReassociados.has(l.dados.numero_os)))
  const temDivergenciaFinanceira=Boolean(analise?.existente&&analise.diferenca!==undefined&&Math.abs(analise.diferenca)>0.009)
  const temReassociacoes=Boolean(analise?.quantidadeReassociacoes)
  const divergenciaConfirmada=(!temDivergenciaFinanceira&&!temDivergenciasDados)||(confirmarDivergencias&&(!temDivergenciaFinanceira||Boolean(motivoDivergencia&&justificativaDivergencia.trim())))

  return <div className="page-enter"><header className="page-heading"><div><span className="eyebrow">Módulo Porto</span><h1>Importar relatórios</h1><p>Cole serviços ou envie CSV/TXT, confira a prévia e confirme somente depois da validação.</p></div></header>
    {carregando?<span role="status">{etapa}</span>:null}{erro?<div className="form-alert" role="alert">{erro}{falhaAoConfirmar&&previa?<button type="button" onClick={()=>void confirmar()}>Tentar novamente</button>:null}</div>:null}{mensagem?<div className="success-notice">{mensagem}</div>:null}{semSocorrista.length?<div className="form-alert" role="alert"><strong>{semSocorrista.length} {semSocorrista.length===1?'ordem de serviço ficou':'ordens de serviço ficaram'} sem socorrista, por terem vindo sem QRA.</strong> Associe o socorrista na tela Ordens de serviço.<NumerosDeOs numeros={semSocorrista}/></div>:null}
    <section className="panel porto-import-card"><div className="segmented porto-import-modes" role="group" aria-label="Forma de importação"><button className={modo==='arquivo'?'active':''} onClick={()=>{setModo('arquivo');setPrevia(null)}}>Enviar arquivo</button><button className={modo==='colagem'?'active':''} onClick={()=>{setModo('colagem');setPrevia(null)}}>Colar serviços da Porto</button></div>
      {modo==='arquivo'?<div className="porto-upload"><CampoArquivo rotulo="Arquivo CSV ou TXT" chave={inputKey} nome={arquivo?.name}
        accept=".csv,.txt,.tsv,text/csv,text/plain,text/tab-separated-values"
        aoEscolher={escolhido=>{setArquivo(escolhido);setPrevia(null);setMensagem('')}}/><button className="button button-primary" disabled={!arquivo||carregando} onClick={analisar}>{carregando?'Analisando…':'Analisar CSV'}</button></div>:<div className="porto-paste"><label className="field"><span>Conteúdo copiado da Porto</span><textarea aria-label="Conteúdo copiado da Porto" rows={10} value={conteudo} onChange={e=>{setConteudo(e.target.value);setPrevia(null);setMensagem('')}} placeholder="Cole aqui a tabela copiada com Ctrl+C"/></label><div className="porto-paste-actions"><button className="button button-ghost" type="button" onClick={limpar}>Limpar</button><button className="button button-primary" disabled={!conteudo.trim()||carregando} onClick={analisar}>{carregando?'Analisando…':'Analisar conteúdo'}</button></div></div>}
      {previa?<div className="porto-preview"><header className="panel-title"><div><span className="eyebrow">Prévia detectada</span><h2>{rotulos[previa.tipo]}</h2></div><span className="import-pill">{previa.totalLinhas} linhas</span></header>
        {previa.resumo?<div className="porto-preview-summary"><span><strong>{previa.resumo.linhasAnalisadas}</strong> linhas analisadas</span>{previa.tipo==='PREVISAO_RECEBER'?<span><strong>{previa.resumo.opsUnicas}</strong> OPs únicas</span>:null}<span><strong>{previa.resumo.registrosNovos}</strong> registros novos</span><span><strong>{previa.resumo.registrosExistentes}</strong> já existentes</span>{previa.tipo==='PREVISAO_RECEBER'?<span><strong>{previa.resumo.registrosAtualizados}</strong> {previa.resumo.registrosAtualizados===1?'registro atualizado':'registros atualizados'}</span>:null}<span><strong>{previa.resumo.duplicidades}</strong> duplicidades</span><span><strong>{previa.resumo.erros}</strong> erros</span><span><strong>{moeda(previa.resumo.valorTotal)}</strong> valor total</span></div>:null}
        {temErros?<div className="form-alert"><strong>Corrija e reenvie o arquivo.</strong> {previa.erros.join(' · ')}</div>:null}
        <footer className="porto-confirm porto-confirm-sticky" aria-label="Ações da prévia">
          <div className="porto-confirm-totals"><span><strong>{previa.totalLinhas}</strong> registros</span><span><strong>{moeda(previa.resumo?.valorTotal??0)}</strong> valor total</span></div>
          {previa.requerOrdemPagamento?<label className="field"><span>Número da OP</span><input aria-label="Número da OP" inputMode="numeric" autoComplete="off" value={numeroOp} onChange={e=>alterarNumero(e.target.value)} required placeholder="00000000"/></label>:null}

          {/* aria-live sem role="status": anuncia igual, e nao disputa o papel
              com o indicador de etapa la em cima, que ja e um status. */}
          <span className="porto-validando" aria-live="polite">
            {validando?<><i className="spinner" aria-hidden="true"/><span className="apenas-leitor">Validando número da OP e período…</span></>:null}
          </span>
          {analise&&!analise.existente?<div className="success-notice">A OP {analise.numero} será criada automaticamente.</div>:null}
          {temDivergenciaFinanceira?<div className="form-alert"><strong>Divergência financeira encontrada.</strong><span> Valor atual da OP: {moeda(analise?.valorAtual??0)} · Soma do arquivo: {moeda(analise?.somaArquivo??0)} · Diferença encontrada: {moeda(analise?.diferenca??0)}</span><label className="porto-divergence"><input type="checkbox" aria-label="Confirmo a atualização do valor" checked={confirmarDivergencias} onChange={e=>setConfirmarDivergencias(e.target.checked)}/><span>Confirmo a atualização do valor da OP.</span></label><Selecao rotulo="Motivo da divergência" vazio="Selecione o motivo" value={motivoDivergencia}
            onChange={e=>setMotivoDivergencia(e.target.value)} opcoes={MOTIVOS_COMPOSICAO}/><Campo rotulo="Justificativa da divergência">
            <textarea value={justificativaDivergencia} onChange={e=>setJustificativaDivergencia(e.target.value)} rows={2}/>
          </Campo></div>:null}
          {temReassociacoes?<div className="form-alert"><strong>{analise?.quantidadeReassociacoes} {analise?.quantidadeReassociacoes===1?'OS será movida':'OS serão movidas'} · {moeda(analise?.valorReassociacoes??0)}</strong><div className="table-scroll"><table><thead><tr><th>OS</th><th>OP atual</th><th>Nova OP</th><th>Valor</th></tr></thead><tbody>{analise?.reassociacoes.map(item=><tr key={item.numeroOs}><td>{item.numeroOs}</td><td>{item.opAtual}</td><td>{item.novaOp}</td><td>{moeda(item.valor)}</td></tr>)}</tbody></table></div><label className="porto-divergence"><input type="checkbox" aria-label="Confirmo a reassociação" checked={confirmarReassociacoes} onChange={e=>setConfirmarReassociacoes(e.target.checked)}/><span>Confirmo a reassociação das OS indicadas.</span></label></div>:null}
          {temDivergenciasDados&&!temDivergenciaFinanceira?<label className="porto-divergence"><input type="checkbox" aria-label="Confirmo a atualização dos dados" checked={confirmarDivergencias} onChange={e=>setConfirmarDivergencias(e.target.checked)}/><span>Confirmo a atualização dos dados divergentes.</span></label>:null}
          <button type="button" className="button button-ghost" disabled={carregando} onClick={()=>setPedido({titulo:'Cancelar a prévia?',efeito:'Nada deste arquivo é gravado. Para importar, será preciso enviar o arquivo de novo.',textoConfirmar:'Cancelar prévia',perigo:true,aoConfirmar:cancelar})}>Cancelar prévia</button>
          <button className="button button-primary" disabled={carregando||validando||temErros||!divergenciaConfirmada||temReassociacoes&&!confirmarReassociacoes||previa.requerOrdemPagamento&&(!numeroNormalizado||!analise)||previa.linhas.length===0} onClick={pedirConfirmacao}>Confirmar importação</button>
        </footer>
        {orfas.length?<div className="porto-aviso-auxiliar" role="status"><strong>{orfas.length} {orfas.length===1?'ordem de serviço veio':'ordens de serviço vieram'} sem socorrista e {orfas.length===1?'vai':'vão'} para o Auxiliar.</strong> Se souber quem atendeu, escolha abaixo; se não, pode importar assim.
          <div className="porto-orfas-atalho"><Selecao rotulo="Aplicar o mesmo socorrista a todas" vazio="Escolha para aplicar a todas" value=""
            onChange={e=>aplicarSocorristaEmTodas(e.target.value)}
            opcoes={motoristas.map(m=>({valor:m.id,texto:m.nome}))}/></div>
          <div className="table-scroll"><table><thead><tr><th>OS</th><th>Atendimento</th><th>Como veio no arquivo</th><th>Socorrista</th></tr></thead><tbody>{orfas.map(o=><tr key={o.hashRegistro}><td><strong>{o.numeroOs}</strong></td><td>{dataBr(o.data)||'—'}</td><td>{o.socorrista||o.qra||'—'}</td><td><Selecao rotulo={`Socorrista da OS ${o.numeroOs}`} vazio="Selecione" value=""
            onChange={e=>escolherSocorrista(o.hashRegistro,e.target.value)}
            opcoes={motoristas.map(m=>({valor:m.id,texto:m.nome}))}/></td></tr>)}</tbody></table></div>
        </div>:null}
        {previa.osSemSocorrista?.length?<div className="form-alert" role="alert"><strong>{previa.osSemSocorrista.length} {previa.osSemSocorrista.length===1?'ordem de serviço ficará':'ordens de serviço ficarão'} sem QRA no relatório.</strong> O socorrista é identificado pelo QRA, e só entre os que já estão cadastrados — o sistema nunca cria um cadastro novo a partir de um QRA desconhecido. Estas ficam sem identidade: associe o socorrista na tela Ordens de serviço.<NumerosDeOs numeros={previa.osSemSocorrista}/></div>:null}
        {/* O painel do dia nao tem valor nem OP: a coluna Valor ficaria vazia em toda linha.
            No lugar dela entram seguradora e situacao, que e o que existe de util ali. */}
        <div className="table-scroll porto-preview-table"><table><thead><tr><th>Ordem</th><th>Especialidade / Nome</th>{previa.tipo==='PAINEL_DIARIO'?<><th>Seguradora</th><th>Situação</th></>:<th>Valor</th>}<th>Data</th><th>Ação</th></tr></thead><tbody>{previa.linhas.map(l=><tr key={l.hashRegistro}><td><strong>{l.dados.numero_op||l.dados.numero_os}</strong></td><td>{l.dados.especialidade||l.dados.nome_codigo||'—'}</td>{previa.tipo==='PAINEL_DIARIO'?<><td>{l.dados.seguradora||'—'}</td><td>{l.dados.situacao_porto||l.dados.status_porto||'—'}</td></>:<td>{l.dados.valor_total}</td>}<td>{l.dados.data_pagamento||l.dados.data_atendimento}</td><td>{l.mensagem||l.acao}</td></tr>)}</tbody></table></div>
      </div>:null}
    </section>
    {pedido?<ConfirmarAcao {...pedido} aoFechar={()=>setPedido(null)}/>:null}
  </div>
}
