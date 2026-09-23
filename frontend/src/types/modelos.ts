import type { SituacaoDaOs } from '../dados/porto/listaOs'
export type Perfil = 'ADMINISTRADOR' | 'FUNCIONARIO'
/**
 * `id` aceita numero ou texto: no backend antigo era o id da tabela `usuarios`,
 * no Supabase e o uuid de auth.users. Nenhuma tela exibe esse valor — ele so
 * viaja em rota e comparacao —, entao os dois convivem durante a migracao.
 */
export interface Usuario { id: number | string; nome: string; email: string; perfil: Perfil; ativo?: boolean; senhaProvisoria?: boolean }
export interface SenhaRedefinida { usuarioId: number | string; nome: string; email: string; senhaProvisoria: string }
export interface Veiculo { id: number; identificacao: string; placa?: string; modelo?: string; custoPorKm: number; siglaPorto?: string; ativo: boolean }
export interface Contratante { id: number; nome: string; documento?: string; ativo: boolean }
export interface Categoria { id: number; nome: string; tipo: 'RECEITA' | 'DESPESA'; ativo: boolean
  /** O socorrista pode lancar despesa nesta categoria (Configuracoes > Categorias). */
  socorristaPode?: boolean }
/**
 * `usuarioId` aceita numero ou texto: no backend antigo era o id do usuario, no
 * Supabase e o uuid do perfil. A tela so pergunta se ha vinculo, nunca mostra o
 * valor, entao os dois servem e conviver evita tocar a tela na migracao.
 */
export interface Motorista { id: number; nome: string; telefone?: string; documento?: string; qra?:string; codigosPorto?: string[]; usuarioId?: number | string; ativo: boolean; veiculoId?: number; veiculo?: string; /** Comissao deste socorrista, 0 a 0,20. Vazio: vale o padrao da casa. */ percentualComissao?:number }
export interface ContaReceber {
  id: number; contratante: Contratante; protocolo?: string; descricao: string; valorPrevisto: number;
  valorRecebido?: number; diferenca?: number; dataCompetencia: string; vencimento: string;
  dataRecebimento?: string; status: 'PENDENTE'|'RECEBIDO'|'ATRASADO'|'CANCELADO';
  veiculo?: Veiculo; observacoes?: string; origem: 'MANUAL'|'IMPORTADA'; importacaoId?: number
}
export interface Receita {
  id:number; descricao:string; valor:number; dataCompetencia:string; dataRecebimento?:string;
  status:'PREVISTA'|'RECEBIDA'|'CANCELADA'; recorrente:boolean; contratante?:string;
  contratanteId?:number; categoria?:string; categoriaId?:number; veiculo?:string; veiculoId?:number; contaReceberId?:number; observacoes?:string; manual:boolean
}
export interface Despesa {
  id:number; descricao:string; categoria:string; categoriaId?:number; veiculoId?:number; motoristaId?:number; valor:number; data:string; vencimento?:string;
  dataPagamento?:string; formaPagamento?:string; veiculo?:string; motorista?:string; protocolo?:string; descontaComissao?:boolean;
  comprovante?:string; observacoes?:string; status:'PENDENTE'|'PAGO'|'ATRASADO'|'REJEITADO';
  aprovada:boolean; criadoPor:string; comprovanteNomeOriginal?:string; comprovanteTamanhoBytes?:number
  /** Veio de uma despesa fixa (custo fixo); sem isto, e custo variavel. */
  despesaRecorrenteId?:number
}
export interface DespesaRecorrente {
  id:number; descricao:string; categoria:string; categoriaId:number; valor:number; diaVencimento:number;
  veiculo?:string; veiculoId?:number; motorista?:string; motoristaId?:number; observacoes?:string; ativo:boolean
  /** Parcelas: 3/10 e totalParcelas 10, parcelaInicial 3. Sem total, a fixa nao acaba. */
  totalParcelas?:number; parcelaInicial?:number; proximaParcela?:number
}
export interface LancamentoRecorrente { mes:string; lancadas:number; jaExistiam:number; valorLancado:number; despesas:Despesa[]; encerradas?:number }
export interface LancamentoFinanceiro {
  id:string; tipo:'RECEITA'|'DESPESA'; referenciaId:number; descricao:string; categoria:string; valor:number;
  data:string; status:string; realizado:boolean; veiculo?:string; veiculoId?:number; motorista?:string; origem:string; protocolo?:string
  /** Preenchidos quando a linha e a comissao que o sistema lancou para uma OP. */
  motoristaId?:number; numeroOp?:string
}
export interface Quilometragem {
  id:number; data:string; veiculo:string; veiculoId?:number; motorista?:string; motoristaId?:number; protocolo?:string; hodometroInicial:number;
  hodometroFinal:number; quilometragemTotal:number; quilometragemRemunerada:number; kmMorto:number;
  custoPorKm:number; custoKmMorto:number; observacoes?:string
}
export interface ResultadoVeiculo { veiculoId:number; veiculo:string; receitas:number; despesas:number; resultado:number; kmMorto:number; custoKmMorto:number }
export interface Dashboard {
  receitaRecebida:number; receitaPrevista:number; totalAtrasado:number;
  despesasPagas:number; despesasPrevistas:number; saldoRealizado:number; saldoProjetado:number;
  registrosImportados:number; quilometragemTotal:number; kmRemunerado:number;
  kmMorto:number; custoKmMorto:number; resultadoPorVeiculo:ResultadoVeiculo[]
  producaoPaga:number; comissaoSobreProducao:number
  producaoPendente:number; servicosPendentes:number; servicosDoPeriodo:number
  comissaoAPagar:number;
  /** Receita de OS canceladas (tirar comissao): paga pela Porto, fora dos servicos. */
  receitaOsCanceladas?:number; osCanceladasComReceita?:number; despesasPorCategoria:GastoPorCategoria[]; resultadoPorSocorrista:ResultadoSocorrista[]
  despesasAcumuladasPorDia?:DespesaAcumuladaDia[]
  recebimentosForaDoPeriodo?:RecebimentoForaDoPeriodo[]
}
/**
 * Servico prestado no periodo que a Porto paga fora dele: o dinheiro existe,
 * so nao nesta janela. Sem dizer onde ele foi, a tela parece quebrada para quem
 * acabou de importar o relatorio.
 */
