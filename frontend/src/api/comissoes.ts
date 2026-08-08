import { api,ApiError,tokenStorage } from './http'
import { apiUrl } from './url'
import type { AlimentacaoComissao,CalendarioPorto,Comissao,DetalheFuncionario,PagamentoComissao,ResumoComissao } from '../types/modelos'

export const listarPeriodosComissoes=()=>api<CalendarioPorto[]>('/api/comissoes/periodos')
export const obterMinhaComissao=(calendarioPagamentoId:number)=>api<Comissao>(`/api/minha-comissao?calendarioPagamentoId=${calendarioPagamentoId}`)
export const registrarAlimentacao=(data:string,valor:number,observacoes?:string)=>api<AlimentacaoComissao>('/api/minha-comissao/alimentacoes',{method:'POST',body:JSON.stringify({data,valor,observacoes:observacoes||null})})
export const resumirComissoes=(calendarioPagamentoId:number,motoristaId?:number)=>api<ResumoComissao[]>(`/api/comissoes/resumo?calendarioPagamentoId=${calendarioPagamentoId}${motoristaId?`&motoristaId=${motoristaId}`:''}`)
export const detalharComissao=(motoristaId:number,calendarioPagamentoId:number)=>api<Comissao>(`/api/comissoes/${motoristaId}?calendarioPagamentoId=${calendarioPagamentoId}`)
export const registrarPagamentoComissao=(motoristaId:number,calendarioPagamentoId:number,dataPagamento:string,formaPagamento?:string,observacoes?:string)=>api<PagamentoComissao>(`/api/comissoes/${motoristaId}/pagamentos?calendarioPagamentoId=${calendarioPagamentoId}`,{method:'POST',body:JSON.stringify({dataPagamento,formaPagamento:formaPagamento||null,observacoes:observacoes||null})})
export const obterDetalheFuncionario=(motoristaId:number,calendarioPagamentoId:number)=>api<DetalheFuncionario>(`/api/equipe/${motoristaId}/detalhes?calendarioPagamentoId=${calendarioPagamentoId}`)
export async function baixarRelatorioComissoes(calendarioPagamentoId:number){const token=tokenStorage.get();const response=await fetch(apiUrl(`/api/comissoes/relatorio.csv?calendarioPagamentoId=${calendarioPagamentoId}`),{headers:token?{Authorization:`Bearer ${token}`}:{}});if(!response.ok)throw new ApiError('Não foi possível exportar o relatório de comissões.',response.status);const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='relatorio-comissoes.csv';link.click();URL.revokeObjectURL(url)}
