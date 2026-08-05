package com.anaiv.fluxogestao.dto;

import com.anaiv.fluxogestao.entity.EnumsFinanceiros.*;
import com.anaiv.fluxogestao.dto.PortoImportacaoDtos.AcaoLinhaPorto;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

public final class PortoDtos {
    private PortoDtos() {}
    public record LinhaPreviaResponse(Map<String,String> dados,String hashRegistro,AcaoLinhaPorto acao,String mensagem) {}
    public record ResumoPreviaResponse(int linhasAnalisadas,int opsUnicas,int registrosNovos,int registrosExistentes,
        int registrosAtualizados,int duplicidades,int erros,BigDecimal valorTotal) {}
    public record PreviaResponse(Long id,String nomeArquivo,TipoRelatorioPorto tipo,String status,int totalLinhas,
        List<LinhaPreviaResponse> linhas,List<String> erros,boolean requerOrdemPagamento,ResumoPreviaResponse resumo) {}
    public record ConteudoImportacaoRequest(@NotBlank String conteudo) {}
    public record ConfirmarImportacaoRequest(Long ordemPagamentoId,Boolean confirmarDivergencias,
        MotivoJustificativaPorto motivoDivergencia,String justificativaDivergencia) {}
    public record ConfirmacaoResponse(Long importacaoId,TipoRelatorioPorto tipo,int importados,int ignorados,int novos,int atualizados,
        int receitasCriadas,int receitasAtualizadas,BigDecimal valorTotalRecebido,String quinzena,LocalDate dataPagamento,List<String> erros) {}
    public record OrdemPagamentoResponse(Long id,String numero,BigDecimal valorTotal,String nomeCodigo,
        LocalDate dataPagamentoProgramada,BigDecimal valorRecebido,LocalDate dataRecebimento,String situacao,
        int quantidadeOrdensServico,BigDecimal valorOrdensServico,BigDecimal divergencia,StatusConciliacaoPorto statusConciliacao,
        String statusPorto,String observacao) {}
    public record OrdemPagamentoRequest(@NotBlank String numero,@NotNull LocalDate dataPrevista,
        @NotNull @DecimalMin("0.00") BigDecimal valorInformado,@NotBlank String statusPorto,
        @NotNull SituacaoFinanceiraOpPorto situacaoFinanceira,@NotNull Boolean pagamentoConfirmado,
        LocalDate dataRecebimento,@Size(max=1000) String observacao) {}
    public record CalendarioRequest(@NotNull LocalDate dataPagamento,@NotNull LocalDate competenciaInicio,
        @NotNull LocalDate competenciaFim,@NotBlank String descricao,boolean ativo) {}
    public record CalendarioResponse(Long id,LocalDate dataPagamento,LocalDate competenciaInicio,LocalDate competenciaFim,String descricao,boolean ativo,
        OffsetDateTime criadoEm,OffsetDateTime atualizadoEm) {}
    public record PortoFiltros(LocalDate dataInicio,LocalDate dataFim,String numero,String situacaoPagamento,
        StatusConciliacaoPorto statusConciliacao,Boolean recebida,Boolean vencida,Boolean comComposicao,Boolean comDivergencia) {}
    public record PortoOsFiltros(LocalDate dataInicio,LocalDate dataFim,String numeroOs,String numeroOp,String especialidade,
        String socorrista,String qra,String viatura,StatusOperacionalPorto statusOperacional,StatusFinanceiroPorto statusFinanceiro,
        StatusConciliacaoPorto statusConciliacao) {}
    public record PortoDashboardFiltros(String periodo,String visao,LocalDate referencia,LocalDate dataInicio,LocalDate dataFim,
        String numeroOs,String numeroOp,String numero,String especialidade,String socorrista,String qra,String viatura,
        StatusOperacionalPorto statusOperacional,StatusFinanceiroPorto statusFinanceiro,StatusConciliacaoPorto statusConciliacao) {}
    public record ResumoGrupoResponse(String chave,long quantidade,BigDecimal valor) {}
    public record EvolucaoResponse(String periodo,long quantidade,BigDecimal valor) {}
    public record ResumoOrdensPagamentoResponse(
        long quantidadeTotalOps,BigDecimal valorTotalPrevisto,
        long quantidadeSemComposicao,BigDecimal valorSemComposicao,
        long quantidadeConciliadas,BigDecimal valorConciliadas,
        long quantidadeValorAbaixo,BigDecimal diferencaTotalAbaixo,
        long quantidadeValorAcima,BigDecimal diferencaTotalAcima,
        long quantidadeComDivergencia,BigDecimal valorTotalDivergencias,
        long quantidadePagamentoProgramado,BigDecimal valorProgramado,
        long quantidadeRecebidas,BigDecimal valorRecebido,
        long quantidadeAguardandoRecebimento,BigDecimal valorAguardandoRecebimento,
        long quantidadeVencidasNaoRecebidas,BigDecimal valorVencidoNaoRecebido,
        BigDecimal valorMedioPorOp,long quantidadeOrdensServico) {}
    public record OrdemServicoResponse(Long id,Long ordemPagamentoId,String ordemPagamento,String numero,BigDecimal valorTotal,
        String especialidade,String viatura,String socorrista,String qra,LocalDate dataAtendimento,
        BigDecimal valorKmExcedente,BigDecimal kmMortoEstimado,StatusOperacionalPorto statusOperacional,
        StatusFinanceiroPorto statusFinanceiro,LocalDate dataDevolucao,LocalDate dataFinalizacaoDevolucao,
        String prestador,String seguradora,String cliente,String placa,OffsetDateTime dataHoraAtendimento,
        LocalDate dataPrevistaOriginal,LocalDate dataEfetivaPagamento,int ciclosAtraso) {}
    public record PendenciaResponse(Long id,String tipo,Long referenciaId,String referencia,BigDecimal valor,LocalDate data,String situacao,
        String motivo,String observacao,String responsavel,LocalDate prazo,String referenciaPorto) {}
    public record PendenciaRequest(@NotBlank String numeroOs,@NotBlank String motivo,@NotNull @DecimalMin("0.00") BigDecimal valor,
        @NotNull LocalDate dataPendencia,@NotBlank @Size(max=1000) String observacao,@NotBlank String responsavel,
        @NotNull StatusFinanceiroPorto statusFinanceiro,LocalDate prazo,String referenciaPorto) {}
    public record RecebimentoRequest(@NotNull @DecimalMin("0.01") BigDecimal valorRecebido,@NotNull LocalDate dataRecebimento) {}
    public record JustificativaRequest(@NotNull MotivoJustificativaPorto motivo,@NotBlank @Size(max=1000) String observacao) {}
    public record JustificativaResponse(Long id,MotivoJustificativaPorto motivo,String observacao,BigDecimal valorDiferenca,String usuario,OffsetDateTime criadoEm) {}
    public record HistoricoResponse(Long id,String evento,String descricao,String usuario,OffsetDateTime criadoEm) {}
    public record OrdemPagamentoDetalheResponse(OrdemPagamentoResponse ordemPagamento,List<OrdemServicoResponse> ordensServico,
        List<JustificativaResponse> justificativas,List<HistoricoResponse> historico) {}
}