export interface RecebimentoForaDoPeriodo { dataPagamento:string; valor:number; servicos:number }
/** Para onde o dinheiro foi: despesa paga do periodo somada por categoria. */
export interface GastoPorCategoria { categoriaId:number; categoria:string; valor:number; participacao:number }
/** Movimento pago do dia e a soma progressiva usada na trajetória financeira. */
export interface DespesaAcumuladaDia { data:string; valorDia:number; acumulado:number; origens?:{ categoria:string; valor:number }[] }
export interface ResultadoSocorrista { motoristaId:number; socorrista:string; servicos:number; producao:number; comissao:number; despesas:number; custoTotal:number }
export interface ItemImportacao {
  id:number; protocolo?:string; dataServico:string; veiculoAtendido?:string; placaAtendida?:string;
  origem?:string; destino?:string; valor:number; kmRemunerado?:number; motorista?:string;
  veiculo?:string; previsaoPagamento:string; observacoes?:string
}
export type TipoRelatorioPorto = 'PREVISAO_RECEBER'|'OS_VINCULADAS'|'SERVICOS_DEVOLVIDOS'|'SERVICOS_GERAIS'|'SERVICOS_AGUARDANDO_LANCAMENTO'|'PAINEL_DIARIO'
export type AcaoLinhaPorto = 'IMPORTAR'|'ATUALIZAR'|'IGNORAR'|'ERRO'|'DIVERGENCIA'
export interface LinhaPreviaPorto { dados:Record<string,string>; hashRegistro:string; acao:AcaoLinhaPorto; mensagem?:string }
export interface ResumoPreviaPorto { linhasAnalisadas:number; opsUnicas:number; registrosNovos:number; registrosExistentes:number; registrosAtualizados:number; duplicidades:number; erros:number; valorTotal:number }
export interface OsSemSocorristaPorto { hashRegistro:string; numeroOs:string; socorrista?:string; qra?:string; data?:string }
export interface ReassociacaoOsPorto { numeroOs:string; opAtual:string; novaOp:string; valor:number }
export interface AnaliseOrdemPagamentoPorto { numero:string; existente:boolean; valorAtual?:number; somaArquivo:number; diferenca?:number; quantidadeReassociacoes:number; valorReassociacoes:number; reassociacoes:ReassociacaoOsPorto[] }
export interface PreviaPorto { id:number; nomeArquivo:string; tipo:TipoRelatorioPorto; status:string; totalLinhas:number; linhas:LinhaPreviaPorto[]; erros:string[]; requerOrdemPagamento:boolean; resumo?:ResumoPreviaPorto; analiseOrdemPagamento?:AnaliseOrdemPagamentoPorto; orfas?:OsSemSocorristaPorto[]; osSemSocorrista?:string[] }
/** OS do Diario que a OP nao trouxe: fica aguardando a proxima OP. */
export interface OsNaoEncontradaPorto { id:number; numero:string; dataAtendimento?:string; socorrista?:string; viatura?:string; valorManual?:number }
/** OS paga pela OP num valor diferente do que foi informado a mao. */
export interface OsDivergentePorto { id:number; numero:string; valorManual:number; valorOp:number; diferenca:number }
export interface ConfirmacaoPorto { importacaoId:number; tipo:TipoRelatorioPorto; importados:number; ignorados:number; novos?:number; atualizados?:number; receitasCriadas:number; receitasAtualizadas:number; valorTotalRecebido:number; quinzena?:string; dataPagamento?:string; erros:string[]; osSemSocorrista?:string[]; viaturasNovas?:string[]; naoEncontradas?:OsNaoEncontradaPorto[]; divergentes?:OsDivergentePorto[] }
export type StatusConciliacaoPorto='SEM_COMPOSICAO'|'CONCILIADA'|'VALOR_ABAIXO'|'VALOR_ACIMA'|'RECEBIDA_COM_DIVERGENCIA'
export type StatusOperacionalPorto='NORMAL'|'AGUARDANDO_LANCAMENTO'|'PROCESSADO'|'LIBERADO_APOS_ANALISE'|'PENDENTE_PORTO'|'DEVOLVIDO_FINALIZADO'|'CANCELADO'
export type StatusFinanceiroPorto='AGUARDANDO_OP'|'PAGAMENTO_PROGRAMADO'|'A_CONFIRMAR'|'RECEBIDO'|'BLOQUEADO_PARA_PAGAMENTO'|'VALOR_DIVERGENTE'
export interface OrdemPagamentoPorto { id:number; numero:string; valorTotal:number; nomeCodigo?:string; dataPagamentoProgramada?:string; valorRecebido?:number; dataRecebimento?:string; situacao:'PROGRAMADO'|'A_CONFIRMAR'|'RECEBIDO'; quantidadeOrdensServico:number; valorOrdensServico:number; divergencia:number; statusConciliacao:StatusConciliacaoPorto; statusPorto?:string; observacao?:string; calendarioPagamentoId?:number; periodoInicio?:string; periodoFim?:string; periodoFinanceiro?:string ; /** Quinzena como a Porto declara (Data início e Data entrega). Ausente: o período vem das OS. */ quinzenaInicio?:string; quinzenaEntrega?:string }
export interface OrdemServicoPorto { id:number; ordemPagamentoId?:number; ordemPagamento?:string; numero:string; valorTotal:number; especialidade?:string; viatura?:string; socorrista?:string; qra?:string; dataAtendimento?:string; valorKmExcedente?:number; kmMortoEstimado?:number; statusOperacional:StatusOperacionalPorto; statusFinanceiro:StatusFinanceiroPorto; dataDevolucao?:string; dataFinalizacaoDevolucao?:string; prestador?:string; seguradora?:string; cliente?:string; placa?:string; dataHoraAtendimento?:string; dataPrevistaOriginal?:string; dataEfetivaPagamento?:string; ciclosAtraso:number; motoristaId?:number; motorista?:string; sugestaoMotoristaId?:number; sugestaoMotorista?:string; sugestaoAmbigua?:boolean; atrasadaNoCiclo?:boolean }
export interface PendenciaOsPorto { id:number; numeroOs:string; dataAtendimento?:string; seguradora?:string; especialidade?:string; siglaViatura?:string; socorrista?:string; motoristaId?:number; valorTotal:number; numeroOp?:string; semValor:boolean; semSocorrista:boolean; semViatura:boolean;
  /** Em que pé está a conciliação com a OP — a mesma situação das outras telas. */
  situacao?:SituacaoDaOs; competenciaInicio?:string; competenciaFim?:string;
  valorManual?:number; divergencia?:number;
  /** Linha sem nada a preencher: só existe para ser conferida e aberta. */
  apenasConferir?:boolean }
