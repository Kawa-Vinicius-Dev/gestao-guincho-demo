const nomes:Record<string,string>={
  PENDENTE:'Pendente',RECEBIDO:'Recebido',ATRASADO:'Atrasado',CANCELADO:'Cancelado',
  PREVISTA:'Prevista',RECEBIDA:'Recebida',PAGO:'Pago',REJEITADO:'Rejeitado',
  PROCESSANDO:'Processando',AGUARDANDO_CONFERENCIA:'Aguardando conferência',
  CONFIRMADA:'Confirmada',CANCELADA:'Cancelada',ERRO_LEITURA:'Erro de leitura',
}
export function StatusBadge({status}:{status:string}){
  return <span className={`status-badge status-${status.toLowerCase()}`}>{nomes[status]??status}</span>
}
