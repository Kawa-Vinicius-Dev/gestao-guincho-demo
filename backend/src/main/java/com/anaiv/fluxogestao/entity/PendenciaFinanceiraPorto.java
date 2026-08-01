package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity @Table(name="pendencias_financeiras_porto")
public class PendenciaFinanceiraPorto {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @OneToOne(optional=false) @JoinColumn(name="ordem_servico_id") private OrdemServicoPorto ordemServico;
    private String tipo="SERVICO_DEVOLVIDO"; private BigDecimal valor;
    @Column(name="data_devolucao") private LocalDate dataDevolucao;
    private String motivo;private String observacao;private String responsavel;private LocalDate prazo;
    @Column(name="referencia_porto") private String referenciaPorto;
    @Enumerated(EnumType.STRING) private EnumsFinanceiros.StatusPendenciaPorto status=EnumsFinanceiros.StatusPendenciaPorto.ABERTA;
    @ManyToOne @JoinColumn(name="importacao_id") private Importacao importacao;
    @Column(name="criado_em") private OffsetDateTime criadoEm=OffsetDateTime.now();
    protected PendenciaFinanceiraPorto() {}
    public PendenciaFinanceiraPorto(OrdemServicoPorto os, BigDecimal valor, LocalDate data, Importacao importacao){
        this.ordemServico=os;this.valor=valor;this.dataDevolucao=data;this.importacao=importacao;
    }
    public PendenciaFinanceiraPorto(OrdemServicoPorto os,String motivo,BigDecimal valor,LocalDate data,String observacao,String responsavel,LocalDate prazo,String referenciaPorto){
        ordemServico=os;atualizarTratativa(motivo,valor,data,observacao,responsavel,prazo,referenciaPorto);
    }
    public void atualizar(BigDecimal valor, LocalDate data, Importacao origem){if(valor!=null)this.valor=valor;if(data!=null)dataDevolucao=data;if(origem!=null)importacao=origem;}
    public void atualizarTratativa(String motivo,BigDecimal valor,LocalDate data,String observacao,String responsavel,LocalDate prazo,String referenciaPorto){
        tipo="SERVICO_PENDENTE";this.motivo=motivo;this.valor=valor;dataDevolucao=data;this.observacao=observacao;this.responsavel=responsavel;this.prazo=prazo;this.referenciaPorto=referenciaPorto;status=EnumsFinanceiros.StatusPendenciaPorto.ABERTA;}
    public void resolver(){status=EnumsFinanceiros.StatusPendenciaPorto.RESOLVIDA;}
    public Long getId(){return id;} public OrdemServicoPorto getOrdemServico(){return ordemServico;} public String getTipo(){return tipo;}
    public BigDecimal getValor(){return valor;} public LocalDate getDataDevolucao(){return dataDevolucao;}
    public EnumsFinanceiros.StatusPendenciaPorto getStatus(){return status;}
    public String getMotivo(){return motivo;} public String getObservacao(){return observacao;} public String getResponsavel(){return responsavel;}
    public LocalDate getPrazo(){return prazo;} public String getReferenciaPorto(){return referenciaPorto;}
}
