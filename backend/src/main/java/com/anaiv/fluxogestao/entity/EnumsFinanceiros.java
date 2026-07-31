package com.anaiv.fluxogestao.entity;

public final class EnumsFinanceiros {
    private EnumsFinanceiros() {}

    public enum TipoCategoria { RECEITA, DESPESA }
    public enum StatusContaReceber { PENDENTE, RECEBIDO, ATRASADO, CANCELADO }
    public enum OrigemLancamento { MANUAL, IMPORTADA }
    public enum StatusReceita { PREVISTA, RECEBIDA, CANCELADA }
    public enum StatusDespesa { PENDENTE, PAGO, ATRASADO, REJEITADO }
    public enum StatusImportacao { PROCESSANDO, AGUARDANDO_CONFERENCIA, CONFIRMADA, CANCELADA, ERRO_LEITURA }
    public enum TipoRelatorioPorto { PREVISAO_RECEBER, OS_VINCULADAS, SERVICOS_DEVOLVIDOS }
    public enum StatusPendenciaPorto { ABERTA, RESOLVIDA }
}
