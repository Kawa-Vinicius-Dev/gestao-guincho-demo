export type Perfil = 'ADMINISTRADOR' | 'FUNCIONARIO'
export interface Usuario { id: number; nome: string; email: string; perfil: Perfil; ativo?: boolean }
export interface Veiculo { id: number; identificacao: string; placa: string; modelo?: string; custoPorKm: number; ativo: boolean }
export interface Contratante { id: number; nome: string; documento?: string; ativo: boolean }
export interface Categoria { id: number; nome: string; tipo: 'RECEITA' | 'DESPESA'; ativo: boolean }
export interface Motorista { id: number; nome: string; telefone?: string; documento?: string; usuarioId?: number; ativo: boolean }
export interface ContaReceber {
  id: number; contratante: Contratante; protocolo?: string; descricao: string; valorPrevisto: number;
  valorRecebido?: number; diferenca?: number; dataCompetencia: string; vencimento: string;
  dataRecebimento?: string; status: 'PENDENTE'|'RECEBIDO'|'ATRASADO'|'CANCELADO';
  veiculo?: Veiculo; observacoes?: string; origem: 'MANUAL'|'IMPORTADA'; importacaoId?: number
}
export interface Receita {
  id:number; descricao:string; valor:number; dataCompetencia:string; dataRecebimento?:string;
  status:'PREVISTA'|'RECEBIDA'|'CANCELADA'; recorrente:boolean; contratante?:string;
  categoria?:string; veiculo?:string; contaReceberId?:number
}
export interface Despesa {
  id:number; descricao:string; categoria:string; valor:number; data:string; vencimento?:string;
  dataPagamento?:string; formaPagamento?:string; veiculo?:string; motorista?:string; protocolo?:string;
  comprovante?:string; observacoes?:string; status:'PENDENTE'|'PAGO'|'ATRASADO'|'REJEITADO';
  aprovada:boolean; criadoPor:string
}
export interface Quilometragem {
  id:number; data:string; veiculo:string; motorista?:string; protocolo?:string; hodometroInicial:number;
  hodometroFinal:number; quilometragemTotal:number; quilometragemRemunerada:number; kmMorto:number;
  custoPorKm:number; custoKmMorto:number; observacoes?:string
}
export interface ResultadoVeiculo { veiculoId:number; veiculo:string; receitas:number; despesas:number; resultado:number; kmMorto:number; custoKmMorto:number }
export interface Dashboard {
  receitaRecebida:number; receitaPrevista:number; totalReceber:number; totalAtrasado:number;
  despesasPagas:number; despesasPrevistas:number; saldoRealizado:number; saldoProjetado:number;
  lucroEstimado:number; registrosImportados:number; quilometragemTotal:number; kmRemunerado:number;
  kmMorto:number; custoKmMorto:number; resultadoPorVeiculo:ResultadoVeiculo[]
}
export interface ItemImportacao {
  id:number; protocolo?:string; dataServico:string; veiculoAtendido?:string; placaAtendida?:string;
  origem?:string; destino?:string; valor:number; kmRemunerado?:number; motorista?:string;
  veiculo?:string; previsaoPagamento:string; observacoes?:string
}
export interface Importacao {
  id:number; nomeArquivo:string; status:'PROCESSANDO'|'AGUARDANDO_CONFERENCIA'|'CONFIRMADA'|'CANCELADA'|'ERRO_LEITURA';
  textoExtraido?:string; mensagemErro?:string; totalRegistros:number; criadoEm:string;
  confirmadoEm?:string; itens:ItemImportacao[]
}
