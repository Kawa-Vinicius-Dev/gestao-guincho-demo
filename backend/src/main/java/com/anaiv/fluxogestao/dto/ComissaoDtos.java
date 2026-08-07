package com.anaiv.fluxogestao.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class ComissaoDtos {
    private ComissaoDtos() {}
    public record AlimentacaoRequest(@NotNull LocalDate data,@NotNull @DecimalMin("0.01") BigDecimal valor,String observacoes) {}
    public record AlimentacaoResponse(Long id,Long motoristaId,LocalDate data,BigDecimal valor,String situacao,boolean aprovada,String observacoes) {}
    public record ServicoComissaoResponse(Long id,String numeroOs,String especialidade,LocalDate dataAtendimento,String numeroOp,
        BigDecimal valorServico,BigDecimal comissaoServico) {}
    public record ComissaoResponse(Long calendarioPagamentoId,String periodo,String funcionario,Long motoristaId,
        int quantidadeServicosPagos,BigDecimal producaoPaga,BigDecimal percentualComissao,BigDecimal comissaoBruta,
        BigDecimal alimentacaoAprovada,BigDecimal alimentacaoPendente,BigDecimal liquido,boolean aguardandoOp,
        List<ServicoComissaoResponse> servicos,List<AlimentacaoResponse> alimentacoes) {}
    public record ResumoComissaoResponse(Long motoristaId,String funcionario,int quantidadeServicosPagos,BigDecimal producaoPaga,
        BigDecimal comissaoBruta,BigDecimal alimentacaoAprovada,BigDecimal liquido) {}
}