export interface AcertoPendenciaOsPorto { id:number; valorTotal?:number; motoristaId?:number; siglaViatura?:string }
export interface PendenciaPorto { id?:number; tipo:'RECEBIMENTO_OP'|'SERVICO_DEVOLVIDO'|'SERVICO_PENDENTE'|'OS_SEM_SOCORRISTA'; referenciaId:number; referencia:string; valor:number; data?:string; situacao:string; motivo?:string; observacao?:string; responsavel?:string; prazo?:string; referenciaPorto?:string }
export interface ResumoOpsPorto { quantidadeTotalOps:number; valorTotalPrevisto:number; quantidadeSemComposicao:number; valorSemComposicao:number; quantidadeConciliadas:number; valorConciliadas:number; quantidadeValorAbaixo:number; diferencaTotalAbaixo:number; quantidadeValorAcima:number; diferencaTotalAcima:number; quantidadeComDivergencia:number; valorTotalDivergencias:number; quantidadePagamentoProgramado:number; valorProgramado:number; quantidadeRecebidas:number; valorRecebido:number; quantidadeAguardandoRecebimento:number; valorAguardandoRecebimento:number; quantidadeVencidasNaoRecebidas:number; valorVencidoNaoRecebido:number; valorMedioPorOp:number; quantidadeOrdensServico:number }
export interface ResumoGrupoPorto { chave:string; quantidade:number; valor:number }
export interface DashboardPorto extends ResumoOpsPorto { quantidadeTotalServicos:number; valorTotalRealizado:number; quantidadeAguardandoOp:number; valorAguardandoOp:number; quantidadeServicosPagamentoProgramado:number; valorServicosPagamentoProgramado:number; valorPrevistoAReceber:number; valorConciliado:number; valorEfetivamenteRecebido:number; quantidadeServicosPendentes:number; valorServicosPendentes:number; quantidadeServicosDevolvidos:number; porEspecialidade:ResumoGrupoPorto[]; porSocorrista:ResumoGrupoPorto[]; periodoInicio?:string; periodoFim?:string; periodo?:string; visao?:string }
export interface PontoSeriePorto { inicio:string; produzido:number; servicos:number; recebido:number; programado:number }
export interface OpDestaquePorto { id:number; numero:string; valorTotal:number; valorRecebido?:number; periodoInicio?:string; periodoFim?:string; dataPagamentoProgramada?:string; dataRecebimento?:string; situacaoFinanceira:string; statusConciliacao:StatusConciliacaoPorto; quantidadeOrdensServico:number; divergencia:number; vencida:boolean }
/** Uma barra do faturamento por socorrista ou por viatura. `semVinculo` e a linha das OS sem dono. */
export interface LinhaFaturamentoPorto { chave:string; rotulo:string; valor:number; quantidade:number; semVinculo:boolean; valorPrevisto?:number; semValor?:number }
/** Em que pé está a conciliação da competência: o que ainda não fechou com a OP. */
export interface ConciliacaoPorto { semValor:number; comValorManual:number; valorManual:number; aguardandoProximaOp:number; valorAguardandoProximaOp:number; divergentes:number; valorDivergencia:number; valorPrevisto:number }
export interface PendenciasVinculoPorto { quantidade:number; semSocorrista:number; semViatura:number }
export interface DashboardAltoNivelPorto extends DashboardPorto { grao:'DIA'|'SEMANA'|'MES'; serie:PontoSeriePorto[]; opsDestaque:OpDestaquePorto[]; faturamentoPorSocorrista:LinhaFaturamentoPorto[]; faturamentoPorViatura:LinhaFaturamentoPorto[]; pendenciasVinculo:PendenciasVinculoPorto; conciliacao?:ConciliacaoPorto }
export interface JustificativaPorto { id:number; motivo:string; observacao:string; valorDiferenca?:number; usuario:string; criadoEm:string }
export interface HistoricoPorto { id:number; evento:string; descricao:string; usuario?:string; criadoEm:string }
export interface DetalheOpPorto { ordemPagamento:OrdemPagamentoPorto; ordensServico:OrdemServicoPorto[]; justificativas:JustificativaPorto[]; historico?:HistoricoPorto[] }
export interface CalendarioPorto { id:number; dataPagamento:string; competenciaInicio:string; competenciaFim:string; descricao:string; ativo:boolean; estimado?:boolean; criadoEm:string; atualizadoEm:string }
export interface AlimentacaoComissao { id:number; motoristaId:number; data:string; valor:number; situacao:string; aprovada:boolean; observacoes?:string }
export interface ServicoComissao { id:number; numeroOs:string; especialidade?:string; dataAtendimento:string; numeroOp:string; valorServico:number; comissaoServico:number }
export interface PagamentoComissao { id:number; motoristaId:number; calendarioPagamentoId?:number; ordemPagamentoId?:number; despesaId:number; valorPago:number; dataPagamento:string; formaPagamento?:string; observacoes?:string; pagoPor:string; criadoEm:string }
export interface Comissao { calendarioPagamentoId?:number; ordemPagamentoId?:number; numeroOp?:string; periodoInicio?:string; periodoFim?:string; periodo:string; socorrista:string; motoristaId:number; quantidadeServicosPagos:number; producaoPaga:number; percentualComissao:number; comissaoBruta:number; descontos:number; descontosPendentes:number; liquido:number; aguardandoOp:boolean; servicos:ServicoComissao[]; gastos:DespesaDoSocorrista[]; pagamento?:PagamentoComissao }
export interface ResumoComissao { motoristaId:number; socorrista:string; quantidadeServicosPagos:number; producaoPaga:number; comissaoBruta:number; descontos:number; liquido:number; pagamento?:PagamentoComissao }
export interface ServicoSocorrista { id:number; numeroOs:string; dataAtendimento?:string; especialidade?:string; viatura?:string; numeroOp?:string; valorServico:number; statusPagamento:'PAGO'|'PAGO_EM_OUTRO_PERIODO'|'AGUARDANDO_PAGAMENTO'; pagoNoPeriodo:boolean; comissaoGerada?:number; /** OS que o administrador isentou: continua na producao, nao gera comissao. */ semComissao?:boolean }
/**
 * Um gasto lancado no nome do socorrista. `descontaDaComissao` e o que separa
 * as duas leituras: todo gasto ligado a ele aparece na tela dele, mas so o que
 * foi marcado para descontar sai da comissao — mostrar nao e cobrar.
 */
export interface DespesaDoSocorrista { id:number; descricao:string; data:string; valor:number; categoria:string; veiculo?:string; situacao:Despesa['status']; aprovada:boolean; descontaDaComissao:boolean; descontaEmOutraOp?:boolean; observacoes?:string }
export interface DetalheSocorrista { id:number; nome:string; ativo:boolean; telefone?:string; email?:string; qra?:string; veiculosUtilizados:string[]; totalServicosPrestados:number; comissao:Comissao; servicos:ServicoSocorrista[]; despesas:DespesaDoSocorrista[] }
