package com.anaiv.fluxogestao.dto;

import com.anaiv.fluxogestao.entity.EnumsFinanceiros.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class FinanceiroDtos {
    private FinanceiroDtos() {}

    public record ContaRequest(@NotNull Long contratanteId, String protocolo, @NotBlank String descricao,
        @NotNull @DecimalMin("0.01") BigDecimal valorPrevisto, @NotNull LocalDate dataCompetencia,
        @NotNull LocalDate vencimento, Long veiculoId, String observacoes, @NotNull OrigemLancamento origem) {}
    public record RecebimentoRequest(@NotNull @DecimalMin("0") BigDecimal valorRecebido, @NotNull LocalDate dataRecebimento) {}
    public record ContaResponse(Long id, CadastroDtos.ContratanteResponse contratante, String protocolo, String descricao,
        BigDecimal valorPrevisto, BigDecimal valorRecebido, BigDecimal diferenca, LocalDate dataCompetencia,
        LocalDate vencimento, LocalDate dataRecebimento, StatusContaReceber status,
        CadastroDtos.VeiculoResponse veiculo, String observacoes, OrigemLancamento origem, Long importacaoId) {}

    public record ReceitaRequest(Long contratanteId, Long categoriaId, @NotBlank String descricao,
        @NotNull @DecimalMin("0.01") BigDecimal valor, @NotNull LocalDate dataCompetencia,
        LocalDate dataRecebimento, @NotNull StatusReceita status, boolean recorrente, Long veiculoId, String observacoes) {}
    public record ReceitaResponse(Long id, String descricao, BigDecimal valor, LocalDate dataCompetencia,
        LocalDate dataRecebimento, StatusReceita status, boolean recorrente, String contratante,Long contratanteId,
        String categoria,Long categoriaId,String veiculo,Long veiculoId,Long contaReceberId,String observacoes,boolean manual) {}

    public record DespesaRequest(@NotBlank String descricao, @NotNull Long categoriaId,
        @NotNull @DecimalMin("0.01") BigDecimal valor, @NotNull LocalDate data, LocalDate vencimento,
        LocalDate dataPagamento, String formaPagamento, Long veiculoId, Long motoristaId, String protocolo,
        String comprovante, String observacoes, @NotNull StatusDespesa status) {}
    public record PagamentoDespesaRequest(@NotNull LocalDate dataPagamento, String formaPagamento,
        String comprovante, String observacoes) {}
    public record DespesaResponse(Long id, String descricao, String categoria, BigDecimal valor, LocalDate data,
        LocalDate vencimento, LocalDate dataPagamento, String formaPagamento, String veiculo, String motorista,
        String protocolo, String comprovante, String observacoes, StatusDespesa status, boolean aprovada,
        String criadoPor) {}

    public record LancamentoFinanceiroResponse(String id, String tipo, Long referenciaId, String descricao,
        String categoria, BigDecimal valor, LocalDate data, String status, boolean realizado,
        String veiculo, Long veiculoId, String motorista, String origem, String protocolo) {}

    public record QuilometragemRequest(@NotNull LocalDate data, @NotNull Long veiculoId, Long motoristaId,
        String protocolo, @NotNull @DecimalMin("0") BigDecimal hodometroInicial,
        @NotNull @DecimalMin("0") BigDecimal hodometroFinal,
        @NotNull @DecimalMin("0") BigDecimal quilometragemRemunerada, Boolean confirmarExcesso, String observacoes) {}
    public record QuilometragemResponse(Long id, LocalDate data, String veiculo, String motorista, String protocolo,
        BigDecimal hodometroInicial, BigDecimal hodometroFinal, BigDecimal quilometragemTotal,
        BigDecimal quilometragemRemunerada, BigDecimal kmMorto, BigDecimal custoPorKm,
        BigDecimal custoKmMorto, String observacoes) {}

    public record ResultadoVeiculo(Long veiculoId, String veiculo, BigDecimal receitas, BigDecimal despesas,
        BigDecimal resultado, BigDecimal kmMorto, BigDecimal custoKmMorto) {}
    public record DashboardResponse(BigDecimal receitaRecebida, BigDecimal receitaPrevista, BigDecimal totalReceber,
        BigDecimal totalAtrasado, BigDecimal despesasPagas, BigDecimal despesasPrevistas,
        BigDecimal saldoRealizado, BigDecimal saldoProjetado, BigDecimal lucroEstimado,
        long registrosImportados, BigDecimal quilometragemTotal, BigDecimal kmRemunerado,
        BigDecimal kmMorto, BigDecimal custoKmMorto, List<ResultadoVeiculo> resultadoPorVeiculo) {}
}
