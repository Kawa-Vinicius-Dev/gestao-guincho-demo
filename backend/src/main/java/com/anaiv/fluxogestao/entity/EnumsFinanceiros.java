package com.anaiv.fluxogestao.entity;

public final class EnumsFinanceiros {
    private EnumsFinanceiros() {}

    public enum TipoCategoria { RECEITA, DESPESA }
    public enum StatusContaReceber { PENDENTE, RECEBIDO, ATRASADO, CANCELADO }
    public enum OrigemLancamento { MANUAL, IMPORTADA }
    public enum StatusReceita { PREVISTA, RECEBIDA, CANCELADA }
    public enum StatusDespesa { PENDENTE, PAGO, ATRASADO, REJEITADO }
    public enum NaturezaDespesa { GERAL, ALIMENTACAO_FUNCIONARIO }
    public enum StatusImportacao { PROCESSANDO, AGUARDANDO_CONFERENCIA, CONFIRMADA, CANCELADA, ERRO_LEITURA }
    public enum TipoRelatorioPorto { PREVISAO_RECEBER, SERVICOS_GERAIS, SERVICOS_AGUARDANDO_LANCAMENTO, OS_VINCULADAS, SERVICOS_DEVOLVIDOS }
    public enum StatusPendenciaPorto { ABERTA, RESOLVIDA }
    public enum StatusOperacionalPorto { NORMAL, AGUARDANDO_LANCAMENTO, PROCESSADO, LIBERADO_APOS_ANALISE, PENDENTE_PORTO, DEVOLVIDO_FINALIZADO }
    public enum StatusFinanceiroPorto { AGUARDANDO_OP, PAGAMENTO_PROGRAMADO, A_CONFIRMAR, RECEBIDO, BLOQUEADO_PARA_PAGAMENTO, VALOR_DIVERGENTE }
    public enum SituacaoFinanceiraOpPorto { PROGRAMADO, A_CONFIRMAR, RECEBIDO }
    public enum StatusConciliacaoPorto { SEM_COMPOSICAO, CONCILIADA, VALOR_ABAIXO, VALOR_ACIMA, RECEBIDA_COM_DIVERGENCIA }
    public enum MotivoJustificativaPorto { SERVICO_NAO_INCLUIDO, DESCONTO, AJUSTE_PORTO, SERVICO_PENDENTE, SERVICO_DEVOLVIDO, DIVERGENCIA_VALOR, OUTRO }
}
