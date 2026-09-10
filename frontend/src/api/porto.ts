import { ApiError, api, tokenStorage } from './http'
import { apiUrl } from './url'
import { hojeIso } from '../utils/formatadores'
import type { CalendarioPorto, ConfirmacaoPorto, DashboardPorto, DetalheOpPorto, JustificativaPorto, OrdemPagamentoPorto, OrdemServicoPorto, PendenciaPorto, PreviaPorto, ResumoOpsPorto } from '../types/modelos'

export function criarPreviaPorto(arquivo:File){const body=new FormData();body.append('arquivo',arquivo);return api<PreviaPorto>('/api/porto/importacoes/previa',{method:'POST',body})}
export function criarPreviaConteudoPorto(conteudo:string){return api<PreviaPorto>('/api/porto/importacoes/previa-conteudo',{method:'POST',body:JSON.stringify({conteudo})})}
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
export interface PeriodoPadraoPorto { dataInicio:string; dataFim:string }
export const periodoPadraoOrdensServicoPorto=()=>api<PeriodoPadraoPorto>('/api/porto/ordens-servico/periodo-padrao')
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
async function baixar(caminho:string,nomeArquivo:string,erro:string){const token=tokenStorage.get();const response=await fetch(apiUrl(caminho),{headers:token?{Authorization:`Bearer ${token}`}:{}});if(!response.ok)throw new ApiError(erro,response.status);const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=nomeArquivo;link.click();URL.revokeObjectURL(url)}
export const baixarRelatorioPorto=(formato:'excel'|'pdf',params?:URLSearchParams)=>baixar(`/api/porto/relatorios/${formato}${consulta(params)}`,`relatorio-porto.${formato==='excel'?'xlsx':'pdf'}`,'Não foi possível exportar o relatório Porto.')
export const baixarRelatorioOpPorto=(id:number,formato:'excel'|'pdf')=>baixar(`/api/porto/ordens-pagamento/${id}/relatorios/${formato}`,`op-porto.${formato==='excel'?'xlsx':'pdf'}`,'Não foi possível exportar a ordem de pagamento.')
export const baixarCopiaDosDados=()=>baixar('/api/backup/excel',`copia-jms-${hojeIso()}.xlsx`,'Não foi possível gerar a cópia dos dados.')
export const baixarOrdensServicoPorto=(params?:URLSearchParams)=>baixar(`/api/porto/ordens-servico/excel${consulta(params)}`,'ordens-servico-porto.xlsx','Não foi possível exportar as ordens de serviço.')
