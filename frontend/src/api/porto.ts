import { ApiError, api, tokenStorage } from './http'
import type { ConfirmacaoPorto, DashboardPorto, DetalheOpPorto, JustificativaPorto, OrdemPagamentoPorto, OrdemServicoPorto, PendenciaPorto, PreviaPorto, ResumoOpsPorto } from '../types/modelos'

export function criarPreviaPorto(arquivo:File){const body=new FormData();body.append('arquivo',arquivo);return api<PreviaPorto>('/api/porto/importacoes/previa',{method:'POST',body})}
export function criarPreviaConteudoPorto(conteudo:string){return api<PreviaPorto>('/api/porto/importacoes/previa-conteudo',{method:'POST',body:JSON.stringify({conteudo})})}
export function avaliarImportacaoPorto(id:number,ordemPagamentoId:number){return api<PreviaPorto>(`/api/porto/importacoes/${id}/avaliar`,{method:'POST',body:JSON.stringify({ordemPagamentoId})})}
export function confirmarImportacaoPorto(id:number,ordemPagamentoId?:number,confirmarDivergencias=false){return api<ConfirmacaoPorto>(`/api/porto/importacoes/${id}/confirmar`,{method:'POST',body:JSON.stringify({ordemPagamentoId:ordemPagamentoId??null,confirmarDivergencias})})}
export function cancelarImportacaoPorto(id:number){return api<PreviaPorto>(`/api/porto/importacoes/${id}/cancelar`,{method:'POST'})}
const consulta=(params?:URLSearchParams)=>params?.toString()?`?${params}`:''
export const listarOrdensPagamentoPorto=(params?:URLSearchParams)=>api<OrdemPagamentoPorto[]>(`/api/porto/ordens-pagamento${consulta(params)}`)
export const resumirOrdensPagamentoPorto=(params?:URLSearchParams)=>api<ResumoOpsPorto>(`/api/porto/ordens-pagamento/resumo${consulta(params)}`)
export const listarOrdensServicoPorto=(params?:URLSearchParams)=>api<OrdemServicoPorto[]>(`/api/porto/ordens-servico${consulta(params)}`)
export const listarPendenciasPorto=()=>api<PendenciaPorto[]>('/api/porto/pendencias')
export function criarPendenciaPorto(dados:Record<string,unknown>){return api<PendenciaPorto>('/api/porto/pendencias',{method:'POST',body:JSON.stringify(dados)})}
export function resolverPendenciaPorto(id:number){return api<PendenciaPorto>(`/api/porto/pendencias/${id}/resolver`,{method:'PATCH'})}
export const obterDashboardPorto=(params?:URLSearchParams)=>api<DashboardPorto>(`/api/porto/dashboard${consulta(params)}`)
export const detalharOrdemPagamentoPorto=(id:number)=>api<DetalheOpPorto>(`/api/porto/ordens-pagamento/${id}`)
export const justificarOrdemPagamentoPorto=(id:number,motivo:string,observacao:string)=>api<JustificativaPorto>(`/api/porto/ordens-pagamento/${id}/justificativas`,{method:'POST',body:JSON.stringify({motivo,observacao})})
export function receberOrdemPagamentoPorto(id:number,valorRecebido:number,dataRecebimento:string){return api<OrdemPagamentoPorto>(`/api/porto/ordens-pagamento/${id}/receber`,{method:'PATCH',body:JSON.stringify({valorRecebido,dataRecebimento})})}
export async function baixarRelatorioPorto(formato:'excel'|'pdf',params?:URLSearchParams){const token=tokenStorage.get();const response=await fetch(`/api/porto/relatorios/${formato}${consulta(params)}`,{headers:token?{Authorization:`Bearer ${token}`}:{}});if(!response.ok)throw new ApiError('Não foi possível exportar o relatório Porto.',response.status);const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`relatorio-porto.${formato==='excel'?'xlsx':'pdf'}`;link.click();URL.revokeObjectURL(url)}
