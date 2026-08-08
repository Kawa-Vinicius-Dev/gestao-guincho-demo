package com.anaiv.fluxogestao.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public final class ComissaoDtos {
    private ComissaoDtos() {}
    public record AlimentacaoRequest(@NotNull LocalDate data,@NotNull @DecimalMin("0.01") BigDecimal valor,String observacoes) {}
    public record AlimentacaoResponse(Long id,Long motoristaId,LocalDate data,BigDecimal valor,String situacao,boolean aprovada,String observacoes) {}
    public record PagamentoComissaoRequest(@NotNull LocalDate dataPagamento,String formaPagamento,String observacoes) {}
    public record PagamentoComissaoResponse(Long id,Long motoristaId,Long calendarioPagamentoId,Long despesaId,
        BigDecimal valorPago,LocalDate dataPagamento,String formaPagamento,String observacoes,String pagoPor,OffsetDateTime criadoEm) {}
    public record ServicoComissaoResponse(Long id,String numeroOs,String especialidade,LocalDate dataAtendimento,String numeroOp,
        BigDecimal valorServico,BigDecimal comissaoServico) {}
    public record ServicoFuncionarioResponse(Long id,String numeroOs,LocalDate dataAtendimento,String especialidade,String viatura,
        String numeroOp,BigDecimal valorServico,String statusPagamento,boolean pagoNoPeriodo,BigDecimal comissaoGerada) {}
    public record ComissaoResponse(Long calendarioPagamentoId,String periodo,String funcionario,Long motoristaId,
        int quantidadeServicosPagos,BigDecimal producaoPaga,BigDecimal percentualComissao,BigDecimal comissaoBruta,
        BigDecimal alimentacaoAprovada,BigDecimal alimentacaoPendente,BigDecimal liquido,boolean aguardandoOp,
        List<ServicoComissaoResponse> servicos,List<AlimentacaoResponse> alimentacoes,PagamentoComissaoResponse pagamento) {}
    public record DetalheFuncionarioResponse(Long id,String nome,boolean ativo,String telefone,String email,String qra,
        List<String> veiculosUtilizados,int totalServicosPrestados,ComissaoResponse comissao,List<ServicoFuncionarioResponse> servicos) {}
    public record ResumoComissaoResponse(Long motoristaId,String funcionario,int quantidadeServicosPagos,BigDecimal producaoPaga,
        BigDecimal comissaoBruta,BigDecimal alimentacaoAprovada,BigDecimal liquido,PagamentoComissaoResponse pagamento) {}
}
