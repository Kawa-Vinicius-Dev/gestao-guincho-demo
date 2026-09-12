import { ApiError, tokenStorage } from './http'
import { apiUrl } from './url'

/**
 * Baixa um relatorio em CSV. A rota do backend e generica por tipo, entao o mesmo helper
 * serve para a DRE e para os outros relatorios que ja existem la.
 */
export async function baixarRelatorioCsv(tipo:string,inicio:string,fim:string,nomeArquivo:string){
  const token=tokenStorage.get()
  const response=await fetch(apiUrl(`/api/relatorios/${tipo}.csv?inicio=${inicio}&fim=${fim}`),
    {headers:token?{Authorization:`Bearer ${token}`}:{}})
  if(!response.ok)throw new ApiError('Não foi possível exportar o relatório.',response.status)
  const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a')
  link.href=url;link.download=nomeArquivo;link.click();URL.revokeObjectURL(url)
}
