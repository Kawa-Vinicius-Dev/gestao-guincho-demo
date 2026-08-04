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
export type TipoRelatorioPorto = 'PREVISAO_RECEBER'|'OS_VINCULADAS'|'SERVICOS_DEVOLVIDOS'|'SERVICOS_GERAIS'|'SERVICOS_AGUARDANDO_LANCAMENTO'
export type AcaoLinhaPorto = 'IMPORTAR'|'ATUALIZAR'|'IGNORAR'|'ERRO'|'DIVERGENCIA'
export interface LinhaPreviaPorto { dados:Record<string,string>; hashRegistro:string; acao:AcaoLinhaPorto; mensagem?:string }
export interface ResumoPreviaPorto { linhasAnalisadas:number; opsUnicas:number; registrosNovos:number; registrosExistentes:number; registrosAtualizados:number; duplicidades:number; erros:number; valorTotal:number }
export interface PreviaPorto { id:number; nomeArquivo:string; tipo:TipoRelatorioPorto; status:string; totalLinhas:number; linhas:LinhaPreviaPorto[]; erros:string[]; requerOrdemPagamento:boolean; resumo?:ResumoPreviaPorto }
export interface ConfirmacaoPorto { importacaoId:number; tipo:TipoRelatorioPorto; importados:number; ignorados:number; novos?:number; atualizados?:number }
export type StatusConciliacaoPorto='SEM_COMPOSICAO'|'CONCILIADA'|'VALOR_ABAIXO'|'VALOR_ACIMA'|'RECEBIDA_COM_DIVERGENCIA'
export type StatusOperacionalPorto='NORMAL'|'AGUARDANDO_LANCAMENTO'|'PROCESSADO'|'LIBERADO_APOS_ANALISE'|'PENDENTE_PORTO'|'DEVOLVIDO_FINALIZADO'
export type StatusFinanceiroPorto='AGUARDANDO_OP'|'PAGAMENTO_PROGRAMADO'|'A_CONFIRMAR'|'RECEBIDO'|'BLOQUEADO_PARA_PAGAMENTO'|'VALOR_DIVERGENTE'
export interface OrdemPagamentoPorto { id:number; numero:string; valorTotal:number; nomeCodigo?:string; dataPagamentoProgramada?:string; valorRecebido?:number; dataRecebimento?:string; situacao:'PROGRAMADO'|'A_CONFIRMAR'|'RECEBIDO'; quantidadeOrdensServico:number; valorOrdensServico:number; divergencia:number; statusConciliacao:StatusConciliacaoPorto; statusPorto?:string; observacao?:string }
export interface OrdemServicoPorto { id:number; ordemPagamentoId?:number; ordemPagamento?:string; numero:string; valorTotal:number; especialidade?:string; viatura?:string; socorrista?:string; qra?:string; dataAtendimento?:string; valorKmExcedente?:number; kmMortoEstimado?:number; statusOperacional:StatusOperacionalPorto; statusFinanceiro:StatusFinanceiroPorto; dataDevolucao?:string; dataFinalizacaoDevolucao?:string; prestador?:string; seguradora?:string; cliente?:string; placa?:string; dataHoraAtendimento?:string; dataPrevistaOriginal?:string; dataEfetivaPagamento?:string; ciclosAtraso:number }
export interface PendenciaPorto { id?:number; tipo:'RECEBIMENTO_OP'|'SERVICO_DEVOLVIDO'|'SERVICO_PENDENTE'; referenciaId:number; referencia:string; valor:number; data?:string; situacao:string; motivo?:string; observacao?:string; responsavel?:string; prazo?:string; referenciaPorto?:string }
export interface ResumoOpsPorto { quantidadeTotalOps:number; valorTotalPrevisto:number; quantidadeSemComposicao:number; valorSemComposicao:number; quantidadeConciliadas:number; valorConciliadas:number; quantidadeValorAbaixo:number; diferencaTotalAbaixo:number; quantidadeValorAcima:number; diferencaTotalAcima:number; quantidadeComDivergencia:number; valorTotalDivergencias:number; quantidadePagamentoProgramado:number; valorProgramado:number; quantidadeRecebidas:number; valorRecebido:number; quantidadeAguardandoRecebimento:number; valorAguardandoRecebimento:number; quantidadeVencidasNaoRecebidas:number; valorVencidoNaoRecebido:number; valorMedioPorOp:number; quantidadeOrdensServico:number }
export interface ResumoGrupoPorto { chave:string; quantidade:number; valor:number }
export interface DashboardPorto extends ResumoOpsPorto { quantidadeTotalServicos:number; valorTotalRealizado:number; quantidadeAguardandoOp:number; valorAguardandoOp:number; quantidadeServicosPagamentoProgramado:number; valorServicosPagamentoProgramado:number; valorPrevistoAReceber:number; valorConciliado:number; valorEfetivamenteRecebido:number; quantidadeServicosPendentes:number; valorServicosPendentes:number; quantidadeServicosDevolvidos:number; porEspecialidade:ResumoGrupoPorto[]; porSocorrista:ResumoGrupoPorto[]; periodoInicio?:string; periodoFim?:string; periodo?:string; visao?:string }
export interface JustificativaPorto { id:number; motivo:string; observacao:string; valorDiferenca?:number; usuario:string; criadoEm:string }
export interface HistoricoPorto { id:number; evento:string; descricao:string; usuario?:string; criadoEm:string }
export interface DetalheOpPorto { ordemPagamento:OrdemPagamentoPorto; ordensServico:OrdemServicoPorto[]; justificativas:JustificativaPorto[]; historico?:HistoricoPorto[] }
export interface CalendarioPorto { id:number; dataPagamento:string; descricao:string; ativo:boolean; criadoEm:string; atualizadoEm:string }
