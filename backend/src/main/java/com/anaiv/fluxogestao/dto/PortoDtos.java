package com.anaiv.fluxogestao.dto;

import com.anaiv.fluxogestao.entity.EnumsFinanceiros.*;
import com.anaiv.fluxogestao.dto.PortoImportacaoDtos.AcaoLinhaPorto;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public final class PortoDtos {
    private PortoDtos() {}
    public record LinhaPreviaResponse(Map<String,String> dados,String hashRegistro,AcaoLinhaPorto acao,String mensagem) {}
    public record PreviaResponse(Long id,String nomeArquivo,TipoRelatorioPorto tipo,String status,int totalLinhas,
        List<LinhaPreviaResponse> linhas,List<String> erros,boolean requerOrdemPagamento) {}
    public record ConfirmarImportacaoRequest(Long ordemPagamentoId,Boolean confirmarDivergencias) {}
    public record ConfirmacaoResponse(Long importacaoId,TipoRelatorioPorto tipo,int importados,int ignorados) {}
    public record OrdemPagamentoResponse(Long id,String numero,BigDecimal valorTotal,String nomeCodigo,
        LocalDate dataPagamentoProgramada,BigDecimal valorRecebido,LocalDate dataRecebimento,String situacao,
        int quantidadeOrdensServico,BigDecimal valorOrdensServico,BigDecimal divergencia) {}
    public record OrdemServicoResponse(Long id,Long ordemPagamentoId,String ordemPagamento,String numero,BigDecimal valorTotal,
        String especialidade,String viatura,String socorrista,String qra,LocalDate dataAtendimento,
        BigDecimal valorKmExcedente,BigDecimal kmMortoEstimado) {}
    public record PendenciaResponse(String tipo,Long referenciaId,String referencia,BigDecimal valor,LocalDate data,String situacao) {}
    public record RecebimentoRequest(@NotNull @DecimalMin("0.01") BigDecimal valorRecebido,@NotNull LocalDate dataRecebimento) {}
}
