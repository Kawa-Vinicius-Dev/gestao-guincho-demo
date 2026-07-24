package com.anaiv.fluxogestao.dto;

import com.anaiv.fluxogestao.entity.EnumsFinanceiros.StatusImportacao;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public final class ImportacaoDtos {
    private ImportacaoDtos() {}
    public record ItemRequest(String protocolo, @NotNull LocalDate dataServico, String veiculoAtendido,
        String placaAtendida, String origem, String destino, @NotNull @DecimalMin("0.01") BigDecimal valor,
        @DecimalMin("0") BigDecimal kmRemunerado, Long motoristaId, Long veiculoId,
        @NotNull LocalDate previsaoPagamento, String observacoes) {}
    public record ItemResponse(Long id, String protocolo, LocalDate dataServico, String veiculoAtendido,
        String placaAtendida, String origem, String destino, BigDecimal valor, BigDecimal kmRemunerado,
        String motorista, String veiculo, LocalDate previsaoPagamento, String observacoes) {}
    public record ImportacaoResponse(Long id, String nomeArquivo, StatusImportacao status, String textoExtraido,
        String mensagemErro, int totalRegistros, OffsetDateTime criadoEm, OffsetDateTime confirmadoEm,
        List<ItemResponse> itens) {}
    public record ConfirmarRequest(@NotNull Long contratanteId) {}
}
