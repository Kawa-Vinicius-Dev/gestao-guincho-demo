import { api } from './http'
import type { ConfirmacaoPorto, OrdemPagamentoPorto, OrdemServicoPorto, PendenciaPorto, PreviaPorto } from '../types/modelos'

export function criarPreviaPorto(arquivo:File){const body=new FormData();body.append('arquivo',arquivo);return api<PreviaPorto>('/api/porto/importacoes/previa',{method:'POST',body})}
export function avaliarImportacaoPorto(id:number,ordemPagamentoId:number){return api<PreviaPorto>(`/api/porto/importacoes/${id}/avaliar`,{method:'POST',body:JSON.stringify({ordemPagamentoId})})}
export function confirmarImportacaoPorto(id:number,ordemPagamentoId?:number,confirmarDivergencias=false){return api<ConfirmacaoPorto>(`/api/porto/importacoes/${id}/confirmar`,{method:'POST',body:JSON.stringify({ordemPagamentoId:ordemPagamentoId??null,confirmarDivergencias})})}
export function cancelarImportacaoPorto(id:number){return api<PreviaPorto>(`/api/porto/importacoes/${id}/cancelar`,{method:'POST'})}
export const listarOrdensPagamentoPorto=()=>api<OrdemPagamentoPorto[]>('/api/porto/ordens-pagamento')
export const listarOrdensServicoPorto=()=>api<OrdemServicoPorto[]>('/api/porto/ordens-servico')
export const listarPendenciasPorto=()=>api<PendenciaPorto[]>('/api/porto/pendencias')
export function receberOrdemPagamentoPorto(id:number,valorRecebido:number,dataRecebimento:string){return api<OrdemPagamentoPorto>(`/api/porto/ordens-pagamento/${id}/receber`,{method:'PATCH',body:JSON.stringify({valorRecebido,dataRecebimento})})}
