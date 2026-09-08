import { ApiError, api, tokenStorage } from './http'
import { apiUrl } from './url'
import type { CalendarioPorto, ConfirmacaoPorto, DashboardPorto, DetalheOpPorto, JustificativaPorto, OrdemPagamentoPorto, OrdemServicoPorto, PendenciaPorto, PreviaPorto, ResumoOpsPorto } from '../types/modelos'

export function criarPreviaPorto(arquivo:File){const body=new FormData();body.append('arquivo',arquivo);return api<PreviaPorto>('/api/porto/importacoes/previa',{method:'POST',body})}
export function criarPreviaConteudoPorto(conteudo:string){return api<PreviaPorto>('/api/porto/importacoes/previa-conteudo',{method:'POST',body:JSON.stringify({conteudo})})}
export function avaliarImportacaoPorto(id:number,ordemPagamentoId:number){return api<PreviaPorto>(`/api/porto/importacoes/${id}/avaliar`,{method:'POST',body:JSON.stringify({ordemPagamentoId})})}
export function confirmarImportacaoPorto(id:number,ordemPagamentoId?:number,confirmarDivergencias=false,motivoDivergencia?:string,justificativaDivergencia?:string,calendarioPagamentoId?:number){return api<ConfirmacaoPorto>(`/api/porto/importacoes/${id}/confirmar`,{method:'POST',body:JSON.stringify({ordemPagamentoId:ordemPagamentoId??null,confirmarDivergencias,calendarioPagamentoId:calendarioPagamentoId??null,motivoDivergencia,justificativaDivergencia})})}
export interface AvaliarImportacaoPorNumeroPorto { numeroOrdemPagamento:string; calendarioPagamentoId:number }
export function avaliarImportacaoPortoPorNumero(id:number,dados:AvaliarImportacaoPorNumeroPorto,signal?:AbortSignal){return api<PreviaPorto>(`/api/porto/importacoes/${id}/avaliar`,{method:'POST',body:JSON.stringify(dados),signal})}
export interface ConfirmarImportacaoPorNumeroPorto { numeroOrdemPagamento:string; calendarioPagamentoId:number; confirmarDivergencias:boolean; confirmarReassociacoes:boolean; motivoDivergencia?:string; justificativaDivergencia?:string }
export function confirmarImportacaoPortoPorNumero(id:number,dados:ConfirmarImportacaoPorNumeroPorto){return api<ConfirmacaoPorto>(`/api/porto/importacoes/${id}/confirmar`,{method:'POST',body:JSON.stringify(dados)})}
export function confirmarImportacaoPortoSemOp(id:number,confirmarDivergencias=false){return api<ConfirmacaoPorto>(`/api/porto/importacoes/${id}/confirmar`,{method:'POST',body:JSON.stringify({confirmarDivergencias})})}
export function cancelarImportacaoPorto(id:number){return api<PreviaPorto>(`/api/porto/importacoes/${id}/cancelar`,{method:'POST'})}
const consulta=(params?:URLSearchParams)=>params?.toString()?`?${params}`:''
export const listarOrdensPagamentoPorto=(params?:URLSearchParams)=>api<OrdemPagamentoPorto[]>(`/api/porto/ordens-pagamento${consulta(params)}`)
export const criarOrdemPagamentoPorto=(dados:Record<string,unknown>)=>api<OrdemPagamentoPorto>('/api/porto/ordens-pagamento',{method:'POST',body:JSON.stringify(dados)})
export const atualizarOrdemPagamentoPorto=(id:number,dados:Record<string,unknown>)=>api<OrdemPagamentoPorto>(`/api/porto/ordens-pagamento/${id}`,{method:'PUT',body:JSON.stringify(dados)})
export function criarPreviaComposicaoPorto(id:number,arquivo:File){const body=new FormData();body.append('arquivo',arquivo);return api<PreviaPorto>(`/api/porto/ordens-pagamento/${id}/composicao/previa`,{method:'POST',body})}
export const resumirOrdensPagamentoPorto=(params?:URLSearchParams)=>api<ResumoOpsPorto>(`/api/porto/ordens-pagamento/resumo${consulta(params)}`)
export const listarOrdensServicoPorto=(params?:URLSearchParams)=>api<OrdemServicoPorto[]>(`/api/porto/ordens-servico${consulta(params)}`)
export const associarMotoristaPorto=(ordemServicoId:number,motoristaId:number)=>api<OrdemServicoPorto>(`/api/porto/ordens-servico/${ordemServicoId}/motorista`,{method:'PATCH',body:JSON.stringify({motoristaId})})
export const listarPendenciasPorto=()=>api<PendenciaPorto[]>('/api/porto/pendencias')
export function criarPendenciaPorto(dados:Record<string,unknown>){return api<PendenciaPorto>('/api/porto/pendencias',{method:'POST',body:JSON.stringify(dados)})}
export function resolverPendenciaPorto(id:number){return api<PendenciaPorto>(`/api/porto/pendencias/${id}/resolver`,{method:'PATCH'})}
export const obterDashboardPorto=(params?:URLSearchParams)=>api<DashboardPorto>(`/api/porto/dashboard${consulta(params)}`)
export const listarCalendarioPorto=()=>api<CalendarioPorto[]>('/api/porto/calendario')
type DadosCalendarioPorto={dataPagamento:string;competenciaInicio:string;competenciaFim:string;descricao:string;ativo:boolean}
export const criarDataCalendarioPorto=(dados:DadosCalendarioPorto)=>api<CalendarioPorto>('/api/porto/calendario',{method:'POST',body:JSON.stringify(dados)})
export const atualizarDataCalendarioPorto=(id:number,dados:DadosCalendarioPorto)=>api<CalendarioPorto>(`/api/porto/calendario/${id}`,{method:'PUT',body:JSON.stringify(dados)})
export const desativarDataCalendarioPorto=(id:number)=>api<CalendarioPorto>(`/api/porto/calendario/${id}/desativar`,{method:'PATCH'})
export const detalharOrdemPagamentoPorto=(id:number)=>api<DetalheOpPorto>(`/api/porto/ordens-pagamento/${id}`)
export const justificarOrdemPagamentoPorto=(id:number,motivo:string,observacao:string)=>api<JustificativaPorto>(`/api/porto/ordens-pagamento/${id}/justificativas`,{method:'POST',body:JSON.stringify({motivo,observacao})})
export function receberOrdemPagamentoPorto(id:number,valorRecebido:number,dataRecebimento:string,calendarioPagamentoId?:number){return api<OrdemPagamentoPorto>(`/api/porto/ordens-pagamento/${id}/receber`,{method:'PATCH',body:JSON.stringify({valorRecebido,dataRecebimento,calendarioPagamentoId:calendarioPagamentoId??null})})}
export async function baixarRelatorioPorto(formato:'excel'|'pdf',params?:URLSearchParams){const token=tokenStorage.get();const response=await fetch(apiUrl(`/api/porto/relatorios/${formato}${consulta(params)}`),{headers:token?{Authorization:`Bearer ${token}`}:{}});if(!response.ok)throw new ApiError('Não foi possível exportar o relatório Porto.',response.status);const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`relatorio-porto.${formato==='excel'?'xlsx':'pdf'}`;link.click();URL.revokeObjectURL(url)}
export async function baixarRelatorioOpPorto(id:number,formato:'excel'|'pdf'){const token=tokenStorage.get();const response=await fetch(apiUrl(`/api/porto/ordens-pagamento/${id}/relatorios/${formato}`),{headers:token?{Authorization:`Bearer ${token}`}:{}});if(!response.ok)throw new ApiError('Não foi possível exportar a ordem de pagamento.',response.status);const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`op-porto.${formato==='excel'?'xlsx':'pdf'}`;link.click();URL.revokeObjectURL(url)}
